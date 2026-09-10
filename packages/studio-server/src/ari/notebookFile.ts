/**
 * Ari · the notebook file itself: one parser, one bounded reader (D1, D4, D5)
 *
 * Kept separate from `notebook.ts` so the shared write path can read the
 * approved-content locks and the repair settings without importing the command
 * surface — which would close an import cycle through the version store.
 */
import { lstatSync } from "node:fs";
import { confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";
import { choice, record, requiredText, rows, text } from "./notebookValues.js";
import { parseAssessment, type ReviewAssessment } from "./reviewAssessments.js";
import {
  parseRepairSettings,
  REPAIR_LIMIT_DEFAULT,
  type RepairSettings,
} from "./notebookRepair.js";
import { parseStopSettings, type StopSettings } from "./notebookStop.js";
import { parseApproval, type VersionApproval } from "./notebookApproval.js";

export const notebookPath = ".ari-notebook/notebook.json";
export const NOTEBOOK_LIMIT = 1024 * 1024;
export type Task = {
  id: string;
  text: string;
  status: "next" | "active" | "done";
  /** D5: what the task still lacks and what to try next, shown when its rounds run out. */
  remaining: string;
  suggestion: string;
};
export type Observation = {
  id: string;
  author: string;
  authorType: "human" | "external_agent" | "technical";
  revision: string;
  createdAt: string;
  coverage: string;
  text: string;
};
export type Notebook = RepairSettings &
  StopSettings & {
    schema: 1;
    goal: string;
    texts: string;
    assets: { path: string; checksum: string }[];
    tasks: Task[];
    observations: Observation[];
    /** Attributed per-category judgements about one published review package (D4). */
    assessments: ReviewAssessment[];
    /** Named local decisions about one frozen version (D7); never a release. */
    approvals: VersionApproval[];
    /** Reserved for verified source-write receipts; never writable by notebook commands. */
    operations: { id: string; baseRevision: string; resultRevision: string; result: string }[];
  };
const emptyNotebook = (): Notebook => ({
  schema: 1,
  goal: "",
  texts: "",
  repairLimit: REPAIR_LIMIT_DEFAULT,
  activeRepairTaskId: "",
  locks: [],
  stop: null,
  stopHistory: [],
  assets: [],
  tasks: [],
  observations: [],
  assessments: [],
  approvals: [],
  operations: [],
});
export function parseAsset(value: unknown) {
  const item = record(value);
  return { path: text(item.path, 512), checksum: text(item.checksum, 64) };
}
function parseTask(value: unknown): Task {
  const item = record(value);
  return {
    id: text(item.id, 80),
    text: requiredText(item.text),
    status: choice(item.status, ["next", "active", "done"]),
    // Absent in notebooks written before D5; an empty plan is the correct reading.
    remaining: text(item.remaining ?? "", 2000),
    suggestion: text(item.suggestion ?? "", 2000),
  };
}
export function parseObservation(value: unknown): Observation {
  const item = record(value);
  return {
    id: text(item.id, 80),
    author: requiredText(item.author, 120),
    authorType: choice(item.authorType, ["human", "external_agent", "technical"]),
    revision: text(item.revision, 64),
    createdAt: text(item.createdAt, 40),
    coverage: requiredText(item.coverage),
    text: requiredText(item.text),
  };
}
export function parseNotebook(bytes: Buffer | null): Notebook {
  if (bytes === null) return emptyNotebook();
  try {
    const value = record(JSON.parse(bytes.toString()));
    if (value.schema !== 1 || rows(value.operations).length)
      throw new Error("Tuntematon muistikirjan versio.");
    return {
      schema: 1,
      ...parseRepairSettings(value),
      ...parseStopSettings(value),
      goal: text(value.goal),
      texts: text(value.texts),
      assets: rows(value.assets).map(parseAsset),
      tasks: rows(value.tasks).map(parseTask),
      observations: rows(value.observations).map(parseObservation),
      // Absent in notebooks written before D4; an empty list is the correct reading.
      assessments: rows(value.assessments ?? []).map(parseAssessment),
      // Absent in notebooks written before D7; nothing is approved by default.
      approvals: rows(value.approvals ?? []).map(parseApproval),
      operations: [],
    };
  } catch {
    throw new Error("Muistikirja on vioittunut tai sen versiota ei tueta. Tiedostoa ei korvata.");
  }
}
export function loadNotebook(root: string) {
  const absolute = confinedPath(root, notebookPath);
  try {
    if (lstatSync(absolute).size > NOTEBOOK_LIMIT)
      throw new Error("Muistikirja ylittää 1 MiB:n rajan.");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const bytes = readOptionalBytes(absolute);
  return {
    notebook: parseNotebook(bytes),
    token: bytes === null ? null : fileContentVersion(bytes),
  };
}
