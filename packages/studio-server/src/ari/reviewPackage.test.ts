import { expect, it } from "vitest";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { versionTestProject } from "./versionTestProject";
import { saveProjectVersion, readVersionIndex } from "./versionStore";
import { sourceRevision, projectVersionFiles } from "./versionFiles";
import { prepareReviewPackage, readReviewPackage, readReviewAsset } from "./reviewPackage";
import { versionBlobPath } from "./versionTypes";
import { affectsProjectSignature } from "../helpers/projectSignature";

const original =
  '<html><head></head><body><div data-composition-id="main" data-width="64" data-height="96" data-duration="0.1">original</div></body></html>';
function fixture() {
  const root = versionTestProject({ "index.html": original, "image.png": "frozen image" });
  const { version } = saveProjectVersion(root, {
    expectedRevision: sourceRevision(projectVersionFiles(root)),
    expectedIndex: null,
    name: "Test",
  });
  return { root, version };
}
const clip = (seconds: string) => (_dir: string, output: string) => {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=red:s=64x96:r=30:d=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
  return Promise.resolve();
};
const video = clip("0.1");
const comparedVideo = clip("0.2");
it("publishes complete frozen bytes despite current edits, and reads independently of producer state", async () => {
  const { root, version } = fixture();
  const index = readVersionIndex(root).token;
  const manifest = await prepareReviewPackage(root, version.id, async (dir, output) => {
    writeFileSync(join(root, "index.html"), "concurrent edit");
    expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(original);
    await video(dir, output);
  });
  expect(readReviewPackage(root, manifest.id)).toEqual(manifest);
  expect(readReviewAsset(root, manifest.id, "first.png")).toEqual(
    readReviewAsset(root, manifest.id, "last.png"),
  );
  expect(manifest.measured).toMatchObject({ frames: 3, fps: 30, width: 64, height: 96 });
  expect(readVersionIndex(root).token).toBe(index);
  expect(projectVersionFiles(root)).toEqual({
    "index.html": Buffer.from("concurrent edit"),
    "image.png": Buffer.from("frozen image"),
  });
  expect(
    affectsProjectSignature(
      root,
      join(root, ".ari-notebook/review-packages", manifest.id, "manifest.json"),
    ),
  ).toBe(false);
  expect(() => readReviewAsset(root, manifest.id, "../../index.html")).toThrow();
  writeFileSync(join(root, ".ari-notebook/review-packages", manifest.id, "last.png"), "broken");
  expect(() => readReviewPackage(root, manifest.id)).toThrow("vioittunut");
});
it("does not publish failed output and allows concurrent retries with distinct identities", async () => {
  const { root, version } = fixture();
  await expect(
    prepareReviewPackage(root, version.id, async (_dir, output) => {
      writeFileSync(output, "partial");
      throw new Error("render failed");
    }),
  ).rejects.toThrow("render failed");
  expect(readdirSync(join(root, ".ari-notebook/review-packages"))).toEqual([]);
  const results = await Promise.all([
    prepareReviewPackage(root, version.id, video),
    prepareReviewPackage(root, version.id, video),
  ]);
  expect(new Set(results.map((r) => r.id)).size).toBe(2);
  for (const result of results) expect(readReviewPackage(root, result.id)).toEqual(result);
  expect(sourceRevision(projectVersionFiles(root))).toBe(version.revision);
});
it.each(["missing", "corrupt"])(
  "refuses %s dependency before render without active fallback",
  async (failure) => {
    const { root, version } = fixture();
    const blob = join(root, versionBlobPath(version.files["image.png"]!));
    if (failure === "missing") unlinkSync(blob);
    else writeFileSync(blob, "broken");
    await expect(
      prepareReviewPackage(root, version.id, async () => {
        throw new Error("must not render");
      }),
    ).rejects.toThrow("puuttuu tai on vioittunut");
  },
);
it("refuses a symlinked package store", async () => {
  const { root, version } = fixture();
  const outside = versionTestProject({});
  symlinkSync(outside, join(root, ".ari-notebook"));
  await expect(prepareReviewPackage(root, version.id, video)).rejects.toThrow("Linkitettyyn");
  expect(readdirSync(outside)).toEqual([]);
});
it("refuses a shortened render and leaves no published package", async () => {
  const { root, version } = fixture();
  await expect(
    prepareReviewPackage(root, version.id, async (_dir, output) => {
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=64x96:r=30:d=0.033333",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        output,
      ]);
    }),
  ).rejects.toThrow("aikajanaa");
  expect(readdirSync(join(root, ".ari-notebook/review-packages"))).toEqual([]);
});
it("refuses altered frame metadata and missing published bytes", async () => {
  const { root, version } = fixture();
  const manifest = await prepareReviewPackage(root, version.id, video);
  const dir = join(root, ".ari-notebook/review-packages", manifest.id);
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ ...manifest, frames: manifest.frames.map((f) => ({ ...f, time: 99 })) }),
  );
  expect(() => readReviewPackage(root, manifest.id)).toThrow("ruutunumerot");
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  unlinkSync(join(dir, "video.mp4"));
  expect(() => readReviewPackage(root, manifest.id)).toThrow();
});

const shell = (body: string) =>
  `<html><head></head><body><div id="main" data-composition-id="main" data-width="64" data-height="96" data-duration="0.2">${body}</div></body></html>`;
const scene = (motions: string) =>
  `<html><head></head><body><div id="card" data-composition-id="card" data-width="64" data-height="96" data-duration="0.2"><div id="m"></div><div id="n"></div><div id="p"></div></div><script>const tl=gsap.timeline({paused:true});${motions}</script></body></html>`;
const keep = "tl.to('#m',{x:1,duration:0.1},0);";
const dropped =
  "tl.to('#n',{opacity:1,duration:0.1},0.1);tl.to('#p',{opacity:0,duration:0.1},0.1);";
function comparedFixture() {
  const root = versionTestProject({
    "index.html": shell(
      '<div id="a" class="clip" data-composition-src="scenes/card.html" data-label="A" data-start="0" data-duration="0.2" data-playback-start="0" data-playback-rate="1"></div>',
    ),
    "scenes/card.html": scene(keep + dropped),
  });
  const save = (name: string) =>
    saveProjectVersion(root, {
      expectedRevision: sourceRevision(projectVersionFiles(root)),
      expectedIndex: readVersionIndex(root).token,
      name,
    }).version;
  const previous = save("Ennen");
  writeFileSync(join(root, "scenes/card.html"), scene(keep));
  return { root, previous, current: save("Jälkeen") };
}
it("samples removed motion boundaries from the previous version and marks reuse and gaps", async () => {
  const { root, previous, current } = comparedFixture();
  const manifest = await prepareReviewPackage(root, current.id, comparedVideo, {
    previousVersionId: previous.id,
  });
  expect(manifest.coverage).toBe("changed-motion-boundaries");
  expect(manifest.coverageNotes).toEqual([]);
  expect(manifest.previousVersionId).toBe(previous.id);
  expect(manifest.previousVideo?.path).toBe("previous.mp4");
  expect(manifest.previousMeasured).toMatchObject({ frames: 6, fps: 30 });
  expect(new Set(manifest.boundaries.map((b) => b.versionId))).toEqual(new Set([previous.id]));
  expect(manifest.boundaries.map((b) => [b.edge, b.masterTime])).toEqual([
    ["start", 0.1],
    ["start", 0.1],
    ["end", 0.2],
    ["end", 0.2],
  ]);
  const statuses = manifest.boundaries.flatMap((b) => b.samples.map((s) => s.status));
  expect(statuses.filter((s) => s === "captured")).toHaveLength(4);
  expect(statuses.filter((s) => s === "reused")).toHaveLength(4);
  expect(statuses.filter((s) => s === "outside-video")).toHaveLength(4);
  expect(manifest.boundaries[2]!.samples.map((s) => s.frame)).toEqual([5, 6, 7]);
  expect(manifest.boundaries[2]!.samples.map((s) => s.path)).toEqual([
    "boundary-3.png",
    null,
    null,
  ]);
  expect(manifest.boundaryFrames.map((f) => [f.path, f.frame, f.time])).toEqual([
    ["boundary-0.png", 2, 2 / 30],
    ["boundary-1.png", 3, 3 / 30],
    ["boundary-2.png", 4, 4 / 30],
    ["boundary-3.png", 5, 5 / 30],
  ]);
  expect(readReviewPackage(root, manifest.id)).toEqual(manifest);
  expect(readReviewAsset(root, manifest.id, "boundary-0.png").length).toBeGreaterThan(0);
  expect(() => readReviewAsset(root, manifest.id, "boundary-9.png")).toThrow("ei kuulu");
});
it("refuses a boundary sample that no longer names a published frame", async () => {
  const { root, previous, current } = comparedFixture();
  const manifest = await prepareReviewPackage(root, current.id, comparedVideo, {
    previousVersionId: previous.id,
  });
  const path = join(root, ".ari-notebook/review-packages", manifest.id, "manifest.json");
  const tampered = structuredClone(manifest);
  tampered.boundaries[0]!.samples[1]!.frame = 4;
  writeFileSync(path, JSON.stringify(tampered));
  expect(() => readReviewPackage(root, manifest.id)).toThrow("näyte on vioittunut");
  writeFileSync(path, JSON.stringify({ ...manifest, boundaryFrames: [] }));
  expect(() => readReviewPackage(root, manifest.id)).toThrow();
});
it("refuses comparing a version with itself and leaves nothing published", async () => {
  const { root, current } = comparedFixture();
  await expect(
    prepareReviewPackage(root, current.id, comparedVideo, { previousVersionId: current.id }),
  ).rejects.toThrow("eri versio");
  expect(existsSync(join(root, ".ari-notebook/review-packages"))).toBe(false);
});
