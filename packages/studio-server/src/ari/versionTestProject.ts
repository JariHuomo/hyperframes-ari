import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
const temporaryProjects: string[] = [];
afterEach(() => {
  for (const root of temporaryProjects.splice(0)) rmSync(root, { recursive: true, force: true });
});
export function versionTestProject(files: Record<string, string | Buffer>) {
  const root = mkdtempSync(join(tmpdir(), "ari-version-test-"));
  temporaryProjects.push(root);
  for (const [path, bytes] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  return root;
}
