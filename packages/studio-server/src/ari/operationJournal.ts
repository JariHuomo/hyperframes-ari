import { readdirSync, lstatSync } from "node:fs";
import { commitConditionalFiles, confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import {
  projectVersionFiles,
  sourceRevision,
  versionDigest,
  isVersionProjectPath,
} from "./versionFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";
import type { VersionHistoryState } from "./versionHistory.js";
import { assertOperationAllowed, recordRepairRound } from "./repairGate.js";

interface SourceOperation {
  id: string;
  label: string;
  kind: "source" | "motion" | "manual" | "timeline";
  baseRevision: string;
  files: Record<string, { before: string | null; after: string | null }>;
}
export interface OperationReceipt {
  id: string;
  binding: string;
  historyId: string;
  versionId: string;
  resultRevision: string;
}
const directory = ".ari-notebook/operations";
const digest = (value: string | null) =>
  value === null ? null : versionDigest(Buffer.from(value));
function operationPath(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Toiminnon tunniste ei kelpaa.");
  return `${directory}/${id}.json`;
}
function parseOperation(value: unknown): SourceOperation {
  const v = Object(value);
  operationPath(v.id);
  validateOperationHeader(v);
  const files = parseOperationFiles(v.files);
  return { id: v.id, label: v.label, kind: v.kind, baseRevision: v.baseRevision, files };
}
function validateOperationHeader(v: {
  label: unknown;
  kind: unknown;
  baseRevision: unknown;
  files: unknown;
}) {
  if (
    typeof v.label !== "string" ||
    !v.label.trim() ||
    v.label.length > 200 ||
    !["source", "motion", "manual", "timeline"].some((kind) => kind === v.kind) ||
    typeof v.baseRevision !== "string" ||
    !v.files ||
    typeof v.files !== "object"
  )
    throw new Error("Toiminnon lähtötiedot eivät kelpaa.");
}
function parseOperationFiles(input: Record<string, unknown>) {
  const entries = Object.entries(input);
  if (!entries.length || entries.length > 100)
    throw new Error("Toiminnon tiedostomäärä ei kelpaa.");
  const files: SourceOperation["files"] = {};
  for (const [path, input] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const file = Object(input);
    if (
      !isVersionProjectPath(path) ||
      ![file.before, file.after].every((s) => s === null || typeof s === "string")
    )
      throw new Error("Toiminnon tiedostot eivät kelpaa.");
    files[path] = { before: file.before, after: file.after };
  }
  return files;
}
function encode(operation: SourceOperation) {
  const bytes = Buffer.from(JSON.stringify(operation));
  if (bytes.length > 8 * 1024 * 1024)
    throw new Error("Toiminnon lähtötiedot ylittävät 8 MiB:n rajan.");
  return bytes;
}
function readSourceOperation(root: string, id: string) {
  const bytes = readOptionalBytes(confinedPath(root, operationPath(id)));
  if (!bytes) throw new Error("Toiminnon pysyvät lähtötiedot puuttuvat. Uusinta on estetty.");
  return parseOperation(JSON.parse(bytes.toString()));
}
/** Exclusive immutable intent publication precedes any source write. Never authorizes replay. */
export function prepareSourceOperation(root: string, value: unknown) {
  const operation = parseOperation(value);
  const path = operationPath(operation.id),
    bytes = encode(operation);
  const existing = readOptionalBytes(confinedPath(root, path));
  if (existing) {
    if (!existing.equals(bytes))
      throw new Error("Sama toiminnon tunniste on sidottu eri muutokseen.");
    throw new Error(
      "Toiminto on jo aloitettu. Selvitä sen tulos Jatka työtä -toiminnolla; älä toista kirjoitusta.",
    );
  }
  assertJournalCapacity(root, bytes.length);
  const current = projectVersionFiles(root);
  if (sourceRevision(current) !== operation.baseRevision)
    throw new Error("Mainos muuttui. Päivitä tilanne.");
  for (const [file, snapshot] of Object.entries(operation.files)) {
    confinedPath(root, file);
    if ((current[file] ? versionDigest(current[file]) : null) !== digest(snapshot.before))
      throw new Error(`Toiminnon lähtötiedosto muuttui: ${file}`);
  }
  // D5: the repair-round limit and the approved-content locks refuse here, before
  // the intent exists, so a refused change is never resumable and writes nothing.
  const task = assertOperationAllowed(root, operation);
  commitConditionalFiles(root, [{ path, content: bytes, expectedVersion: null }]);
  if (task) recordRepairRound(root, operation.id, task.id);
  return {
    operationId: operation.id,
    binding: versionDigest(bytes),
    repairTaskId: task?.id ?? null,
  };
}
function listOperationIds(root: string) {
  try {
    return readdirSync(confinedPath(root, directory)).map((file) => {
      if (!file.endsWith(".json"))
        throw new Error("Toimintohistoria sisältää tuntemattoman tiedoston.");
      const id = file.slice(0, -5);
      operationPath(id);
      return id;
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
/** This receipt is published INSIDE the same index bytes as the history/version. */
export function bindSourceOperation(
  root: string,
  history: VersionHistoryState | undefined,
  versionId: string,
  resultRevision: string,
  receipts: OperationReceipt[],
) {
  const entry = history?.undo.at(-1);
  if (!entry?.operationId || entry.afterVersionId) return receipts;
  const operation = readSourceOperation(root, entry.operationId);
  verifyOperationWrites(root, operation);
  const prior = receipts.find((r) => r.id === operation.id);
  if (prior) throw new Error("Toiminto on jo valmistunut. Kirjoitusta ei toisteta.");
  const files = Object.fromEntries(
    Object.entries(entry.files).map(([path, f]) => {
      if (f.encoding) throw new Error("Tämän toiminnon binäärikirjoitusta ei tueta.");
      return [path, { before: f.before, after: f.after }];
    }),
  );
  const expected = parseOperation({ ...operation, files, label: entry.label, kind: entry.kind });
  if (!encode(operation).equals(encode(expected)))
    throw new Error("Historia ei vastaa sidottua toimintoa.");
  const baseline = projectVersionFiles(root);
  for (const [path, snapshot] of Object.entries(operation.files)) {
    if ((baseline[path] ? versionDigest(baseline[path]) : null) !== digest(snapshot.after))
      throw new Error("Toiminnon tulostiedosto muuttui ennen historian tallennusta.");
    if (snapshot.before === null) delete baseline[path];
    else baseline[path] = Buffer.from(snapshot.before);
  }
  if (sourceRevision(baseline) !== operation.baseRevision)
    throw new Error("Mainoksen muu sisältö muuttui toiminnon aikana.");
  return [
    ...receipts,
    {
      id: operation.id,
      binding: versionDigest(encode(operation)),
      historyId: entry.id,
      versionId,
      resultRevision,
    },
  ];
}
export function reconcileSourceOperations(root: string, receipts: OperationReceipt[]) {
  const revision = sourceRevision(projectVersionFiles(root));
  return listOperationIds(root).map((id) => {
    const operation = readSourceOperation(root, id);
    const receipt = receipts.find((r) => r.id === id);
    if (receipt && receipt.binding !== versionDigest(encode(operation)))
      throw new Error("Toiminnon todiste on vioittunut. Uusinta on estetty.");
    return {
      ...operation,
      files: Object.keys(operation.files),
      receipt: receipt ?? null,
      status: receipt ? "completed" : "uncertain",
      retryAllowed: false,
      currentRevision: revision,
      changedSince: receipt
        ? revision !== receipt.resultRevision
        : revision !== operation.baseRevision,
    };
  });
}

function assertJournalCapacity(root: string, addedBytes: number) {
  const ids = listOperationIds(root);
  const total = ids.reduce(
    (sum, id) => sum + lstatSync(confinedPath(root, operationPath(id))).size,
    addedBytes,
  );
  if (ids.length >= 1000 || total > 32 * 1024 * 1024)
    throw new Error(
      "Toimintohistoria on täynnä. Aiemmat tulokset säilytetään; uutta muutosta ei aloitettu.",
    );
}

function writeEvidencePath(id: string, path: string) {
  operationPath(id);
  return `.ari-notebook/operation-writes/${id}/${versionDigest(path)}.json`;
}
function writeEvidence(operation: SourceOperation, path: string) {
  return Buffer.from(
    JSON.stringify({ id: operation.id, binding: versionDigest(encode(operation)), path }),
  );
}
/** The bounded write reads its bytes exclusively from the already-persisted intent. */
export function writeSourceOperation(
  root: string,
  id: string,
  path: string,
  finish: () => void = () => {},
) {
  const operation = readSourceOperation(root, id),
    snapshot = operation.files[path];
  if (!Object.hasOwn(operation.files, path) || !snapshot)
    throw new Error("Tiedosto ei kuulu sidottuun toimintoon.");
  const content = snapshot.after === null ? null : Buffer.from(snapshot.after);
  const expectedVersion =
    snapshot.before === null ? null : fileContentVersion(Buffer.from(snapshot.before));
  return commitConditionalFiles(
    root,
    [
      { path, content, expectedVersion },
      {
        path: writeEvidencePath(id, path),
        content: writeEvidence(operation, path),
        expectedVersion: null,
      },
    ],
    finish,
  );
}
function verifyOperationWrites(root: string, operation: SourceOperation) {
  for (const path of Object.keys(operation.files)) {
    const proof = readOptionalBytes(confinedPath(root, writeEvidencePath(operation.id, path)));
    if (!proof?.equals(writeEvidence(operation, path)))
      throw new Error("Toiminnon lähdekirjoituksen todiste puuttuu. Uusinta on estetty.");
  }
}
