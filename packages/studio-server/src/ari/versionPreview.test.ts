// @vitest-environment node
import { expect, it } from "vitest";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { projectVersionPreview } from "./versionPreview";
import { saveProjectVersion, readVersionIndex } from "./versionStore";
import { sourceRevision, projectVersionFiles } from "./versionFiles";
import { versionBlobPath } from "./versionTypes";
import { versionTestProject } from "./versionTestProject";
function fixture() {
  const image = readFileSync(
    new URL("../../../studio/tests/e2e/fixtures/ari-authoring/one.png", import.meta.url),
  );
  const root = versionTestProject({
    "assets/image.png": image,
    "assets/gsap.js": readFileSync(createRequire(import.meta.url).resolve("gsap/dist/gsap.js")),
    "index.html":
      '<html><head></head><body><div data-composition-id="main" data-duration="7" data-width="1080" data-height="1920"><img src="assets/image.png"></div><script src="assets/gsap.js"></script><script>window.__timelines={main:gsap.timeline({paused:true}).to({}, {duration:7})};</script></body></html>',
  });
  const saved = saveProjectVersion(root, {
    name: "Ennen",
    expectedRevision: sourceRevision(projectVersionFiles(root)),
    expectedIndex: readVersionIndex(root).token,
  });
  return { root, saved, image };
}
it("bundles frozen sources and old image without changing active files", async () => {
  const { root, saved, image } = fixture();
  writeFileSync(join(root, "index.html"), "new source");
  unlinkSync(join(root, "assets/image.png"));
  const result = await projectVersionPreview(root, saved.version.id);
  expect(result).toMatchObject({ width: 1080, height: 1920, duration: 7 });
  expect(result.html).toContain(image.toString("base64"));
  expect(result.html).toContain("connect-src 'none'");
  expect(result.html).not.toContain("/api/projects/");
  expect(readFileSync(join(root, "index.html"), "utf8")).toBe("new source");
});
it("refuses a missing frozen dependency rather than using current assets", async () => {
  const { root, saved } = fixture();
  unlinkSync(join(root, versionBlobPath(saved.version.files["assets/image.png"]!)));
  await expect(projectVersionPreview(root, saved.version.id)).rejects.toThrow();
});
it("refuses a corrupt source and an unavailable version ID", async () => {
  const { root, saved } = fixture();
  writeFileSync(join(root, versionBlobPath(saved.version.files["index.html"]!)), "corrupt");
  await expect(projectVersionPreview(root, saved.version.id)).rejects.toThrow();
  await expect(projectVersionPreview(root, "missing")).rejects.toThrow();
});
