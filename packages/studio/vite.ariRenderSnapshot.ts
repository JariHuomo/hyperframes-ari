/** Ari render inputs and persistent versions share the same byte manifest. */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  projectVersionFiles,
  sourceRevision,
  versionFileHashes,
} from "../studio-server/src/ari/versionFiles";
export function createAriRenderSnapshot(projectDir: string) {
  const dir = mkdtempSync(join(tmpdir(), "ari-render-"));
  try {
    const bytes = projectVersionFiles(projectDir);
    const revision = sourceRevision(bytes);
    for (const [path, content] of Object.entries(bytes)) {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    if (sourceRevision(projectVersionFiles(projectDir)) !== revision)
      throw new Error("Aineisto muuttui vientiä valmisteltaessa. Yritä uudelleen.");
    return {
      dir,
      revision,
      files: versionFileHashes(bytes),
      dispose: () => rmSync(dir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
