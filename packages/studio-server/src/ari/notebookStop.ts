/**
 * Ari · Pysäytä työ (D6)
 *
 * The stop is a durable notebook fact, not a disabled button. `repairGate.ts`
 * reads it on the shared write path, so an agent tool meets exactly the same
 * refusal as the visible controls do.
 *
 * What the stop does NOT cover is deliberate. It refuses the NEXT tracked
 * source write, at `prepareSourceOperation`, before the immutable intent
 * exists. An operation whose intent is already published is finished, never
 * abandoned half-way: its bytes live in that intent, its writes are
 * conditional, and tearing it down would leave an orphan that `Jatka työtä`
 * could only ever report as `uncertain`. See `assertWorkNotStopped`.
 *
 * Notebook edits, observations, assessments and approvals are not source
 * writes and stay available while the work is stopped — that is the point of
 * stopping: you can still write down why.
 */
import { randomUUID } from "node:crypto";
import { choice, record, requiredText, rows, text } from "./notebookValues.js";

/** No `technical` value: a machine does not decide to stop or resume the work. */
const actorTypes = ["human", "external_agent", "test_data"] as const;
export type StopActorType = (typeof actorTypes)[number];

export interface StopEntry {
  id: string;
  action: "stop" | "resume";
  by: string;
  byType: StopActorType;
  reason: string;
  createdAt: string;
}
export interface StopSettings {
  /** The stop that is in force, or null when the work is running. */
  stop: StopEntry | null;
  /** Every stop and resume, oldest first, bounded like the rest of the notebook. */
  stopHistory: StopEntry[];
}
const STOP_HISTORY = 200;

function parseEntry(value: unknown): StopEntry {
  const item = record(value);
  return {
    id: text(item.id, 80),
    action: choice(item.action, ["stop", "resume"]),
    by: requiredText(item.by, 120),
    byType: choice(item.byType, actorTypes),
    reason: requiredText(item.reason, 2000),
    createdAt: text(item.createdAt, 40),
  };
}
export function parseStopSettings(value: Record<string, unknown>): StopSettings {
  // Absent in notebooks written before D6; "running, no history" is the correct reading.
  const history = rows(value.stopHistory ?? []).map(parseEntry);
  const stop = value.stop === undefined || value.stop === null ? null : parseEntry(value.stop);
  if (stop && stop.action !== "stop") throw new Error("Pysäytyksen tila ei kelpaa.");
  return { stop, stopHistory: history };
}
/** The one Finnish sentence the write path refuses with, used by UI and tools alike. */
export function stopRefusalMessage(stop: StopEntry) {
  return (
    `Työ on pysäytetty: ${stop.by} pysäytti sen ${stop.createdAt}. Syy: ${stop.reason}. ` +
    "Seuraavaa muutosta ei aloitettu. Jatka työtä vapauttaa kirjoitukset; " +
    "muistikirja, havainnot ja arviot ovat käytettävissä myös pysäytettynä."
  );
}
export function applyStopAction(notebook: StopSettings, input: Record<string, unknown>) {
  const action = input.action;
  if (action !== "stop_work" && action !== "resume_work") return false;
  if (action === "stop_work" && notebook.stop) throw new Error("Työ on jo pysäytetty.");
  if (action === "resume_work" && !notebook.stop) throw new Error("Työ ei ole pysäytetty.");
  const entry = parseEntry({
    id: randomUUID(),
    action: action === "stop_work" ? "stop" : "resume",
    by: input.by,
    byType: input.byType,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  });
  notebook.stop = entry.action === "stop" ? entry : null;
  notebook.stopHistory = [...notebook.stopHistory, entry].slice(-STOP_HISTORY);
  return true;
}
