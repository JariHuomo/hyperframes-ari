import { randomUUID } from "node:crypto";
import { commitConditionalFiles, confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import { projectVersionFiles, sourceRevision, versionDigest } from "./versionFiles.js";
import { record, requiredText, rows, text, choice } from "./notebookValues.js";
import { readReviewPackage } from "./reviewPackage.js";
import { bindAssessment } from "./reviewAssessments.js";
import { applyRepairAction } from "./notebookRepair.js";
import { applyStopAction } from "./notebookStop.js";
import { bindApproval, describeApprovals, describeExport } from "./notebookApproval.js";
import { listReviewPackages } from "./reviewList.js";
import { repairView } from "./repairGate.js";
import {
  loadNotebook,
  notebookPath,
  NOTEBOOK_LIMIT,
  parseAsset,
  parseNotebook,
  parseObservation,
  type Notebook,
} from "./notebookFile.js";

export function readNotebook(root: string) {
  const current = loadNotebook(root);
  const revision = sourceRevision(projectVersionFiles(root));
  const approval = describeApprovals(
    current.notebook.approvals,
    listReviewPackages(root),
    revision,
  );
  return {
    ok: true,
    ...current,
    revision,
    repair: repairView(root, current.notebook),
    approvals: approval.rows,
    currentApproval: approval.current,
    approvedRevisions: approval.approvedRevisions,
    // What a local export receipt says about this exact source revision.
    export: describeExport(approval.current, revision),
    staleObservationIds: current.notebook.observations
      .filter((item) => item.revision !== revision)
      .map((item) => item.id),
  };
}
/** The agreed brief, its verified assets and the manual task list. */
function applyPlan(root: string, notebook: Notebook, input: Record<string, unknown>) {
  switch (input.action) {
    case "brief":
      notebook.goal = text(input.goal);
      notebook.texts = text(input.texts);
      return true;
    case "assets":
      notebook.assets = rows(input.assets).map(parseAsset);
      verifyAssets(root, notebook.assets);
      return true;
    case "task":
      notebook.tasks.push({
        id: randomUUID(),
        text: requiredText(input.text),
        status: "next",
        remaining: "",
        suggestion: "",
      });
      return true;
    case "task_status": {
      const target = notebook.tasks.find((item) => item.id === input.id);
      if (!target) throw new Error("Tehtävää ei löydy.");
      target.status = choice(input.status, ["next", "active", "done"]);
      return true;
    }
    default:
      return false;
  }
}
/** Attributed, version-bound records: neither is ever written by a source edit. */
function applyRecords(
  root: string,
  notebook: Notebook,
  input: Record<string, unknown>,
  revision: string,
) {
  switch (input.action) {
    case "observation":
      if (input.revision !== revision)
        throw new Error("Mainos muuttui. Lue tilanne ja tarkista uusi versio.");
      notebook.observations.push(
        parseObservation({ ...input, id: randomUUID(), createdAt: new Date().toISOString() }),
      );
      return true;
    case "approval": {
      // A decision reads the package through the same verifying reader an
      // assessment does; an unreadable package can never authorise anything.
      const packageId = input.packageId === undefined ? "" : text(input.packageId, 80);
      notebook.approvals.push(
        bindApproval(input, {
          assessments: notebook.assessments,
          approvals: notebook.approvals,
          manifest: packageId ? readReviewPackage(root, packageId) : null,
          revision,
        }),
      );
      return true;
    }
    case "assessment": {
      // readReviewPackage re-verifies every published asset, so an assessment
      // can never name a package whose media is missing or altered.
      const manifest = readReviewPackage(root, text(input.packageId, 80));
      notebook.assessments.push(bindAssessment(manifest, input));
      return true;
    }
    default:
      return false;
  }
}
function apply(root: string, notebook: Notebook, input: Record<string, unknown>, revision: string) {
  // Approved-content locks and repair-round settings (D5) share this same
  // conditional save; an unknown action lands on the refusal below.
  if (
    !applyPlan(root, notebook, input) &&
    !applyRecords(root, notebook, input, revision) &&
    !applyRepairAction(notebook, input) &&
    !applyStopAction(notebook, input)
  )
    throw new Error("Muistikirjan toimintoa ei tueta.");
}
/** Synchronous, conditional publication through the same project-confined file service. */
export function saveNotebook(root: string, value: unknown, finish: () => void = () => {}) {
  const input = record(value),
    current = readNotebook(root);
  if (input.expectedToken !== current.token)
    throw new Error("Muistikirja muuttui. Päivitä tilanne; luonnoksesi säilyy.");
  apply(root, current.notebook, input, current.revision);
  const bytes = Buffer.from(JSON.stringify(current.notebook, null, 2) + "\n");
  if (bytes.length > NOTEBOOK_LIMIT) throw new Error("Muistikirja ylittää 1 MiB:n rajan.");
  // Re-parse before publication to enforce aggregate row bounds as well.
  parseNotebook(bytes);
  commitConditionalFiles(
    root,
    [{ path: notebookPath, expectedVersion: current.token, content: bytes }],
    finish,
  );
  return { ...readNotebook(root), stage: "notebook_saved", sourceChanged: false };
}

function verifyAssets(root: string, assets: Notebook["assets"]) {
  for (const item of assets) {
    if (!item.path.startsWith("assets/")) throw new Error("Valitse projektiin tuotu aineisto.");
    const bytes = readOptionalBytes(confinedPath(root, item.path));
    if (!bytes || versionDigest(bytes) !== item.checksum)
      throw new Error("Aineisto muuttui tai puuttuu.");
  }
}
