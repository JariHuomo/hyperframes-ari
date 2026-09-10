import { readFileSync } from "node:fs";
import { confinedPath } from "./conditionalFiles.js";
import { versionDigest } from "./versionFiles.js";

/** One published file inside a review package, bound by length and checksum. */
export interface ReviewAsset {
  path: string;
  sha256: string;
  bytes: number;
}
export function reviewAsset(dir: string, path: string): ReviewAsset {
  const bytes = readFileSync(confinedPath(dir, path));
  if (!bytes.length) throw new Error("Tarkistusaineisto on tyhjä.");
  return { path, sha256: versionDigest(bytes), bytes: bytes.length };
}
