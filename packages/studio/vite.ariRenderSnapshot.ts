/** Ari local renders freeze input bytes before the asynchronous producer starts. */
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const excluded = new Set([
  ".git",
  "node_modules",
  "renders",
  "outputs",
  "evidence",
  "snapshots",
  ".thumbnails",
  ".cache",
  ".transcode-cache",
  ".waveform-cache",
]);
export function createAriRenderSnapshot(projectDir: string) {
  const root = realpathSync(projectDir);
  const dir = mkdtempSync(join(tmpdir(), "ari-render-"));
  const files: Record<string, string> = {};
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  function walk(relative = "") {
    for (const entry of readdirSync(join(root, relative)).sort()) {
      if (excluded.has(entry)) continue;
      const path = relative ? `${relative}/${entry}` : entry;
      const source = join(root, path),
        target = join(dir, path),
        stat = lstatSync(source);
      if (stat.isSymbolicLink())
        throw new Error(`Vienti ei tue projektin sisäistä linkkiä: ${path}`);
      if (stat.isDirectory()) {
        mkdirSync(target, { recursive: true });
        walk(path);
      } else if (stat.isFile()) {
        const bytes = readFileSync(source);
        files[path] = hash(bytes);
        writeFileSync(target, bytes);
      }
    }
  }
  try {
    walk();
    // Refuse a torn snapshot. Changes after this point cannot alter frozen bytes.
    for (const [path, version] of Object.entries(files))
      if (hash(readFileSync(join(root, path))) !== version)
        throw new Error("Aineisto muuttui vientiä valmisteltaessa. Yritä uudelleen.");
    const revision = createHash("sha256").update(JSON.stringify(files)).digest("hex");
    return { dir, revision, files, dispose: () => rmSync(dir, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
