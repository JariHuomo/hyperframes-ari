/**
 * Ari · approved-content locks and repair-round settings (D5)
 *
 * These live in the project notebook next to the agreed copy they protect, and
 * are read by `repairGate.ts` on the shared write path. Nothing here decides
 * meaning: a lock is an exact normalised string, never a judgement about it.
 */
import { randomUUID } from "node:crypto";
import { flag, record, requiredText, rows, text } from "./notebookValues.js";

export interface LockedText {
  id: string;
  label: string;
  /** The approved wording, stored exactly as agreed and compared normalised. */
  text: string;
  /** Task ids that carry an explicit mandate to change this text. */
  tasks: string[];
}
export interface RepairSettings {
  /** Product default: two repair rounds per task, changeable per project. */
  repairLimit: number;
  /** "" means no task is claiming its repair rounds right now. */
  activeRepairTaskId: string;
  locks: LockedText[];
}
export const REPAIR_LIMIT_DEFAULT = 2;

export const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
export function occurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  )
    count += 1;
  return count;
}
function limit(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 20)
    throw new Error("Korjauskierrosten raja on kokonaisluku väliltä 0–20.");
  return value;
}
function parseLock(value: unknown): LockedText {
  const item = record(value);
  const locked = requiredText(item.text, 2000);
  if (normalizeText(locked).length < 2) throw new Error("Lukittava teksti on liian lyhyt.");
  return {
    id: text(item.id, 80),
    label: requiredText(item.label, 120),
    text: locked,
    tasks: rows(item.tasks ?? []).map((task) => text(task, 80)),
  };
}
export function parseRepairSettings(value: Record<string, unknown>): RepairSettings {
  return {
    // Absent in notebooks written before D5; the product default is the correct reading.
    repairLimit: value.repairLimit === undefined ? REPAIR_LIMIT_DEFAULT : limit(value.repairLimit),
    activeRepairTaskId: text(value.activeRepairTaskId ?? "", 80),
    locks: rows(value.locks ?? []).map(parseLock),
  };
}
interface RepairTarget extends RepairSettings {
  tasks: { id: string; remaining: string; suggestion: string }[];
}
function requireTask(notebook: RepairTarget, id: unknown) {
  const target = notebook.tasks.find((task) => task.id === text(id, 80));
  if (!target) throw new Error("Tehtävää ei löydy.");
  return target;
}
/** Returns false for an unknown action so the notebook can refuse it as before. */
export function applyRepairAction(notebook: RepairTarget, input: Record<string, unknown>) {
  switch (input.action) {
    case "repair_limit":
      notebook.repairLimit = limit(input.limit);
      return true;
    case "active_repair":
      notebook.activeRepairTaskId = input.id === "" ? "" : requireTask(notebook, input.id).id;
      return true;
    case "repair_plan": {
      const task = requireTask(notebook, input.id);
      task.remaining = text(input.remaining, 2000);
      task.suggestion = text(input.suggestion, 2000);
      return true;
    }
    case "lock":
      notebook.locks.push(
        parseLock({ id: randomUUID(), label: input.label, text: input.text, tasks: [] }),
      );
      return true;
    case "unlock": {
      const id = text(input.id, 80);
      if (!notebook.locks.some((lock) => lock.id === id)) throw new Error("Lukitusta ei löydy.");
      notebook.locks = notebook.locks.filter((lock) => lock.id !== id);
      return true;
    }
    case "authority": {
      const id = text(input.id, 80);
      const lock = notebook.locks.find((item) => item.id === id);
      if (!lock) throw new Error("Lukitusta ei löydy.");
      const task = requireTask(notebook, input.taskId);
      lock.tasks = flag(input.granted)
        ? [...new Set([...lock.tasks, task.id])]
        : lock.tasks.filter((entry) => entry !== task.id);
      return true;
    }
    default:
      return false;
  }
}
