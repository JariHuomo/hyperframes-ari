/** Real Studio export evidence, enabled separately from the A3/A4 journeys. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { prepareDownload, downloadExport, probeVideo } from "./ariBrowserEvidence.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function exportSceneAcceptance({ p, current, root, evidence }) {
  if (process.env.ARI_SCENE_EXPORT !== "1") return;
  const directory = join(evidence, `${current.mode}-${current.width}-export`);
  mkdirSync(directory, { recursive: true });
  const { completed } = await prepareDownload(p, directory, 300000);
  const { video, filename } = await downloadExport(p, directory, completed, 300000);
  const probe = probeVideo(video);
  const stream = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(stream.width, 1080);
  assert.equal(stream.height, 1920);
  assert.equal(stream.r_frame_rate, "30/1");
  assert.equal(Number(probe.format.duration), current.final.duration);
  const meta = JSON.parse(
    readFileSync(
      join(
        root,
        "packages/studio/data/renders",
        current.project,
        filename.replace(/\.mp4$/, ".meta.json"),
      ),
      "utf8",
    ),
  );
  const visibleRevision = await p.$eval("[data-source-revision]", (e) => e.dataset.sourceRevision);
  assert.equal(visibleRevision, meta.sourceRevision);
  const projectDir = join(root, "packages/studio/data/projects", current.project);
  if (current.expectedSourceFiles) assert.deepEqual(meta.sourceFiles, current.expectedSourceFiles);
  else verifySavedInputs(projectDir, meta.sourceFiles);
  const frames = boundaryFrames(current.final);
  const samples = [...frames]
    .sort((a, b) => a - b)
    .map((frame) => {
      const out = join(directory, `frame-${String(frame).padStart(4, "0")}.png`);
      const result = spawnSync(
        "ffmpeg",
        ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-y", out],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      const raw = spawnSync(
        "ffmpeg",
        ["-v", "error", "-i", out, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      assert.equal(raw.status, 0, raw.stderr?.toString());
      return { frame, image: out, rgbSha256: hash(raw.stdout) };
    });
  current.export = { video, sha256: hash(readFileSync(video)), probe, meta, samples };
  current.checks.push(
    "real Studio MP4 matches saved input checksums and visible export revision; first/last and scene boundary frames decoded",
  );
}
export function compareSceneExports(report) {
  if (process.env.ARI_SCENE_EXPORT !== "1") return;
  const baseline = report.modes[0].export.samples.map(({ frame, rgbSha256 }) => ({
    frame,
    rgbSha256,
  }));
  for (const mode of report.modes)
    assert.deepEqual(
      mode.export.samples.map(({ frame, rgbSha256 }) => ({ frame, rgbSha256 })),
      baseline,
    );
  const decoded = report.modes.map((mode) => {
    const result = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", mode.export.video, "-map", "0:v:0", "-f", "framemd5", "-"],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    assert.equal(result.status, 0, result.stderr);
    const frames = result.stdout.split("\n").filter((line) => line && !line.startsWith("#"));
    return { mode: mode.mode, width: mode.width, frames, sha256: hash(frames.join("\n")) };
  });
  for (const item of decoded) assert.deepEqual(item.frames, decoded[0].frames);
  report.fullFrameComparison = decoded.map(({ frames, ...item }) => ({
    ...item,
    count: frames.length,
  }));
  report.fullHeightBackground = report.modes.map(verifyFullHeightBackground);
  report.originalAndCopyVisible = report.modes.map(verifyOriginalAndCopy);
  report.equivalentExportFrames = true;
  report.pixelTolerance = 0;
}

function boundaryFrames(timeline) {
  const frames = new Set([0, Math.round(timeline.duration * 30) - 1]);
  const points = [
    0,
    0.3,
    0.6,
    ...(timeline.sampleTimes ?? []),
    ...timeline.rows.flatMap((row) => [
      row.start,
      row.start + 0.3,
      row.start + 0.6,
      row.start + row.duration,
    ]),
  ];
  for (const point of points) addBoundaryFrames(frames, point, timeline.duration);
  return frames;
}

function addBoundaryFrames(frames, point, duration) {
  for (const delta of [-1, 0, 1]) {
    const frame = Math.round(point * 30) + delta;
    if (frame >= 0 && frame < duration * 30) frames.add(frame);
  }
}

function verifySavedInputs(projectDir, files) {
  for (const [path, checksum] of Object.entries(files))
    assert.equal(hash(readFileSync(join(projectDir, path))), checksum, path);
}

function verifyFullHeightBackground(mode) {
  const bytes = decodedFrame(mode.export.video, 209);
  const pixel = (y) => [...bytes.subarray((y * 1080 + 20) * 3, (y * 1080 + 20) * 3 + 3)];
  const reference = pixel(1600),
    bottom = pixel(1910);
  assert.ok(
    bottom.every((value, i) => Math.abs(value - reference[i]) <= 3),
    "portrait background reaches bottom edge",
  );
  return { mode: mode.mode, width: mode.width, frame: 209, reference, bottom, channelTolerance: 3 };
}

function decodedFrame(video, frame) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      video,
      "-vf",
      `select=eq(n\\,${frame})`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
}
function verifyOriginalAndCopy(mode) {
  const offset = (900 * 1080 + 540) * 3;
  const samples = [240, 300].map((frame) => {
    const bytes = decodedFrame(mode.export.video, frame);
    return { frame, rgb: [...bytes.subarray(offset, offset + 3)] };
  });
  for (const sample of samples)
    assert.ok(
      sample.rgb[1] > 80 && sample.rgb[1] > sample.rgb[0] * 2,
      "synthetic green image visible in original AND detached copy",
    );
  assert.deepEqual(samples[0].rgb, samples[1].rgb);
  return { mode: mode.mode, width: mode.width, samples };
}
