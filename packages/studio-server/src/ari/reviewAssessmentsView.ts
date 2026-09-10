import { readNotebook } from "./notebook.js";
import { listReviewPackages } from "./reviewList.js";
import { describeAssessments, type CategoryStatus } from "./reviewAssessments.js";

/**
 * Ari · assessment read model (D4)
 *
 * Joins the assessments stored in the project notebook with the packages that
 * are still on disk. Two things are kept strictly apart:
 *
 * - `measured` is what ffprobe read from the published render. `audio: false`
 *   means there was no audio stream. It is reported next to the categories and
 *   never as one, which is why a silent package still shows the audio
 *   assessment as `missing`.
 * - `categories` is what people said. A package nobody assessed reports four
 *   `missing` categories rather than an empty list.
 *
 * The notebook token comes back with the rows because every write is
 * conditional on it: two sessions reading the same token cannot both append,
 * so neither reviewer's row is silently lost.
 */
interface AssessedPackageRow {
  packageId: string;
  versionId: string;
  versionName: string | null;
  coverage: string;
  coverageNotes: string[];
  boundaryCount: number;
  /** Technical measurement of the published render, never a judgement. */
  measured: ReturnType<typeof listReviewPackages>[number]["measured"];
  readable: boolean;
  /** True when the project's sources moved past the package's own revision. */
  sourceChanged: boolean;
  categories: CategoryStatus[];
}

/** Everything a package row says when the package itself is gone. */
const unknownPackage = {
  versionId: "",
  versionName: null,
  coverage: "",
  coverageNotes: [] as string[],
  boundaryCount: 0,
  measured: null,
  readable: false,
  sourceRevision: "",
};

export function readReviewAssessments(root: string) {
  const notebook = readNotebook(root);
  const packages = listReviewPackages(root);
  const grouped = describeAssessments(notebook.notebook.assessments, packages, notebook.revision);
  const byId = new Map(packages.map((item) => [item.id, item]));
  const rows: AssessedPackageRow[] = grouped.map((entry) => {
    const {
      versionId,
      versionName,
      coverage,
      coverageNotes,
      boundaryCount,
      measured,
      readable,
      sourceRevision,
    } = byId.get(entry.packageId) ?? unknownPackage;
    return {
      packageId: entry.packageId,
      versionId,
      versionName,
      coverage,
      coverageNotes,
      boundaryCount,
      measured,
      readable,
      sourceChanged: sourceRevision !== notebook.revision,
      categories: entry.categories,
    };
  });
  return { ok: true, token: notebook.token, revision: notebook.revision, packages: rows };
}
