/**
 * Ari · version-bound local approval (D7)
 *
 * An approval is one named person's decision about ONE frozen version, and it
 * is local. It is not a customer release, it does not publish anything, and no
 * model produces it. The rules that keep it honest:
 *
 * - Approving requires a review package that still reads, bound to that exact
 *   version, and a stated position on all four assessment categories: either
 *   somebody assessed it, or it is explicitly recorded as `ei sovellu` with a
 *   reason. A technical measurement never fills a category (see
 *   `reviewAssessments.ts`), so a silent render cannot approve itself.
 * - A version that was rejected stays rejected. Move forward with a new
 *   version rather than re-deciding the same bytes.
 * - The package's own source revision is copied in. When the project's sources
 *   move past it the approval is reported stale, with its reason, and stays in
 *   history — the same `source_changed` rule the assessments already use.
 */
import { randomUUID } from "node:crypto";
import { choice, record, requiredText, rows, text } from "./notebookValues.js";
import type { AssessedPackage, ReviewAssessment, StaleReason } from "./reviewAssessments.js";
import { ASSESSMENT_CATEGORIES, type AssessmentCategory } from "./reviewAssessments.js";
import type { ReviewPackage } from "./reviewPackage.js";

const decisions = ["approved", "rejected"] as const;
export type ApprovalDecision = (typeof decisions)[number];
/** Same three as an assessment: `technical` is not a decision-maker. */
const approverTypes = ["human", "external_agent", "test_data"] as const;

const categoryNames: Record<AssessmentCategory, string> = {
  message: "Viesti",
  layout: "Ulkoasu",
  motion: "Liike",
  audio: "Ääni",
};

export interface VersionApproval {
  id: string;
  versionId: string;
  /** The reviewed package; null is only possible on a rejection. */
  packageId: string | null;
  /** The package's source revision, or the project's when nothing was reviewed. */
  sourceRevision: string;
  decision: ApprovalDecision;
  approver: string;
  approverType: (typeof approverTypes)[number];
  createdAt: string;
  /** Categories nobody assessed, stated as not applicable with a reason. */
  notApplicable: { category: AssessmentCategory; reason: string }[];
  note: string;
}
export interface ApprovalRow extends VersionApproval {
  stale: boolean;
  staleReasons: StaleReason[];
}

function parseNotApplicable(value: unknown) {
  return rows(value ?? []).map((entry) => {
    const item = record(entry);
    return {
      category: choice(item.category, ASSESSMENT_CATEGORIES),
      reason: requiredText(item.reason, 2000),
    };
  });
}
export function parseApproval(value: unknown): VersionApproval {
  const item = record(value);
  return {
    id: text(item.id, 80),
    versionId: text(item.versionId, 80),
    packageId: item.packageId === null ? null : text(item.packageId, 80),
    sourceRevision: text(item.sourceRevision, 64),
    decision: choice(item.decision, decisions),
    approver: requiredText(item.approver, 120),
    approverType: choice(item.approverType, approverTypes),
    createdAt: text(item.createdAt, 40),
    notApplicable: parseNotApplicable(item.notApplicable),
    note: requiredText(item.note),
  };
}
/** The four categories a version must have a stated position on before approval. */
function missingCategories(
  assessments: readonly ReviewAssessment[],
  packageId: string,
  excused: VersionApproval["notApplicable"],
) {
  return ASSESSMENT_CATEGORIES.filter(
    (category) =>
      !assessments.some((item) => item.packageId === packageId && item.category === category) &&
      !excused.some((item) => item.category === category),
  );
}
export interface ApprovalInputs {
  assessments: readonly ReviewAssessment[];
  approvals: readonly VersionApproval[];
  /** The verified manifest, or null when nothing was prepared for this version. */
  manifest: ReviewPackage | null;
  revision: string;
}
/** Bind one new decision. Refuses rather than approving anything unproven. */
export function bindApproval(value: unknown, inputs: ApprovalInputs): VersionApproval {
  const input = record(value);
  const decision = choice(input.decision, decisions);
  const versionId = requiredText(input.versionId, 80);
  const excused = parseNotApplicable(input.notApplicable);
  const { manifest } = inputs;
  if (decision === "approved") {
    if (!manifest)
      throw new Error(
        "Hyväksyntä vaatii luettavan tarkistuspaketin tälle versiolle. Valmistele paketti ensin.",
      );
    if (manifest.versionId !== versionId)
      throw new Error("Tarkistuspaketti ei koske valittua versiota.");
    if (latestDecision(inputs.approvals, versionId) === "rejected")
      throw new Error("Hylättyä versiota ei voi merkitä hyväksytyksi. Tee uusi versio.");
    const missing = missingCategories(inputs.assessments, manifest.id, excused);
    if (missing.length)
      throw new Error(
        `Hyväksyntä vaatii kannanoton kaikkiin neljään osa-alueeseen. Puuttuu: ${missing
          .map((category) => categoryNames[category])
          .join(
            ", ",
          )}. Kirjaa arvio tai merkitse osa-alue perustellusti "ei sovellu". Tekninen mittaus ei riitä.`,
      );
  }
  return {
    id: randomUUID(),
    versionId,
    packageId: manifest?.id ?? null,
    sourceRevision: manifest?.sourceRevision ?? inputs.revision,
    decision,
    approver: requiredText(input.approver, 120),
    approverType: choice(input.approverType, approverTypes),
    createdAt: new Date().toISOString(),
    notApplicable: excused,
    note: requiredText(input.note),
  };
}
function latestDecision(approvals: readonly VersionApproval[], versionId: string) {
  return approvals.filter((item) => item.versionId === versionId).at(-1)?.decision ?? null;
}
function staleReasons(
  approval: VersionApproval,
  revision: string,
  known: Map<string, AssessedPackage>,
): StaleReason[] {
  const found: StaleReason[] = [];
  if (approval.sourceRevision !== revision) found.push("source_changed");
  if (approval.packageId !== null && known.get(approval.packageId)?.readable !== true)
    found.push("package_unreadable");
  return found;
}
/**
 * Every stored decision with its current standing, plus the one approval — if
 * any — that still describes the sources as they are right now.
 */
export function describeApprovals(
  approvals: readonly VersionApproval[],
  packages: readonly AssessedPackage[],
  revision: string,
) {
  const known = new Map(packages.map((item) => [item.id, item]));
  const rowsOut = approvals.map<ApprovalRow>((item) => {
    const reasons = staleReasons(item, revision, known);
    return { ...item, stale: reasons.length > 0, staleReasons: reasons };
  });
  const current =
    rowsOut.filter((item) => item.decision === "approved" && !item.stale).at(-1) ?? null;
  // Source revisions an approval still stands for, so a receipt can name an
  // EARLIER export honestly instead of judging it by today's revision.
  const approvedRevisions = [
    ...new Set(
      rowsOut
        .filter(
          (item) =>
            item.decision === "approved" && !item.staleReasons.includes("package_unreadable"),
        )
        .map((item) => item.sourceRevision),
    ),
  ];
  return { rows: rowsOut, current, approvedRevisions };
}
/**
 * What an export receipt says. A local export is always allowed; it is a draft
 * file on this machine either way, and it never becomes a customer release.
 */
export function describeExport(current: ApprovalRow | null, revision: string) {
  return {
    revision,
    approved: current !== null,
    versionId: current?.versionId ?? null,
    approvalId: current?.id ?? null,
    release: "local_draft" as const,
    note: current
      ? `Hyväksytty paikallisesti: ${current.approver} hyväksyi tämän version. Vienti on silti paikallinen luonnostiedosto, ei asiakastuotannon julkaisu.`
      : "Luonnos, ei hyväksytty. Vienti on paikallinen luonnostiedosto, ei asiakastuotannon julkaisu.",
  };
}
