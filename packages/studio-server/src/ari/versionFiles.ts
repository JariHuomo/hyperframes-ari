import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { parseHTML } from "linkedom";
import { confinedPath } from "./conditionalFiles.js";
import { createHash } from "node:crypto";
export const versionDigest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

const VERSION_DIRECTORY = ".ari-versions";
const excluded = new Set([
  VERSION_DIRECTORY,
  ".ari-notebook",
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
export const isVersionProjectPath = (path: string) =>
  !path.startsWith(".hyperframes/backup/") &&
  !path
    .split("/")
    .some((part) => excluded.has(part) || ["__proto__", "constructor", "prototype"].includes(part));
export type VersionBytes = Record<string, Buffer>;
export function projectVersionFiles(root: string): VersionBytes {
  const files: VersionBytes = {};
  let size = 0;
  function walk(relative = "") {
    for (const name of readdirSync(relative ? confinedPath(root, relative) : root).sort()) {
      if (excludedDirectoryEntry(relative, name)) continue;
      if (!isVersionProjectPath(name)) throw new Error("Tiedoston nimi ei kelpaa versiosäilöön.");
      const path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw new Error(`Versio ei tue linkkiä: ${path}`);
      const absolute = confinedPath(root, path);
      if (stat.isDirectory()) walk(path);
      else {
        add(path, absolute, stat.isFile(), stat.size);
      }
    }
  }
  function add(path: string, absolute: string, regular: boolean, length: number) {
    if (!regular) throw new Error(`Versio ei tue tiedostoa: ${path}`);
    size += length;
    if (size > 512 * 1024 * 1024 || Object.keys(files).length >= 4096)
      throw new Error("Projektin versio ylittää 512 MiB:n tai 4096 tiedoston rajan.");
    files[path] = readFileSync(absolute);
  }
  walk();
  return files;
}
export function versionFileHashes(files: VersionBytes) {
  return Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((path) => [path, versionDigest(files[path]!)]),
  );
}
/** Canonical sorted path/hash manifest shared with the A5 exporter. */
export function sourceRevision(files: VersionBytes) {
  return versionDigest(JSON.stringify(versionFileHashes(files)));
}
export function validateVersionDependencies(files: VersionBytes) {
  function check(from: string, reference: string) {
    if (!reference || reference.startsWith("#") || reference.startsWith("data:")) return;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference))
      throw new Error(`Versio tarvitsee paikallisen aineiston: ${from} → ${reference}`);
    const decoded = decodeURIComponent(reference.split(/[?#]/)[0]!);
    const path = posix.normalize(
      decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(from), decoded),
    );
    if (!Object.hasOwn(files, path)) throw new Error(`Version aineisto puuttuu: ${from} → ${path}`);
  }
  function css(from: string, text: string) {
    for (const match of text.matchAll(
      /url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g,
    ))
      check(from, (match[1] ?? match[2]!).trim());
  }
  function html(path: string, text: string) {
    const { document } = parseHTML(text);
    if (document.querySelector("base, script[type=module], [srcset]"))
      throw new Error(`Versio ei vielä tue base-, moduuli- tai srcset-rakennetta: ${path}`);
    for (const el of document.querySelectorAll(
      "[src], [poster], [data-composition-src], link[href]",
    )) {
      for (const attr of ["src", "poster", "data-composition-src", "href"]) {
        const ref = el.getAttribute(attr);
        if (ref) check(path, ref);
      }
    }
    for (const el of document.querySelectorAll("style, [style]"))
      css(path, el.tagName === "STYLE" ? (el.textContent ?? "") : (el.getAttribute("style") ?? ""));
  }
  for (const [path, bytes] of Object.entries(files)) {
    if (path.endsWith(".css")) css(path, bytes.toString());
    if (!path.endsWith(".html")) continue;
    html(path, bytes.toString());
  }
}

function excludedDirectoryEntry(relative: string, name: string) {
  return excluded.has(name) || (relative === ".hyperframes" && name === "backup");
}
