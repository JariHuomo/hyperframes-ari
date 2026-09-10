/** Entirely synthetic, deterministic, local fixtures and decode measurements. */
import sharp from "sharp";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { validateImage } from "../src/ari/imageImport";
const root = resolve(import.meta.dirname, "../../..");
const fixtures = join(root, "packages/studio/tests/e2e/fixtures/ari-authoring");
const evidence = join(root, "screenshots/2026-09-09-a1-a2");
mkdirSync(fixtures, { recursive: true });
mkdirSync(evidence, { recursive: true });
const rows = [];
for (const [name, width, height] of [
  ["one", 1000, 1000],
  ["four", 2000, 2000],
  ["sixteen", 4000, 4000],
  ["oversize", 4100, 4100],
] as const) {
  const image = sharp({ create: { width, height, channels: 3, background: "#2b7057" } });
  const bytes = await image.png().toBuffer();
  writeFileSync(join(fixtures, `${name}.png`), bytes);
  const timings = [];
  let error: string | null = null,
    decodedBytes = 0;
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    try {
      const result = await validateImage(bytes, `${name}.png`);
      timings.push(result.decodeMs);
      decodedBytes = result.decodedBytes;
    } catch (reason) {
      error = String(reason);
      timings.push(Math.round((performance.now() - start) * 100) / 100);
    }
  }
  rows.push({
    name,
    width,
    height,
    pixels: width * height,
    bytes: bytes.length,
    decodedBytes,
    decodeMs: timings,
    error,
  });
}
for (const format of ["jpeg", "webp"] as const)
  writeFileSync(
    join(fixtures, `product.${format}`),
    await sharp(readFileSync(join(fixtures, "one.png")))
      .toFormat(format)
      .toBuffer(),
  );
writeFileSync(join(fixtures, "invalid.png"), "This is a synthetic invalid image, not PNG bytes.\n");
writeFileSync(
  join(fixtures, "truncated.png"),
  readFileSync(join(fixtures, "one.png")).subarray(0, 80),
);
const start = performance.now();
let encodedLimitError;
try {
  await validateImage(Buffer.alloc(8 * 1024 * 1024 + 1), "large.png");
} catch (error) {
  encodedLimitError = String(error);
}
const encodedElapsedMs = Math.round((performance.now() - start) * 100) / 100;
const denseRows = [];
for (const width of [1500, 2000]) {
  let seed = 123456789;
  const raw = Buffer.alloc(width * width * 3);
  for (let i = 0; i < raw.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    raw[i] = seed & 255;
  }
  const encoded = await sharp(raw, { raw: { width, height: width, channels: 3 } })
    .png()
    .toBuffer();
  const started = performance.now();
  let decoded = null,
    error = null;
  try {
    decoded = await validateImage(encoded, "dense.png");
  } catch (reason) {
    error = String(reason);
  }
  denseRows.push({
    width,
    height: width,
    bytes: encoded.length,
    decoded,
    error,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
  });
}
const report = {
  providerSpendUsd: 0,
  machine: { platform: process.platform, arch: process.arch, sharp: sharp.versions },
  rows,
  denseRows,
  encodedOversize: {
    bytes: 8 * 1024 * 1024 + 1,
    error: encodedLimitError,
    elapsedMs: encodedElapsedMs,
  },
};
writeFileSync(join(evidence, "image-measurements.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
