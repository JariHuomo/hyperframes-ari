import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  prepareReviewPackage,
  readReviewPackage,
  readReviewAsset,
  type ReviewPackage,
} from "../packages/studio-server/src/ari/reviewPackage";
import { createReviewRenderer } from "../packages/studio-server/src/ari/reviewRenderer";
import {
  saveProjectVersion,
  readVersionIndex,
} from "../packages/studio-server/src/ari/versionStore";
import {
  projectVersionFiles,
  sourceRevision,
  versionDigest,
} from "../packages/studio-server/src/ari/versionFiles";
import { installOfflineServerGuard } from "../packages/studio/vite.offline";
import type { RenderJobState } from "../packages/studio-server/src/types";

process.env.HYPERFRAMES_NO_TELEMETRY = "1";
process.env.VITE_HYPERFRAMES_NO_TELEMETRY = "1";
installOfflineServerGuard();
const evidence = resolve(process.argv[2] ?? "screenshots/2026-09-10-d-review-package");
mkdirSync(evidence, { recursive: true });
const root = join(evidence, "project");
if (process.argv.includes("--read")) {
  const saved = JSON.parse(readFileSync(join(evidence, "report.json"), "utf8"));
  const manifest = readReviewPackage(root, saved.manifest.id);
  writeFileSync(
    join(evidence, "reopen.json"),
    JSON.stringify(
      {
        ok: true,
        id: manifest.id,
        videoHash: versionDigest(readReviewAsset(root, manifest.id, "video.mp4")),
      },
      null,
      2,
    ),
  );
} else {
  cpSync(resolve("packages/studio/tests/e2e/fixtures/ari-retimed"), root, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const require = createRequire(new URL("../packages/studio-server/package.json", import.meta.url));
  for (const name of ["gsap.min.js", "MotionPathPlugin.min.js"])
    cpSync(require.resolve("gsap/dist/" + name), join(root, "assets", name));
  const boundaries = process.argv.includes("--boundaries");
  const versionOf = (name: string) =>
    saveProjectVersion(root, {
      expectedIndex: readVersionIndex(root).token,
      expectedRevision: sourceRevision(projectVersionFiles(root)),
      name,
    }).version;
  const card = join(root, "scenes/card.html");
  const authored = readFileSync(card, "utf8");
  const moved = "tl.fromTo('#marker',{x:0},{x:400,duration:2,ease:'none'},0);";
  if (boundaries)
    writeFileSync(
      card,
      authored.replace(moved, moved + "tl.to('#marker',{opacity:0.5,duration:0.4},1.2);"),
    );
  const previous = boundaries ? versionOf("Ennen muutosta") : null;
  if (boundaries)
    writeFileSync(card, authored.replace("duration:2,ease:'none'", "duration:1.5,ease:'none'"));
  const revision = sourceRevision(projectVersionFiles(root));
  const version = versionOf("Synteettinen tarkistus");
  const before = readFileSync(join(root, ".ari-versions/index.json"));
  const { createRenderJob, executeRenderJob } = await import("../packages/producer/dist/index.js");
  let execution: Promise<void> | undefined;
  const render = createReviewRenderer((opts) => {
    const state: RenderJobState = {
      id: opts.jobId,
      status: "rendering",
      progress: 0,
      outputPath: opts.outputPath,
    };
    const job = createRenderJob({
      fps: opts.fps,
      quality: "standard",
      format: "mp4",
      // This fixture stores its edits in authored source; no Studio sidecar injection is needed.
    });
    execution = executeRenderJob(job, opts.project.dir, opts.outputPath).then(
      () => {
        state.status = "complete";
      },
      (error) => {
        state.status = "failed";
        throw error;
      },
    );
    execution.catch(() => {});
    return state;
  });
  const manifest: ReviewPackage = await prepareReviewPackage(root, version.id, render, {
    previousVersionId: previous?.id ?? null,
  });
  await execution;
  const dir = join(root, ".ari-notebook/review-packages", manifest.id);
  const checks = [];
  const sampled = [
    ...manifest.frames.map((frame) => ({ ...frame, versionId: manifest.versionId })),
    ...manifest.boundaryFrames,
  ];
  for (const frame of sampled) {
    const source = frame.versionId === manifest.versionId ? "video.mp4" : "previous.mp4";
    const output = join(evidence, "independent-" + frame.path);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      join(dir, source),
      "-vf",
      `select=eq(n\\,${frame.frame})`,
      "-frames:v",
      "1",
      "-y",
      output,
    ]);
    checks.push({
      path: frame.path,
      source,
      versionId: frame.versionId,
      frame: frame.frame,
      time: frame.time,
      hash: versionDigest(readFileSync(output)),
      matches: readFileSync(output).equals(readReviewAsset(root, manifest.id, frame.path)),
    });
  }
  const unchanged =
    revision === sourceRevision(projectVersionFiles(root)) &&
    before.equals(readFileSync(join(root, ".ari-versions/index.json")));
  writeFileSync(
    join(evidence, "report.json"),
    JSON.stringify(
      {
        ok: unchanged && checks.every((c) => c.matches),
        previousVersionId: previous?.id ?? null,
        coverage: manifest.coverage,
        coverageNotes: manifest.coverageNotes,
        manifest,
        checks,
        unchanged,
        providerSpendUsd: 0,
        ffprobe: JSON.parse(readFileSync(join(dir, "ffprobe.json"), "utf8")),
      },
      null,
      2,
    ),
  );
}
