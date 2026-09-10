import { bindSourceOperation } from "./operationJournal.js";
import { parseVersionHistory } from "./versionHistory.js";
import { randomUUID } from "node:crypto";
import { readdirSync, unlinkSync } from "node:fs";
import {
  commitConditionalFiles,
  confinedPath,
  readOptionalBytes,
  type ConditionalFile,
} from "./conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";
import {
  isVersionProjectPath,
  versionDigest,
  projectVersionFiles,
  sourceRevision,
  validateVersionDependencies,
  versionFileHashes,
  type VersionBytes,
} from "./versionFiles.js";
import {
  parseVersionIndex,
  versionBlobPath,
  versionIndexPath,
  type FrozenVersion,
  type VersionIndex,
} from "./versionTypes.js";

const MAX_AUTO = 100;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const hash = (bytes: Buffer | null) => (bytes === null ? null : fileContentVersion(bytes));
export function readVersionIndex(root: string) {
  const bytes = readOptionalBytes(confinedPath(root, versionIndexPath));
  return { index: parseVersionIndex(bytes), token: hash(bytes) };
}
function frozenVersion(
  files: VersionBytes,
  name: string | null,
  allowUnavailable = false,
): FrozenVersion {
  const replayError = dependencyError(files);
  if (replayError && !allowUnavailable) throw new Error(replayError);
  return {
    replayError,
    id: randomUUID(),
    revision: sourceRevision(files),
    name,
    createdAt: Date.now(),
    files: versionFileHashes(files),
    sourceBytes: Object.entries(files).reduce(
      (sum, [path, bytes]) => sum + (/\.(html|css|js|json)$/.test(path) ? bytes.length : 0),
      0,
    ),
  };
}
function dependencyError(files: VersionBytes): string | null {
  try {
    validateVersionDependencies(files);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Version riippuvuuksia ei voitu tarkistaa.";
  }
}
function retain(versions: FrozenVersion[]) {
  let count = 0,
    bytes = 0;
  return [...versions]
    .reverse()
    .filter((v) => {
      if (v.name !== null) return true;
      count++;
      bytes += v.sourceBytes + Buffer.byteLength(JSON.stringify(v));
      return count <= MAX_AUTO && bytes <= MAX_SOURCE_BYTES;
    })
    .reverse();
}
function objectWrites(root: string, files: Buffer[]): ConditionalFile[] {
  const objects = new Map(files.map((bytes) => [versionDigest(bytes), bytes]));
  const result: ConditionalFile[] = [];
  for (const [digest, content] of objects) {
    const path = versionBlobPath(digest);
    const existing = readOptionalBytes(confinedPath(root, path));
    if (existing !== null && versionDigest(existing) !== digest)
      throw new Error("Version aineisto on vioittunut.");
    if (existing === null) result.push({ path, content, expectedVersion: null });
  }
  return result;
}
/** Single conditional publication point for history and complete frozen manifests. */
export function saveProjectVersion(
  root: string,
  options: {
    expectedRevision: string;
    expectedIndex: string | null;
    name?: string;
    history?: unknown;
    beforeFiles?: Record<string, Buffer | null>;
  },
  finish: () => void = () => {},
) {
  const { index, token } = readVersionIndex(root);
  if (options.expectedIndex !== token)
    throw new Error("Muutoshistoria muuttui. Avaa projekti uudelleen.");
  const files = projectVersionFiles(root);
  if (sourceRevision(files) !== options.expectedRevision)
    throw new Error("Projekti muuttui. Lue tilanne uudelleen.");
  const current = frozenVersion(files, options.name ?? null, options.history !== undefined);
  if (
    current.name === null &&
    current.sourceBytes + Buffer.byteLength(JSON.stringify(current)) > MAX_SOURCE_BYTES
  )
    throw new Error("Lähdetiedostot ylittävät automaattihistorian 32 MiB:n rajan.");
  const { added, allBytes, beforeId } = versionBaseline(root, files, index, options.beforeFiles);
  added.push(current);
  const history =
    options.history === undefined
      ? index.history
      : bindHistoryVersion(options.history, current.id, beforeId);
  const next: VersionIndex = {
    schema: 1,
    versions: retain([...index.versions, ...added]),
    history,
    operations: bindSourceOperation(
      root,
      options.history === undefined ? undefined : parseVersionHistory(options.history),
      current.id,
      current.revision,
      index.operations ?? [],
    ),
  };
  const content = Buffer.from(JSON.stringify(next));
  commitConditionalFiles(
    root,
    [...objectWrites(root, allBytes), { path: versionIndexPath, content, expectedVersion: token }],
    () => {
      if (sourceRevision(projectVersionFiles(root)) !== current.revision)
        throw new Error("Projekti muuttui tallennuksen aikana.");
      finish();
    },
  );
  // Orphans from old retention windows are harmless. Cleanup never affects publication success.
  collectVersionObjects(root, next);
  return { version: current, indexToken: hash(content), history: next.history };
}
function versionBaseline(
  root: string,
  files: VersionBytes,
  index: VersionIndex,
  overrides?: Record<string, Buffer | null>,
) {
  const added: FrozenVersion[] = [],
    allBytes = Object.values(files);
  if (!overrides) return { added, allBytes, beforeId: undefined };
  const before = { ...files };
  for (const [path, content] of Object.entries(overrides)) {
    confinedPath(root, path);
    if (!isVersionProjectPath(path)) throw new Error("Historia ei saa muokata versiosäilöä.");
    if (content === null) delete before[path];
    else before[path] = content;
  }
  const baseline = frozenVersion(before, null, true);
  const existing = index.versions.find((v) => v.revision === baseline.revision);
  if (!existing) added.push(baseline);
  allBytes.push(...Object.values(before));
  return { added, allBytes, beforeId: existing?.id ?? baseline.id };
}
function bindHistoryVersion(input: unknown, afterId: string, beforeId?: string) {
  if (!input) return input;
  const history = structuredClone(parseVersionHistory(input));
  const entry = history.undo.at(-1);
  if (entry && !entry.afterVersionId) {
    entry.afterVersionId = afterId;
    entry.beforeVersionId = beforeId;
  }
  return history;
}
function collectVersionObjects(root: string, index: VersionIndex) {
  const used = new Set(index.versions.flatMap((v) => Object.values(v.files)));
  try {
    for (const file of readdirSync(confinedPath(root, ".ari-versions/objects"))) {
      if (!used.has(file)) unlinkSync(confinedPath(root, versionBlobPath(file)));
    }
  } catch {
    /* Retry collection after the next successful publication. */
  }
}
export function readProjectVersion(root: string, id: string) {
  const version = readVersionIndex(root).index.versions.find((v) => v.id === id);
  if (!version) throw new Error("Versiota ei ole säilytetty.");
  const files: VersionBytes = {};
  for (const [path, digest] of Object.entries(version.files)) {
    confinedPath(root, path);
    if (!isVersionProjectPath(path)) throw new Error("Version polku ei kelpaa.");
    const content = readOptionalBytes(confinedPath(root, versionBlobPath(digest)));
    if (content === null || versionDigest(content) !== digest)
      throw new Error(`Version aineisto puuttuu tai on vioittunut: ${path}`);
    files[path] = content;
  }
  if (sourceRevision(files) !== version.revision)
    throw new Error("Version lähdetiedot ovat vioittuneet.");
  validateVersionDependencies(files);
  return { version, files };
}
export function prepareVersionRestore(root: string, id: string) {
  const { version, files } = readProjectVersion(root, id);
  const current = projectVersionFiles(root);
  const changes = Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(files)])].sort().flatMap((path) => {
      if (hash(current[path] ?? null) === hash(files[path] ?? null)) return [];
      return [
        [
          path,
          {
            before: current[path]?.toString("base64") ?? null,
            after: files[path]?.toString("base64") ?? null,
            encoding: "base64" as const,
          },
        ],
      ];
    }),
  );
  return { version, expectedRevision: sourceRevision(current), files: changes };
}

/** Named versions are removed only by this explicit, index-bound operation. */
export function deleteProjectVersion(root: string, id: string, expectedIndex: string | null) {
  const { index, token } = readVersionIndex(root);
  if (token !== expectedIndex) throw new Error("Versiolista muuttui. Lue tilanne uudelleen.");
  if (!index.versions.some((v) => v.id === id)) throw new Error("Versiota ei ole säilytetty.");
  const next = { ...index, versions: index.versions.filter((v) => v.id !== id) };
  const content = Buffer.from(JSON.stringify(next));
  commitConditionalFiles(root, [{ path: versionIndexPath, expectedVersion: token, content }]);
  collectVersionObjects(root, next);
  return { indexToken: hash(content) };
}
