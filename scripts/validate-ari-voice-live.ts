import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateVoiceWorkflow,
  quoteVoiceWorkflow,
} from "../packages/studio-server/src/ari/voiceProject.js";
import { VOICE_HARD_CEILING_USD } from "../packages/studio-server/src/ari/voiceProvider.js";

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`Puuttuva ${prefix}<arvo>`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertLiveApproval() {
  if (!process.argv.includes("--live")) throw new Error("Live-ajo vaatii --live-lipun.");
  if (process.env.ELEVENLABS_VOICE_LIVE_APPROVED !== "1")
    throw new Error("Live-ajo vaatii prosessikohtaisen ELEVENLABS_VOICE_LIVE_APPROVED=1-luvan.");
  if (!process.env.ELEVENLABS_API_KEY?.trim()) throw new Error("ELEVENLABS_API_KEY puuttuu.");
}

function approvedCap(): number {
  const cap = Number(argument("approve-max-usd"));
  if (!Number.isFinite(cap) || cap <= 0 || cap > VOICE_HARD_CEILING_USD)
    throw new Error(`Kulurajan pitää olla 0–${VOICE_HARD_CEILING_USD.toFixed(2)} USD.`);
  return cap;
}

function approvedInput() {
  assertLiveApproval();
  const project = resolve(argument("project"));
  const text = readFileSync(resolve(argument("text-file")), "utf8").trim();
  const approvedSha = argument("text-sha256");
  if (sha256(text) !== approvedSha)
    throw new Error("Puhetekstin SHA-256 ei vastaa hyväksyttyä arvoa.");
  const cap = approvedCap();
  return { project, text, approvedSha, cap };
}

async function main() {
  const { project, text, approvedSha, cap } = approvedInput();
  const reportDir = resolve(argument("report-dir"));
  mkdirSync(reportDir, { recursive: true });
  process.env.ARI_VOICE_EXECUTION_MODE = "live";
  process.env.ARI_VOICE_COST_DIR = resolve(reportDir, "costs");
  process.env.ARI_VOICE_BUDGET_USD = String(cap);
  const voiceId = argument("voice-id");
  process.env.ARI_ELEVENLABS_VOICES_JSON = JSON.stringify([
    { id: voiceId, label: "Validoitu suomenkielinen ääni" },
  ]);
  const quote = quoteVoiceWorkflow(project, {
    text,
    voiceId,
    presentation: {
      mode: argument("mode"),
      preset: argument("preset"),
      position: argument("position"),
      align: argument("align"),
      safeInsetPx: Number(argument("safe-inset-px")),
      maxWords: Number(argument("max-words")),
      startSeconds: Number(argument("start-seconds")),
    },
  });
  if (quote.maxUsd > cap + Number.EPSILON)
    throw new Error(`Palvelimen hinta ${quote.maxUsd.toFixed(2)} USD ylittää kulurajan.`);
  const result = await generateVoiceWorkflow(project, { quoteId: quote.quoteId, approved: true });
  const report = {
    schemaVersion: 1,
    live: true,
    provider: result.provider,
    model: "eleven_multilingual_v2",
    approvedTextSha256: approvedSha,
    approvedMaxUsd: cap,
    quotedMaxUsd: quote.maxUsd,
    actualUsd: result.actualUsd,
    audioPath: result.audioPath,
    audioSha256: result.audioSha256,
    alignmentPath: result.alignmentPath,
    alignmentSha256: result.alignmentSha256,
    durationMs: result.durationMs,
    cueCount: result.cues.length,
    presentation: result.presentation,
    placeholder: result.placeholder,
  };
  writeFileSync(
    resolve(reportDir, "ari-elevenlabs-voice.report.json"),
    JSON.stringify(report, null, 2),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
