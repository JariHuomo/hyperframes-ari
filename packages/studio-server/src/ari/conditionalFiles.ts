import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  renameSync,
  linkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { fileContentVersion } from "../helpers/fileVersion.js";

export interface ConditionalFile {
  path: string;
  /** null means absent, including when the replacement is an empty file. */
  expectedVersion: string | null;
  content: Buffer | null;
}

export function confinedPath(root: string, path: string): string {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Tiedoston sijainti ei kelpaa.");
  const base = realpathSync(root);
  const target = resolve(base, path);
  if (!target.startsWith(base + sep)) throw new Error("Tiedosto ei kuulu projektiin.");
  let current = base;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error("Linkitettyyn kansioon tai tiedostoon ei kirjoiteta.");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return target;
}
function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
export function readOptionalBytes(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
const version = (bytes: Buffer | null) => (bytes === null ? null : fileContentVersion(bytes));

/** Synchronous compare/write sections; no async gap between the condition and mutation.
 * All compensations are attempted; a concurrent change is preserved and reported.
 * This is process-level compensation, not a crash-safe multi-file disk transaction.
 */
export function commitConditionalFiles(
  root: string,
  files: ConditionalFile[],
  finish: () => void = () => {},
) {
  if (new Set(files.map((file) => file.path)).size !== files.length)
    throw new Error("Sama tiedosto on mukana kahdesti.");
  const before = files.map((file) => {
    const bytes = readOptionalBytes(confinedPath(root, file.path));
    if (version(bytes) !== file.expectedVersion)
      throw new Error(`Tiedosto muuttui: ${file.path}. Lue tilanne uudelleen.`);
    return bytes;
  });
  const written: number[] = [];
  const createdDirs: string[] = [];
  function apply(file: ConditionalFile) {
    const path = confinedPath(root, file.path);
    if (version(readOptionalBytes(path)) !== file.expectedVersion)
      throw new Error(`Tiedosto muuttui: ${file.path}. Lue tilanne uudelleen.`);
    if (file.content === null) {
      if (file.expectedVersion !== null) unlinkSync(path);
      return;
    }
    ensureParentDirectories(root, path, createdDirs);
    publishReplacement(root, { ...file, content: file.content }, path);
  }
  try {
    files.forEach((file, index) => {
      apply(file);
      written.push(index);
    });
    finish();
  } catch (error) {
    const errors = [error];
    for (const index of written.reverse()) {
      const file = files[index]!;
      try {
        apply({ path: file.path, expectedVersion: version(file.content), content: before[index]! });
      } catch (rollbackError) {
        errors.push(rollbackError);
      }
    }
    for (const dir of createdDirs.reverse()) {
      try {
        rmdirSync(dir);
      } catch {
        /* Never remove a directory containing a concurrent file. */
      }
    }
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "Muutoksen palautus jäi kesken. Muiden tekemät muutokset säilytettiin.",
      );
    throw error;
  }
  return files.map((file) => ({
    path: file.path,
    version: version(file.content),
    exists: file.content !== null,
  }));
}

function ensureParentDirectories(root: string, path: string, createdDirs: string[]) {
  const missing: string[] = [];
  for (let parent = dirname(path); parent !== realpathSync(root); parent = dirname(parent)) {
    try {
      lstatSync(parent);
      break;
    } catch (error) {
      if (!isMissing(error)) throw error;
      missing.push(parent);
    }
  }
  for (const dir of missing.reverse()) {
    mkdirSync(dir);
    createdDirs.push(dir);
  }
}
function publishReplacement(
  root: string,
  file: ConditionalFile & { content: Buffer },
  path: string,
) {
  const temporary = join(dirname(path), `.ari-write-${randomUUID()}`);
  try {
    // A failed/partial write only touches our temporary file, never the source.
    writeFileSync(temporary, file.content, { flag: "wx" });
    confinedPath(root, file.path);
    if (version(readOptionalBytes(path)) !== file.expectedVersion)
      throw new Error(`Tiedosto muuttui: ${file.path}. Lue tilanne uudelleen.`);
    if (file.expectedVersion === null)
      linkSync(temporary, path); // exclusive publication
    else renameSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // A leftover private temp file must not turn a published write into a false failure.
    }
  }
}
