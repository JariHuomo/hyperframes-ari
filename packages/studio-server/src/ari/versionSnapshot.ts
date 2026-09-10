import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readProjectVersion } from "./versionStore.js";
import { confinedPath } from "./conditionalFiles.js";

/** Materialize verified frozen bytes once. Never reread the active project. */
export function createFrozenVersionSnapshot(root: string, id: string) {
  const { version, files } = readProjectVersion(root, id);
  const dir = mkdtempSync(join(tmpdir(), "ari-frozen-version-"));
  const dispose = () => rmSync(dir, { recursive: true, force: true });
  try {
    for (const [path, bytes] of Object.entries(files)) {
      const target = confinedPath(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes, { flag: "wx" });
    }
    return { dir, version, files, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
