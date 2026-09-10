import { confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import { isVersionProjectPath } from "./versionFiles.js";
/** Wire validation for legacy UTF-8 and nullable/binary edit snapshots. */
export interface VersionHistoryEntry {
  operationId?: string;
  id: string;
  projectId: string;
  label: string;
  kind: "manual" | "motion" | "timeline" | "source";
  createdAt: number;
  beforeVersionId?: string;
  afterVersionId?: string;
  files: Record<
    string,
    {
      before: string | null;
      after: string | null;
      beforeHash: string;
      afterHash: string;
      encoding?: "base64";
    }
  >;
}
export interface VersionHistoryState {
  version: 1;
  updatedAt: number;
  undo: VersionHistoryEntry[];
  redo: VersionHistoryEntry[];
}
export function parseVersionHistory(input: unknown): VersionHistoryState {
  const value = Object(input);
  if (
    value.version !== 1 ||
    !Number.isFinite(value.updatedAt) ||
    !Array.isArray(value.undo) ||
    !Array.isArray(value.redo)
  )
    throw new Error("Muutoshistorian tiedot eivät kelpaa.");
  for (const entry of [...value.undo, ...value.redo]) validateEntry(entry);
  return value;
}
function validateEntry(entry: VersionHistoryEntry) {
  if (
    !entry ||
    ![entry.id, entry.projectId, entry.label].every((value) => typeof value === "string") ||
    !["manual", "motion", "timeline", "source"].includes(entry.kind) ||
    !Number.isFinite(entry.createdAt) ||
    !entry.files ||
    typeof entry.files !== "object"
  )
    throw new Error("Muutosmerkintä ei kelpaa.");
  validateOperationId(entry.operationId);
  for (const file of Object.values(entry.files)) validateFile(file);
}
function validateFile(file: VersionHistoryEntry["files"][string]) {
  if (
    !file ||
    !nullable(file.before) ||
    !nullable(file.after) ||
    typeof file.beforeHash !== "string" ||
    typeof file.afterHash !== "string" ||
    (file.encoding !== undefined && file.encoding !== "base64")
  )
    throw new Error("Muutosmerkinnän tiedosto ei kelpaa.");
}

const nullable = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
export function decodeHistoryBytes(content: string | null, encoding?: "base64") {
  if (content === null) return null;
  const bytes = Buffer.from(content, encoding ?? "utf8");
  if (encoding && bytes.toString("base64") !== content)
    throw new Error("Tiedoston koodaus ei kelpaa.");
  return bytes;
}

export function prepareHistoryBaseline(root: string, history?: VersionHistoryState) {
  const latest = history?.undo.at(-1);
  if (!latest || latest.afterVersionId) return undefined;
  const before: Record<string, Buffer | null> = {};
  for (const [path, file] of Object.entries(latest.files)) {
    if (!isVersionProjectPath(path)) throw new Error("Historian tiedostopolku ei kelpaa.");
    const actual = readOptionalBytes(confinedPath(root, path));
    const expected = decodeHistoryBytes(file.after, file.encoding);
    if (!equalBytes(actual, expected)) throw new Error(`Tiedosto muuttui: ${path}`);
    before[path] = decodeHistoryBytes(file.before, file.encoding);
  }
  return before;
}
function equalBytes(a: Buffer | null, b: Buffer | null) {
  return a === null ? b === null : b !== null && a.equals(b);
}

function validateOperationId(id: unknown) {
  if (id !== undefined && typeof id !== "string") throw new Error("Toiminnon tunniste ei kelpaa.");
}
