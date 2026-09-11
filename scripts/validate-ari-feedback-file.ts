#!/usr/bin/env tsx
import { reserveFeedbackCost } from "../packages/studio-server/src/ari/feedbackCost.js";
/**
 * Review finished MP4 ads outside the studio through the same creative-feedback seam the
 * Tarkistus tab uses: same reviewer catalogue, prompt, JSON schema, settlement and refusal rules.
 *
 * Owner tooling for comparing reviewers on real ads. It never touches a studio project, never
 * writes a key anywhere, and reserves the reviewer's full ceiling in --cost-dir before every call
 * exactly like the studio path. The chosen reviewer is an explicit flag: a key present in the
 * environment never selects a vendor on its own.
 */
import { parseArgs } from "node:util";
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { basename, join, resolve, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import {
  probeReviewVideo,
  extractReviewFrame,
} from "../packages/studio-server/src/ari/reviewMedia.js";
import { createReviewOverview } from "../packages/studio-server/src/ari/reviewOverview.js";
import { versionDigest } from "../packages/studio-server/src/ari/versionFiles.js";
import {
  feedbackTask,
  parseCreativeFeedback,
  resolveFeedbackReviewer,
} from "../packages/studio-server/src/ari/creativeFeedbackContract.js";
import {
  feedbackProvider,
  readFeedbackText,
} from "../packages/studio-server/src/ari/creativeFeedbackProvider.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    live: { type: "boolean" },
    reviewer: { type: "string" },
    "approve-max-usd": { type: "string" },
    "cost-dir": { type: "string" },
    out: { type: "string" },
  },
});
const cap = Number(values["approve-max-usd"]);
const reviewer = resolveFeedbackReviewer(values.reviewer);
if (
  !values.live ||
  !Number.isFinite(cap) ||
  cap < reviewer.maxUsd ||
  cap >= 10 ||
  !values["cost-dir"] ||
  !values.out ||
  positionals.length === 0
) {
  throw new Error(
    "Requires --live --reviewer <gemini|muse-spark> --approve-max-usd (>= reviewer ceiling, < 10) --cost-dir <dir> --out <dir> <ad.mp4>...",
  );
}
const key = reviewer.keyEnv.map((n) => process.env[n]).find(Boolean);
if (!key)
  throw new Error(`No process-local key for ${reviewer.label} (${reviewer.keyEnv.join(" or ")}).`);
if (Date.now() >= Date.UTC(2027, 0, 1))
  throw new Error("Reviewer prices must be re-verified before another run.");
const costDir = resolve(values["cost-dir"]);
const outRoot = resolve(values.out);
if (!isAbsolute(costDir) || !isAbsolute(outRoot))
  throw new Error("Directories must resolve to absolute paths.");
mkdirSync(costDir, { recursive: true });
mkdirSync(outRoot, { recursive: true });

const summary: Record<string, unknown>[] = [];
for (const adPath of positionals) {
  const source = resolve(adPath);
  const video = readFileSync(source);
  const sha = versionDigest(video);
  const slug = basename(source, ".mp4");
  const dir = join(outRoot, slug);
  mkdirSync(dir, { recursive: true });
  copyFileSync(source, join(dir, "video.mp4"));
  const { measured } = await probeReviewVideo(join(dir, "video.mp4"));
  if (measured.duration > 60) throw new Error(`${slug}: over 60 s, refused.`);
  await extractReviewFrame(join(dir, "video.mp4"), 0, join(dir, "first.png"));
  await extractReviewFrame(join(dir, "video.mp4"), measured.frames - 1, join(dir, "last.png"));
  const overview = await createReviewOverview(dir, measured);
  const binding = versionDigest(
    Buffer.from(
      JSON.stringify([
        sha,
        overview.sha256,
        reviewer.id,
        reviewer.model,
        reviewer.processingMode,
        feedbackTask,
      ]),
    ),
  );
  const resultPath = join(dir, `${reviewer.id}.result.json`);
  if (existsSync(resultPath)) {
    console.log(`${slug}: ${reviewer.label} result already exists, skipping.`);
    summary.push(JSON.parse(readFileSync(resultPath, "utf8")));
    continue;
  }
  const id = randomUUID();
  reserveFeedbackCost(costDir, cap, id, binding, reviewer);
  console.log(
    `${slug}: ${measured.duration.toFixed(2)} s, ${(video.byteLength / 1e6).toFixed(1)} MB, audio ${measured.audio} → ${reviewer.label} (ceiling ${reviewer.maxUsd} USD)`,
  );
  const started = Date.now();
  try {
    const response = await feedbackProvider(reviewer, key).review({
      video,
      first: readFileSync(join(dir, "first.png")),
      overview: readFileSync(join(dir, "overview.png")),
      last: readFileSync(join(dir, "last.png")),
      duration: measured.duration,
      audio: measured.audio,
    });
    if (!Number.isFinite(response.actualUsd) || response.actualUsd < 0)
      throw new Error("Usage missing from response.");
    writeFileSync(
      join(costDir, `${id}.settled.json`),
      JSON.stringify({
        id,
        actualUsd: response.actualUsd,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        createdAt: Date.now(),
      }),
      { flag: "wx" },
    );
    writeFileSync(
      join(dir, `${reviewer.id}.response.json`),
      JSON.stringify(response.data, null, 2),
      { flag: "wx" },
    );
    if (response.actualUsd > reviewer.maxUsd)
      throw new Error("Actual cost exceeded the ceiling; check the cost record.");
    const feedback = parseCreativeFeedback(
      JSON.parse(readFeedbackText(reviewer, response.data)),
      measured.duration,
    );
    const result = {
      ad: source,
      videoSha256: sha,
      measured,
      reviewer: reviewer.id,
      label: reviewer.label,
      model: reviewer.model,
      processingMode: reviewer.processingMode,
      video: reviewer.video,
      taskVersion: feedbackTask.version,
      binding,
      costId: id,
      durationMs: Date.now() - started,
      actualUsd: response.actualUsd,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      usage:
        (response.data as { usageMetadata?: unknown; usage?: unknown }).usageMetadata ??
        (response.data as { usage?: unknown }).usage,
      feedback,
      advisoryOnly: true,
    };
    writeFileSync(resultPath, JSON.stringify(result, null, 2), { flag: "wx" });
    summary.push(result);
    console.log(
      `${slug}: ${response.actualUsd.toFixed(6)} USD, in ${response.inputTokens} / out ${response.outputTokens}, ${((Date.now() - started) / 1000).toFixed(0)} s`,
    );
  } catch (error) {
    writeFileSync(
      join(dir, `${reviewer.id}.failed-${id}.json`),
      JSON.stringify({
        costId: id,
        error: error instanceof Error ? error.message : String(error),
        createdAt: Date.now(),
      }),
      { flag: "wx" },
    );
    console.error(`${slug}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
  }
}
writeFileSync(join(outRoot, `${reviewer.id}.summary.json`), JSON.stringify(summary, null, 2));
const total = summary.reduce((s, r) => s + Number(r.actualUsd ?? 0), 0);
console.log(`Total ${reviewer.label}: ${total.toFixed(6)} USD over ${summary.length} ad(s).`);
