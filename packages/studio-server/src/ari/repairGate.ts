/**
 * Ari · repair-round limit and approved-content protection on the write path (D5)
 *
 * Every tracked source write — visible control or agent tool alike — publishes
 * its intent through `prepareSourceOperation` first, so this is the one place
 * that can refuse before anything is written. A refusal touches no source file,
 * no version index and no undo stack; it leaves a receipt and nothing else.
 */
import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { commitConditionalFiles, confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";
import { loadNotebook, type Task } from "./notebookFile.js";
import {
  normalizeText,
  occurrences,
  type LockedText,
  type RepairSettings,
} from "./notebookRepair.js";
import { stopRefusalMessage, type StopSettings } from "./notebookStop.js";

const roundsDirectory = ".ari-notebook/repairs";
const refusalsPath = ".ari-notebook/refusals.json";
const REFUSAL_HISTORY = 200;

export interface RepairRefusal {
  id: string;
  createdAt: string;
  reason: "repair_limit" | "locked_text" | "work_stopped";
  message: string;
  operationId: string;
  taskId: string;
  detail: string;
}
interface RepairNotebook extends RepairSettings, StopSettings {
  tasks: Task[];
}
interface OperationFiles {
  id: string;
  files: Record<string, { before: string | null; after: string | null }>;
}
function roundPath(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Toiminnon tunniste ei kelpaa.");
  return `${roundsDirectory}/${id}.json`;
}
function listRounds(root: string) {
  let names: string[];
  try {
    names = readdirSync(confinedPath(root, roundsDirectory));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return names.flatMap((name) => {
    const bytes = readOptionalBytes(confinedPath(root, `${roundsDirectory}/${name}`));
    if (!bytes) return [];
    const row = JSON.parse(bytes.toString()) as { operationId: string; taskId: string };
    return [row];
  });
}
/** Counts are files on disk, so the limit survives a restart without any cache. */
export function repairRounds(root: string) {
  const counts: Record<string, number> = {};
  for (const row of listRounds(root)) counts[row.taskId] = (counts[row.taskId] ?? 0) + 1;
  return counts;
}
export function readRefusals(root: string): RepairRefusal[] {
  const bytes = readOptionalBytes(confinedPath(root, refusalsPath));
  if (!bytes) return [];
  const value: unknown = JSON.parse(bytes.toString());
  return Array.isArray(value) ? (value as RepairRefusal[]) : [];
}
function recordRefusal(root: string, entry: Omit<RepairRefusal, "id" | "createdAt">) {
  const current = readOptionalBytes(confinedPath(root, refusalsPath));
  const history = [
    ...readRefusals(root),
    { ...entry, id: randomUUID(), createdAt: new Date().toISOString() },
  ].slice(-REFUSAL_HISTORY);
  commitConditionalFiles(root, [
    {
      path: refusalsPath,
      content: Buffer.from(JSON.stringify(history, null, 2) + "\n"),
      expectedVersion: current === null ? null : fileContentVersion(current),
    },
  ]);
}
export function repairView(root: string, notebook: RepairNotebook) {
  const rounds = repairRounds(root);
  return {
    limit: notebook.repairLimit,
    stop: notebook.stop,
    stopHistory: notebook.stopHistory,
    activeTaskId: notebook.activeRepairTaskId,
    rounds,
    tasks: notebook.tasks.map((task) => ({
      id: task.id,
      used: rounds[task.id] ?? 0,
      remaining: task.remaining,
      suggestion: task.suggestion,
      exhausted: (rounds[task.id] ?? 0) >= notebook.repairLimit,
    })),
    refusals: readRefusals(root),
  };
}
function describeGap(task: Task) {
  return [
    `Jäljellä oleva puute: ${task.remaining.trim() || "ei kirjattu muistikirjaan"}.`,
    `Seuraava ehdotus: ${task.suggestion.trim() || "ei kirjattu muistikirjaan"}.`,
    "Päätä jatkosta itse; automaattista jatkoa ei ole.",
  ].join(" ");
}
/**
 * D6. Refuses the NEXT tracked source write. An operation that already passed
 * this point keeps its published intent and is written to completion by
 * `writeSourceOperation`, so the sources end byte-exactly in the before state
 * or byte-exactly in the after state — never half-way. Stopping mid-flight
 * would orphan that intent and leave `Jatka työtä` reporting it as uncertain
 * for good, which is a worse outcome than one extra finished change.
 */
function assertWorkNotStopped(root: string, notebook: RepairNotebook, operation: OperationFiles) {
  if (!notebook.stop) return;
  const message = stopRefusalMessage(notebook.stop);
  recordRefusal(root, {
    reason: "work_stopped",
    message,
    operationId: operation.id,
    taskId: notebook.activeRepairTaskId,
    detail: notebook.stop.id,
  });
  throw new Error(message);
}
function assertRepairLimit(root: string, notebook: RepairNotebook, operation: OperationFiles) {
  const task = notebook.tasks.find((item) => item.id === notebook.activeRepairTaskId);
  if (!task) return null;
  const used = repairRounds(root)[task.id] ?? 0;
  if (used < notebook.repairLimit) return task;
  const message = `Korjauskierrosten raja täyttyi: tehtävä "${task.text}" on käyttänyt ${used}/${notebook.repairLimit} kierrosta. ${describeGap(task)}`;
  recordRefusal(root, {
    reason: "repair_limit",
    message,
    operationId: operation.id,
    taskId: task.id,
    detail: `${used}/${notebook.repairLimit}`,
  });
  throw new Error(message);
}
/** Mechanical only: the exact agreed string, whitespace-normalised, must not lose ground. */
function removesLockedText(lock: LockedText, operation: OperationFiles) {
  const needle = normalizeText(lock.text);
  return Object.values(operation.files).some(
    (file) =>
      occurrences(normalizeText(file.before ?? ""), needle) >
      occurrences(normalizeText(file.after ?? ""), needle),
  );
}
function assertLocksHold(
  root: string,
  notebook: RepairNotebook,
  operation: OperationFiles,
  taskId: string,
) {
  for (const lock of notebook.locks) {
    if (lock.tasks.includes(taskId) || !removesLockedText(lock, operation)) continue;
    const message = `Hyväksyttyä tekstiä ei muuteta ilman erillistä muutosvaltuutta: ${lock.label}. Lukittu teksti: "${normalizeText(lock.text)}". Lähteitä, versioita tai perumishistoriaa ei muutettu.`;
    recordRefusal(root, {
      reason: "locked_text",
      message,
      operationId: operation.id,
      taskId,
      detail: lock.id,
    });
    throw new Error(message);
  }
}
/**
 * Called before the intent is published, so a refused change never becomes a
 * resumable operation. Returns the task whose repair round this write consumes.
 */
export function assertOperationAllowed(root: string, operation: OperationFiles) {
  const notebook = loadNotebook(root).notebook;
  // The stop comes first: a stopped project is told it is stopped, not told
  // about a round limit or a lock it was never going to reach.
  assertWorkNotStopped(root, notebook, operation);
  const task = assertRepairLimit(root, notebook, operation);
  assertLocksHold(root, notebook, operation, task?.id ?? "");
  return task;
}
export function recordRepairRound(root: string, operationId: string, taskId: string) {
  commitConditionalFiles(root, [
    {
      path: roundPath(operationId),
      content: Buffer.from(JSON.stringify({ operationId, taskId }) + "\n"),
      expectedVersion: null,
    },
  ]);
}
