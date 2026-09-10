import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { confinedPath } from "./conditionalFiles.js";
import { validateReviewManifest } from "./reviewValidation.js";
import type { ReviewPackage } from "./reviewPackage.js";

/**
 * Ari · review package listing (D4)
 *
 * A listing is a menu, never a certificate. It reads each manifest and checks
 * its internal bindings, but deliberately does NOT hash the published video and
 * frames — that is `readReviewPackage`, which the viewer calls before showing
 * anything. A row here therefore says "a package with this identity exists",
 * not "its assets are intact"; `readable: false` marks a row whose manifest is
 * already unusable so the UI can say so instead of offering a broken package.
 *
 * Private `.preparing-*` staging directories can never appear: they do not
 * match the package-id shape, which is the same guard `packagePath` applies.
 */
const directory = ".ari-notebook/review-packages";
const isPackageId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

export interface ReviewPackageSummary {
  id: string;
  versionId: string;
  versionName: string | null;
  previousVersionId: string | null;
  previousVersionName: string | null;
  sourceRevision: string;
  createdAt: number;
  coverage: string;
  coverageNotes: string[];
  boundaryCount: number;
  measured: ReviewPackage["measured"] | null;
  /** False when the manifest itself is missing or fails its own bindings. */
  readable: boolean;
  error?: string;
}

function summary(dir: string, id: string): ReviewPackageSummary {
  const manifest: ReviewPackage = JSON.parse(
    readFileSync(confinedPath(dir, "manifest.json"), "utf8"),
  );
  validateReviewManifest(manifest, id);
  return {
    id,
    versionId: manifest.versionId,
    versionName: manifest.versionName,
    previousVersionId: manifest.previousVersionId,
    previousVersionName: manifest.previousVersionName,
    sourceRevision: manifest.sourceRevision,
    createdAt: manifest.createdAt,
    coverage: manifest.coverage,
    coverageNotes: manifest.coverageNotes,
    boundaryCount: manifest.boundaries.length,
    measured: manifest.measured,
    readable: true,
  };
}

function unreadable(id: string, error: unknown): ReviewPackageSummary {
  return {
    id,
    versionId: "",
    versionName: null,
    previousVersionId: null,
    previousVersionName: null,
    sourceRevision: "",
    createdAt: 0,
    coverage: "",
    coverageNotes: [],
    boundaryCount: 0,
    measured: null,
    readable: false,
    error: error instanceof Error ? error.message : "Tarkistuspakettia ei voitu lukea.",
  };
}

/** Newest first. Never throws for one damaged package; that row says it is unreadable. */
export function listReviewPackages(root: string): ReviewPackageSummary[] {
  const parent = confinedPath(root, directory);
  let entries: string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return [];
  }
  const rows: ReviewPackageSummary[] = [];
  for (const id of entries) {
    if (!isPackageId(id)) continue;
    try {
      if (!statSync(join(parent, id)).isDirectory()) continue;
      rows.push(summary(join(parent, id), id));
    } catch (error) {
      rows.push(unreadable(id, error));
    }
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
