// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { imageShelf, importImage, validateImage, IMAGE_MAX_BYTES } from "./imageImport";
const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "ari-images-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const fixture = (format: "png" | "jpeg" | "webp", width = 100) =>
  sharp({ create: { width, height: width, channels: 3, background: "#227744" } })
    .toFormat(format)
    .toBuffer();
it.each(["png", "jpeg", "webp"] as const)(
  "copies %s, survives deleting the selected original and reopens with the same checksum",
  async (format) => {
    const root = temp(),
      original = join(temp(), `source.${format}`),
      bytes = await fixture(format);
    writeFileSync(original, bytes);
    const receipt = await importImage(root, `source.${format}`, readFileSync(original));
    rmSync(original);
    expect(readFileSync(join(root, receipt.asset.path))).toEqual(bytes);
    expect(await imageShelf(root)).toMatchObject([
      {
        name: `source.${format}`,
        path: receipt.asset.path,
        checksum: receipt.asset.checksum,
        width: 100,
        height: 100,
      },
    ]);
    expect((await importImage(root, `source.${format}`, bytes)).reused).toBe(true);
  },
);
it("keeps other imports after rejection and rejects MIME spoofing, truncation and unsupported bytes", async () => {
  const root = temp(),
    bytes = await fixture("png");
  const good = await importImage(root, "good.png", bytes);
  await expect(importImage(root, "fake.jpg", bytes)).rejects.toThrow("pääte");
  await expect(
    importImage(root, "broken.png", bytes.subarray(0, bytes.length / 2)),
  ).rejects.toThrow();
  await expect(
    importImage(root, "fake.png", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  ).rejects.toThrow("ei ole");
  expect((await imageShelf(root))[0]!.checksum).toBe(good.asset.checksum);
});
it("enforces encoded and decoded limits", async () => {
  expect(() => validateImage(Buffer.alloc(IMAGE_MAX_BYTES + 1), "large.png")).toThrow("8 MiB");
  await expect(importImage(temp(), "large.png", await fixture("png", 4100))).rejects.toThrow(
    "16 megapikselin",
  );
});
it("rejects path names and symlink destinations", async () => {
  const root = temp(),
    outside = temp(),
    bytes = await fixture("png");
  symlinkSync(outside, join(root, "assets"));
  await expect(importImage(root, "good.png", bytes)).rejects.toThrow("Linkitettyyn");
  await expect(importImage(temp(), "../bad.png", bytes)).rejects.toThrow("nimi");
});
it("refuses a shelf whose image was changed externally", async () => {
  const root = temp();
  const receipt = await importImage(root, "good.png", await fixture("png"));
  writeFileSync(join(root, receipt.asset.path), "external");
  await expect(imageShelf(root)).rejects.toThrow("muuttunut");
});
