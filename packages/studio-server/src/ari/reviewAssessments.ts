import { randomUUID } from "node:crypto";
import { choice, flag, record, requiredText, rows, text } from "./notebookValues.js";
import type { ReviewPackage } from "./reviewPackage.js";

/**
 * Ari · attributed review assessments (D4)
 *
 * An assessment is somebody's stated judgement about ONE review package, in
 * ONE of four separate categories. It is not a measurement and it is not an
 * approval. The rules that make it honest live here:
 *
 * - Every row names a reviewer, a reviewer type and what was actually looked
 *   at. `test_data` exists so an automated journey can record a row without
 *   ever appearing as a human or an external agent's opinion.
 * - `technical` is deliberately NOT a reviewer type. Frame extraction, ffprobe
 *   and this repository's own browser journeys are technical work; they are
 *   reported beside assessments, never inside one. In particular
 *   `measured.audio === false` says the render carried no audio stream, which
 *   leaves the audio assessment MISSING rather than passed.
 * - The declared coverage is copied from the package verbatim and the checked
 *   boundaries are indexes into that package's own boundary list, so nobody can
 *   claim to have inspected boundaries a `*-partial` package never contained.
 * - The package's version and source revision are copied in at record time.
 *   When the project's current revision moves past that value the assessment
 *   stays in history and is reported stale; it is never rewritten or dropped.
 */
export const ASSESSMENT_CATEGORIES = ["message", "layout", "motion", "audio"] as const;
export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];
const reviewerTypes = ["human", "external_agent", "test_data"] as const;
export type ReviewerType = (typeof reviewerTypes)[number];
const assessmentVerdicts = ["ok", "fix"] as const;
export type AssessmentVerdict = (typeof assessmentVerdicts)[number];
export type StaleReason = "source_changed" | "package_unreadable";

export interface ReviewAssessment {
  id: string;
  packageId: string;
  /** The frozen version the package was rendered from. */
  versionId: string;
  /** The package's own source revision; staleness is measured against this. */
  packageRevision: string;
  /** The package's declared coverage, copied verbatim; never widened here. */
  packageCoverage: string;
  category: AssessmentCategory;
  reviewer: string;
  reviewerType: ReviewerType;
  createdAt: string;
  /** The reviewer's own statement, not something the studio can observe. */
  wholeVideoWatched: boolean;
  /** `all` or indexes into this package's boundary list. */
  checkedBoundaries: "all" | number[];
  verdict: AssessmentVerdict;
  text: string;
}

function checked(value: unknown, boundaryCount: number): "all" | number[] {
  if (value === "all") return "all";
  const list = rows(value).map((item) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= boundaryCount)
      throw new Error("Tarkastettu raja ei kuulu tähän tarkistuspakettiin.");
    return item;
  });
  return [...new Set(list)].sort((a, b) => a - b);
}

/** Bind one new assessment to a verified manifest. The manifest is authoritative. */
export function bindAssessment(manifest: ReviewPackage, value: unknown): ReviewAssessment {
  const input = record(value);
  if (input.versionId !== undefined && input.versionId !== manifest.versionId)
    throw new Error("Arvio ei vastaa tarkistuspaketin versiota.");
  return {
    id: randomUUID(),
    packageId: manifest.id,
    versionId: manifest.versionId,
    packageRevision: manifest.sourceRevision,
    packageCoverage: manifest.coverage,
    category: choice(input.category, ASSESSMENT_CATEGORIES),
    reviewer: requiredText(input.reviewer, 120),
    reviewerType: choice(input.reviewerType, reviewerTypes),
    createdAt: new Date().toISOString(),
    wholeVideoWatched: flag(input.wholeVideoWatched),
    checkedBoundaries: checked(input.checkedBoundaries, manifest.boundaries.length),
    verdict: choice(input.verdict, assessmentVerdicts),
    text: requiredText(input.text),
  };
}

/** Re-read a stored row without trusting the file it came from. */
export function parseAssessment(value: unknown): ReviewAssessment {
  const item = record(value);
  const boundaries = item.checkedBoundaries;
  return {
    id: text(item.id, 80),
    packageId: text(item.packageId, 80),
    versionId: text(item.versionId, 80),
    packageRevision: text(item.packageRevision, 64),
    packageCoverage: text(item.packageCoverage, 80),
    category: choice(item.category, ASSESSMENT_CATEGORIES),
    reviewer: requiredText(item.reviewer, 120),
    reviewerType: choice(item.reviewerType, reviewerTypes),
    createdAt: text(item.createdAt, 40),
    wholeVideoWatched: flag(item.wholeVideoWatched),
    checkedBoundaries:
      boundaries === "all"
        ? "all"
        : rows(boundaries).map((index) => {
            if (typeof index !== "number" || !Number.isInteger(index) || index < 0)
              throw new Error("Tarkastettu raja ei kelpaa.");
            return index;
          }),
    verdict: choice(item.verdict, assessmentVerdicts),
    text: requiredText(item.text),
  };
}

export interface AssessedPackage {
  id: string;
  /** False when the package can no longer be listed or its manifest validated. */
  readable: boolean;
}
export interface AssessmentRow extends ReviewAssessment {
  stale: boolean;
  staleReasons: StaleReason[];
}
export interface CategoryStatus {
  category: AssessmentCategory;
  /** `missing` is the only honest word for a category nobody assessed. */
  status: "missing" | "current" | "stale";
  assessments: AssessmentRow[];
}

function reasons(
  assessment: ReviewAssessment,
  revision: string,
  known: Map<string, AssessedPackage>,
): StaleReason[] {
  const found: StaleReason[] = [];
  if (assessment.packageRevision !== revision) found.push("source_changed");
  if (known.get(assessment.packageId)?.readable !== true) found.push("package_unreadable");
  return found;
}

/**
 * Group stored assessments by package and category. Every one of the four
 * categories is always reported, so an unassessed category shows up as
 * `missing` instead of silently not existing.
 */
export function describeAssessments(
  assessments: readonly ReviewAssessment[],
  packages: readonly AssessedPackage[],
  revision: string,
): { packageId: string; categories: CategoryStatus[] }[] {
  const known = new Map(packages.map((item) => [item.id, item]));
  const ids = [
    ...new Set([...packages.map((item) => item.id), ...assessments.map((a) => a.packageId)]),
  ];
  return ids.map((packageId) => ({
    packageId,
    categories: ASSESSMENT_CATEGORIES.map((category) => {
      const found = assessments
        .filter((item) => item.packageId === packageId && item.category === category)
        .map<AssessmentRow>((item) => {
          const staleReasons = reasons(item, revision, known);
          return { ...item, stale: staleReasons.length > 0, staleReasons };
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const newest = found.at(-1);
      return {
        category,
        status: !newest ? "missing" : newest.stale ? "stale" : "current",
        assessments: found,
      };
    }),
  }));
}
