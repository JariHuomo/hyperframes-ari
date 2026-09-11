import { reserveFeedbackCost } from "./feedbackCost.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { confinedPath } from "./conditionalFiles.js";
import { readReviewPackage, readReviewAsset } from "./reviewPackage.js";
import { sourceRevision, projectVersionFiles, versionDigest } from "./versionFiles.js";
import {
  feedbackTask,
  feedbackReviewers,
  resolveFeedbackReviewer,
  parseCreativeFeedback,
  type CreativeFeedback,
  type FeedbackReviewer,
  type FeedbackReviewerId,
} from "./creativeFeedbackContract.js";
import {
  feedbackProvider,
  readFeedbackText,
  type FeedbackProvider,
} from "./creativeFeedbackProvider.js";

interface FeedbackQuote {
  id: string;
  packageId: string;
  sourceRevision: string;
  videoSha256: string;
  overviewSha256: string;
  reviewer: FeedbackReviewerId;
  label: string;
  model: string;
  processingMode: FeedbackReviewer["processingMode"];
  /** False would mean the reviewer saw stills only; both current reviewers read the clip. */
  video: boolean;
  taskVersion: number;
  maxUsd: number;
  expiresAt: number;
  binding: string;
}
export interface FeedbackResult {
  packageId: string;
  sourceRevision: string;
  reviewer: FeedbackReviewerId;
  label: string;
  model: string;
  video: boolean;
  createdAt: number;
  actualUsd: number;
  inputTokens: number;
  outputTokens: number;
  feedback: CreativeFeedback;
  advisoryOnly: true;
  processingMode: FeedbackReviewer["processingMode"];
}
const base = ".ari-notebook/creative-feedback";
function file(root: string, id: string, suffix: string) {
  if (!/^[a-f0-9-]{36}$/.test(id) && !/^[a-f0-9]{64}$/.test(id))
    throw new Error("Palautteen tunniste ei kelpaa.");
  return confinedPath(root, `${base}/${id}.${suffix}.json`);
}
function config(reviewer: FeedbackReviewer) {
  if (process.env.ARI_OFFLINE === "1")
    throw new Error(
      "AI-palaute ei ole käytössä verkkoyhteydettömässä tilassa. PNG-vienti toimii maksutta.",
    );
  if (process.env.ARI_AI_REVIEW_LIVE_APPROVED !== "1")
    throw new Error("AI-palaute ei ole vielä käytössä. PNG-vienti toimii maksutta.");
  // A vendor needs its own flag on top of the shared one: a key alone never authorises a call.
  if (
    reviewer.approvalEnv !== "ARI_AI_REVIEW_LIVE_APPROVED" &&
    process.env[reviewer.approvalEnv] !== "1"
  )
    throw new Error(`${reviewer.label} ei ole vielä käytössä. PNG-vienti toimii maksutta.`);
  const key = reviewer.keyEnv.map((name) => process.env[name]).find((value) => Boolean(value));
  if (!key)
    throw new Error("AI-palautteen yhteyttä ei ole määritetty. PNG-vienti toimii maksutta.");
  // Published promotional tariff expires; never silently inherit it into a paid run.
  if (Date.now() >= Date.UTC(2027, 0, 1))
    throw new Error("AI-palautteen hinta pitää päivittää ennen uutta arviota.");
  return { key, ...feedbackBudget(reviewer.maxUsd) };
}

function feedbackBudget(maxUsd: number) {
  const costDir = process.env.ARI_AI_REVIEW_COST_DIR;
  const budget = Number(process.env.ARI_AI_REVIEW_BUDGET_USD);
  if (
    !costDir ||
    !isAbsolute(costDir) ||
    !Number.isFinite(budget) ||
    budget < maxUsd ||
    budget >= 10
  )
    throw new Error("AI-palautteen kulurajaa ei ole määritetty.");
  return { costDir, budget };
}
/** The reviewer is part of the digest, so two vendors' reviews of one version never collide. */
function bind(pkg: ReturnType<typeof readReviewPackage>, reviewer: FeedbackReviewer) {
  return versionDigest(
    Buffer.from(
      JSON.stringify([
        pkg.id,
        pkg.sourceRevision,
        pkg.video.sha256,
        pkg.overview?.sha256,
        reviewer.id,
        reviewer.model,
        reviewer.processingMode,
        feedbackTask,
      ]),
    ),
  );
}
function currentPackage(root: string, id: string) {
  const pkg = readReviewPackage(root, id);
  if (sourceRevision(projectVersionFiles(root)) !== pkg.sourceRevision)
    throw new Error("Mainos on muuttunut. Tee uusi kuvakooste ennen palautetta.");
  if (!pkg.overview) throw new Error("Tee uusi kuvakooste ennen palautetta.");
  if (
    pkg.measured.duration > 60 ||
    pkg.video.bytes + pkg.overview.bytes + pkg.frames[1]!.bytes > 14 * 1024 * 1024
  )
    throw new Error("AI-palaute tukee enintään minuutin ja 14 megatavun mainoksia.");
  return pkg;
}
export function readCreativeFeedback(root: string, packageId: string, reviewerId: unknown) {
  const reviewer = resolveFeedbackReviewer(reviewerId);
  const pkg = readReviewPackage(root, packageId);
  const path = file(root, bind(pkg, reviewer), "result");
  if (!existsSync(path)) return null;
  const result: FeedbackResult = JSON.parse(readFileSync(path, "utf8"));
  parseCreativeFeedback(result.feedback, pkg.measured.duration);
  return { ...result, stale: sourceRevision(projectVersionFiles(root)) !== result.sourceRevision };
}
/** Every reviewer that can be quoted, with the exact price its own quote will bind. */
/** Both vendors' reviews of one version coexist, so the tab can show them side by side. */
export function readAllCreativeFeedback(root: string, packageId: string) {
  return Object.keys(feedbackReviewers)
    .map((id) => readCreativeFeedback(root, packageId, id))
    .filter((result) => result !== null);
}
export function creativeFeedbackOptions() {
  return Object.values(feedbackReviewers).map((r) => ({
    id: r.id,
    label: r.label,
    vendor: r.vendor,
    model: r.model,
    video: r.video,
    maxUsd: r.maxUsd,
  }));
}
export function quoteCreativeFeedback(root: string, packageId: string, reviewerId: unknown) {
  const reviewer = resolveFeedbackReviewer(reviewerId);
  config(reviewer);
  const pkg = currentPackage(root, packageId);
  const quote: FeedbackQuote = {
    id: randomUUID(),
    packageId,
    sourceRevision: pkg.sourceRevision,
    videoSha256: pkg.video.sha256,
    overviewSha256: pkg.overview!.sha256,
    reviewer: reviewer.id,
    label: reviewer.label,
    model: reviewer.model,
    processingMode: reviewer.processingMode,
    video: reviewer.video,
    taskVersion: feedbackTask.version,
    maxUsd: reviewer.maxUsd,
    expiresAt: Date.now() + 10 * 60_000,
    binding: bind(pkg, reviewer),
  };
  mkdirSync(confinedPath(root, base), { recursive: true });
  writeFileSync(file(root, quote.id, "quote"), JSON.stringify(quote), { flag: "wx" });
  return quote;
}
export async function runCreativeFeedback(
  root: string,
  quoteId: string,
  provider?: FeedbackProvider,
  expectedPackageId?: string,
) {
  const quote: FeedbackQuote = JSON.parse(readFileSync(file(root, quoteId, "quote"), "utf8"));
  const reviewer = resolveFeedbackReviewer(quote.reviewer);
  const settings = config(reviewer);
  if (expectedPackageId && quote.packageId !== expectedPackageId)
    throw new Error("Palautepyyntö kuuluu eri mainosversiolle.");
  const pkg = currentPackage(root, quote.packageId);
  if (
    quote.id !== quoteId ||
    quote.binding !== bind(pkg, reviewer) ||
    quote.model !== reviewer.model ||
    quote.processingMode !== reviewer.processingMode ||
    quote.video !== reviewer.video ||
    quote.taskVersion !== feedbackTask.version ||
    quote.maxUsd !== reviewer.maxUsd ||
    quote.expiresAt < Date.now()
  )
    throw new Error("Palautepyynnön tiedot ovat vanhentuneet. Avaa palaute uudelleen.");
  const existing = readCreativeFeedback(root, pkg.id, reviewer.id);
  if (existing) return existing;
  // Copy verified bytes before any await: these exact bytes are what the price binds.
  const input = {
    video: readReviewAsset(root, pkg.id, "video.mp4"),
    first: readReviewAsset(root, pkg.id, "first.png"),
    overview: readReviewAsset(root, pkg.id, "overview.png"),
    last: readReviewAsset(root, pkg.id, "last.png"),
    duration: pkg.measured.duration,
    audio: pkg.measured.audio,
  };
  const lock = file(root, quote.binding, "started");
  if (existsSync(lock))
    throw new Error(
      "Tämän version palautetta on jo pyydetty. Keskeytynyttä pyyntöä ei toisteta automaattisesti.",
    );
  reserveFeedbackCost(settings.costDir, settings.budget, quote.id, quote.binding, reviewer);
  writeFileSync(lock, JSON.stringify({ quoteId, createdAt: Date.now() }), { flag: "wx" });
  try {
    const response = await (provider ?? feedbackProvider(reviewer, settings.key)).review(input);
    if (!Number.isFinite(response.actualUsd) || response.actualUsd < 0)
      throw new Error("AI-palautteen kulutieto puuttuu.");
    writeFileSync(
      join(settings.costDir, `${quote.id}.settled.json`),
      JSON.stringify({
        id: quote.id,
        actualUsd: response.actualUsd,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        createdAt: Date.now(),
      }),
      { flag: "wx" },
    );
    writeFileSync(file(root, quote.binding, "response"), JSON.stringify(response), { flag: "wx" });
    if (response.actualUsd > quote.maxUsd)
      throw new Error("AI-palvelun kulut poikkesivat hintarajasta. Tarkista kuluraportti.");
    const feedback = parseCreativeFeedback(
      JSON.parse(readFeedbackText(reviewer, response.data)),
      pkg.measured.duration,
    );
    const result: FeedbackResult = {
      packageId: pkg.id,
      sourceRevision: pkg.sourceRevision,
      reviewer: reviewer.id,
      label: reviewer.label,
      model: reviewer.model,
      video: reviewer.video,
      createdAt: Date.now(),
      actualUsd: response.actualUsd,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      feedback,
      advisoryOnly: true,
      processingMode: reviewer.processingMode,
    };
    writeFileSync(file(root, quote.binding, "result"), JSON.stringify(result, null, 2), {
      flag: "wx",
    });
    return { ...result, stale: sourceRevision(projectVersionFiles(root)) !== pkg.sourceRevision };
  } catch (error) {
    writeFileSync(
      file(root, quote.binding, "failed"),
      JSON.stringify({
        quoteId,
        error: error instanceof Error ? error.message : "AI-palaute epäonnistui.",
        createdAt: Date.now(),
      }),
      { flag: "wx" },
    );
    throw error;
  }
}
