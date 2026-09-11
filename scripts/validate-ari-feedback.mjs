#!/usr/bin/env node
/** Start the isolated local UI validation host. No provider call until its bound price is approved. */
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const { values } = parseArgs({
  options: {
    live: { type: "boolean" },
    "approve-max-usd": { type: "string" },
    port: { type: "string", default: "3087" },
    "cost-dir": { type: "string" },
  },
});
const cap = Number(values["approve-max-usd"]);
/** The dearest reviewer's ceiling (Muse Spark 1.3, $1.589248), so either vendor can be quoted. */
const CEILING_USD = 1.6;
const gemini = process.env.GEMINI_API_KEY;
// Both aliases are accepted, matching the provider; neither is ever written to a file.
const meta = process.env.META_MODEL_API_KEY || process.env.MUSE_SPARK_API_KEY;
if (
  !values.live ||
  !Number.isFinite(cap) ||
  cap < CEILING_USD ||
  cap >= 10 ||
  !values["cost-dir"] ||
  !(gemini || meta)
) {
  throw new Error(
    "Requires --live --approve-max-usd (>=1.60 and <10), --cost-dir and a process-local GEMINI_API_KEY and/or META_MODEL_API_KEY.",
  );
}
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.endsWith("_LIVE_APPROVED") && !k.endsWith("_API_KEY") && !k.endsWith("_API_TOKEN"),
  ),
);
for (const k of [
  "AI",
  "IMAGE",
  "VOICE",
  "MUSIC",
  "MEDIA",
  "AD_LIBRARY",
  "VISION",
  "SOCIAL",
  "SITE_TEXT",
  "VIDEO_UNDERSTANDING",
  "BRAND_IDENTITY",
  "TRANSCRIPTION",
]) {
  env[`${k}_EXECUTION_MODE`] = "fixture";
  env[`MOCK_${k}`] = "1";
}
Object.assign(env, {
  APP_MODE: "internal_demo",
  UGC_ASSEMBLY_MODE: "mock",
  ARI_STUDIO_HOST: "node",
  ARI_OFFLINE: "0",
  ARI_AI_REVIEW_LIVE_APPROVED: "1",
  ARI_AI_REVIEW_COST_DIR: resolve(values["cost-dir"]),
  ARI_AI_REVIEW_BUDGET_USD: String(cap),
});
// A vendor is only reachable when its own key is present in this process and its flag is set here.
if (gemini) env.GEMINI_API_KEY = gemini;
if (meta) {
  env.META_MODEL_API_KEY = meta;
  env.ARI_AI_REVIEW_META_LIVE_APPROVED = "1";
}
console.log(
  `Reviewers enabled: ${[gemini && "gemini", meta && "muse-spark"].filter(Boolean).join(", ")}`,
);
const child = spawn(
  process.execPath,
  ["scripts/ari-studio.mjs", "--port", values.port, "--background"],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
