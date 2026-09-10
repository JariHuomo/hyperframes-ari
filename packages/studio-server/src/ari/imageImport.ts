import sharp from "sharp";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { commitConditionalFiles, confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 16_000_000;
let decodeQueue: Promise<unknown> = Promise.resolve();
function serialDecode<T>(job: () => Promise<T>): Promise<T> {
  const result = decodeQueue.then(job, job);
  decodeQueue = result.catch(() => {});
  return result;
}
function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  throw new Error("Tiedosto ei ole PNG-, JPEG- tai WebP-kuva.");
}
export function validateImage(bytes: Buffer, name: string) {
  if (
    !name ||
    name.length > 160 ||
    /[/\\]/.test(name) ||
    [...name].some((char) => char.charCodeAt(0) < 32)
  )
    throw new Error("Kuvan nimi ei kelpaa.");
  if (bytes.length > IMAGE_MAX_BYTES)
    throw new Error("Kuva on liian suuri. Enimmäiskoko on 8 MiB.");
  const format = imageType(bytes);
  const suffix = extname(name).toLowerCase();
  if (!(format === "jpeg" ? [".jpg", ".jpeg"] : [`.${format}`]).includes(suffix))
    throw new Error("Tiedoston pääte ei vastaa kuvan sisältöä.");
  return serialDecode(async () => {
    const start = performance.now();
    try {
      const source = sharp(bytes, {
        limitInputPixels: IMAGE_MAX_PIXELS,
        failOn: "warning",
        sequentialRead: true,
      });
      const metadata = await source.metadata();
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > IMAGE_MAX_PIXELS ||
        (metadata.pages ?? 1) !== 1
      )
        throw new Error("Kuvassa saa olla enintään 16 megapikseliä ja yksi ruutu.");
      // A complete decode catches truncated data that header-only inspection misses.
      const { data, info } = await source
        .timeout({ seconds: 10 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        format,
        width: info.width,
        height: info.height,
        bytes: bytes.length,
        decodedBytes: data.length,
        decodeMs: Math.round((performance.now() - start) * 100) / 100,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("16 megapikseliä")) throw error;
      throw new Error("Kuvaa ei voitu avata. Tarkista tiedosto ja enintään 16 megapikselin koko.");
    }
  });
}
export async function importImage(root: string, name: string, bytes: Buffer) {
  const info = await validateImage(bytes, name);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const path = `assets/imports/${checksum}.${info.format === "jpeg" ? "jpg" : info.format}`;
  const absolute = confinedPath(root, path);
  try {
    if (statSync(absolute).size > IMAGE_MAX_BYTES)
      throw new Error("Aineisto muuttui. Tuo kuva uudelleen.");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const existing = readOptionalBytes(absolute);
  if (existing && !existing.equals(bytes))
    throw new Error("Aineisto muuttui. Tuontia ei tallennettu.");
  const files = existing
    ? [{ path, version: fileContentVersion(existing), exists: true }]
    : commitConditionalFiles(root, [
        { path, expectedVersion: null, content: bytes },
        {
          path: path + ".json",
          expectedVersion: null,
          content: Buffer.from(JSON.stringify({ name })),
        },
      ]);
  return {
    ok: true as const,
    stage: "saved",
    asset: { name, path, checksum, ...info },
    files,
    version: files[0]!.version,
    affectsProjects: 1,
    reused: Boolean(existing),
  };
}
export async function imageShelf(root: string) {
  const dir = confinedPath(root, "assets/imports");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const items = [];
  for (const name of names.sort()) {
    if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(name)) continue;
    const path = `assets/imports/${name}`;
    const absolute = confinedPath(root, path);
    if (statSync(absolute).size > IMAGE_MAX_BYTES)
      throw new Error("Aineistohyllyn kuva ylittää 8 MiB:n rajan.");
    const bytes = readFileSync(absolute);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (name.split(".")[0] !== checksum)
      throw new Error("Aineistohyllyn kuva on muuttunut. Tuo kuva uudelleen.");
    const info = await validateImage(bytes, name);
    const metadataPath = confinedPath(root, path + ".json");
    if (statSync(metadataPath).size > 4096) throw new Error("Kuvan nimitiedot eivät kelpaa.");
    const savedName: unknown = JSON.parse(readFileSync(metadataPath, "utf8")).name;
    items.push({
      path,
      name: typeof savedName === "string" ? savedName : name,
      checksum,
      width: info.width,
      height: info.height,
      bytes: bytes.length,
    });
  }
  return items;
}
