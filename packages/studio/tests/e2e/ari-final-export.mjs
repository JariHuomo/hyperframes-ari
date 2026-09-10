/**
 * Ari · the real export half of the whole-delivery acceptance.
 *
 * One deliberate transport failure, one real retry, and a frame-for-frame
 * comparison of the four exported videos. A local MP4 is a draft file; nothing
 * here approves anything or publishes anything.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { prepareDownload, downloadExport, probeVideo } from "./ariBrowserEvidence.mjs";
import { injectRenderFailure } from "./ari-acceptance-browser.mjs";
import { digest, measureVideo } from "./ari-review-helpers.mjs";

/** Fail one render POST, then export for real through the visible controls. */
export async function faultyExport(p, entry, run) {
  await injectRenderFailure(p);
  return realExport(p, entry, run, { injected: "single POST transport 503" });
}
async function realExport(p, entry, run, fault) {
  const directory = join(run.evidence, `${entry.mode}-${entry.width}-export`);
  mkdirSync(directory, { recursive: true });
  const { completed } = await prepareDownload(p, directory, 900_000);
  const { video, filename } = await downloadExport(p, directory, completed, 900_000);
  const probe = probeVideo(video);
  const stream = probe.streams.find((row) => row.codec_type === "video");
  assert.equal(stream.width, 1080);
  assert.equal(stream.height, 1920);
  assert.equal(stream.r_frame_rate, "30/1");
  const meta = JSON.parse(
    readFileSync(
      join(
        run.root,
        "packages/studio/data/renders",
        entry.projectId,
        filename.replace(/\.mp4$/, ".meta.json"),
      ),
      "utf8",
    ),
  );
  const section = 'section[aria-label="Videon vienti"]';
  const revision = await p.$eval(
    `${section} [data-source-revision]`,
    (node) => node.dataset.sourceRevision,
  );
  assert.equal(revision, meta.sourceRevision);
  const approval = await p.$eval("[data-testid=ari-export-approval]", (node) => ({
    state: node.dataset.exportApproval,
    text: node.textContent,
  }));
  // The version was approved before the ad moved on, so this file is a draft.
  assert.equal(approval.state, "draft");
  assert.match(approval.text, /ei asiakastuotannon julkaisu/);
  verifySavedInputs(join(run.root, "packages/studio/data/projects", entry.projectId), meta);
  return {
    fault,
    video,
    filename,
    revision,
    approval,
    sha256: digest(readFileSync(video)),
    measured: measureVideo(video),
    duration: Number(probe.format.duration),
  };
}
function verifySavedInputs(projectDir, meta) {
  for (const [path, checksum] of Object.entries(meta.sourceFiles ?? {}))
    assert.equal(digest(readFileSync(join(projectDir, path))), checksum, path);
}

/**
 * Every decoded frame of every path, compared with zero pixel tolerance: the
 * four videos come from byte-equal sources, so any difference is a real defect
 * rather than an encoder artefact.
 */
export function exportedVideo(report) {
  const decoded = report.modes.map((entry) => {
    const result = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", entry.export.video, "-map", "0:v:0", "-f", "framemd5", "-"],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(result.status, 0, result.stderr);
    const frames = result.stdout.split("\n").filter((line) => line && !line.startsWith("#"));
    return { mode: entry.mode, width: entry.width, frames, sha256: digest(frames.join("\n")) };
  });
  for (const item of decoded) assert.deepEqual(item.frames, decoded[0].frames);
  const measured = report.modes.map((entry) => entry.export.measured);
  for (const item of measured) assert.deepEqual(item, measured[0]);
  report.fullFrameComparison = decoded.map(({ frames, ...item }) => ({
    ...item,
    count: frames.length,
  }));
  report.exportMeasurement = measured[0];
  report.equivalentExportFrames = true;
  report.pixelTolerance = 0;
}
