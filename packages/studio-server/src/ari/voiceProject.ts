import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseHTML } from "linkedom";
import { commitConditionalFiles, confinedPath, readOptionalBytes } from "./conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";
import { projectVersionFiles, sourceRevision, versionDigest } from "./versionFiles.js";
import {
  ELEVENLABS_USD_PER_1K_CHARACTERS,
  ELEVENLABS_VOICE_MODEL,
  VOICE_HARD_CEILING_USD,
  elevenLabsVoice,
  estimatedVoiceUsd,
  fixtureVoice,
  type AriVoiceOutput,
} from "./voiceProvider.js";
import type { AriVoiceAlignment } from "./voiceAlignment.js";
import { reserveVoiceCost, settleVoiceCost } from "./voiceCost.js";
import { requireVoiceChoice, voiceChoices } from "./voiceCatalog.js";
import {
  groupTimedText,
  parseTimedTextPreferences,
  timedTextComposition,
  TIMED_TEXT_ALIGNS,
  TIMED_TEXT_MODES,
  TIMED_TEXT_POSITIONS,
  TIMED_TEXT_PRESETS,
  type TimedTextPreferences,
} from "./timedText.js";

const STORE = ".ari-notebook/voice";
const STATE = `${STORE}/state.json`;
const COMPOSITION = "compositions/ari-voice-layer.html";
const HOST_ID = "ari-voice-layer-host";
const QUOTE_TTL_MS = 10 * 60_000;

interface VoiceDraft {
  text: string;
  voiceId: string;
  model: typeof ELEVENLABS_VOICE_MODEL;
  locale: "fi-FI";
  presentation: TimedTextPreferences;
}

interface VoiceQuote extends Omit<VoiceDraft, "presentation"> {
  id: string;
  sourceRevision: string;
  textSha256: string;
  binding: string;
  provider: "elevenlabs" | "fixture";
  maxUsd: number;
  expiresAt: number;
}

interface VoiceState {
  schemaVersion: 1;
  draft: VoiceDraft;
  generated?: {
    quoteId: string;
    binding: string;
    provider: "elevenlabs" | "fixture";
    model: string;
    placeholder: boolean;
    audioPath: string;
    audioSha256: string;
    alignmentPath: string;
    alignmentSha256: string;
    durationMs: number;
    cueCount: number;
    cues: ReturnType<typeof groupTimedText>;
    actualUsd: number;
    characterCost: number;
    requestId?: string;
    traceId?: string;
  };
}

interface VoiceResult {
  binding: string;
  provider: "elevenlabs" | "fixture";
  placeholder: boolean;
  audioPath: string;
  audioSha256: string;
  alignmentPath: string;
  alignmentSha256: string;
  compositionPath: typeof COMPOSITION;
  durationMs: number;
  cues: ReturnType<typeof groupTimedText>;
  presentation: TimedTextPreferences;
  actualUsd: number;
  characterCost: number;
  publishedVersions: Record<string, string>;
}

export interface VoiceWorkflowDependencies {
  generateLiveVoice?: (input: {
    apiKey: string;
    voiceId: string;
    text: string;
    model: string;
  }) => Promise<AriVoiceOutput>;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(root: string, path: string): unknown | null {
  const bytes = readOptionalBytes(confinedPath(root, path));
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString());
  } catch {
    throw new Error("Projektin äänitiedot eivät ole luettavissa.");
  }
}

function priorState(root: string): VoiceState | null {
  const value = json(root, STATE);
  if (!value || typeof value !== "object" || Reflect.get(value, "schemaVersion") !== 1) return null;
  return value as VoiceState;
}

function bytesAndVersion(root: string, path: string) {
  const bytes = readOptionalBytes(confinedPath(root, path));
  return { bytes, version: bytes === null ? null : fileContentVersion(bytes) };
}

function providerMode(): "elevenlabs" | "fixture" {
  const mode = process.env.ARI_VOICE_EXECUTION_MODE?.trim() || "fixture";
  if (mode !== "fixture" && mode !== "live")
    throw new Error("ARI_VOICE_EXECUTION_MODE on virheellinen.");
  return mode === "live" ? "elevenlabs" : "fixture";
}

function draftField(value: object, key: string, fallback: string): string {
  return String(Reflect.get(value, key) ?? fallback);
}

function validateSpeechText(text: string) {
  if (!text || text.length > 5_000) throw new Error("Puhetekstissä pitää olla 1–5 000 merkkiä.");
  if (/\d/u.test(text)) throw new Error("Kirjoita puhetekstin numerot sanoina.");
  if (/\[[^\]\r\n]+\]/u.test(text) || /<\/?[a-z][^>]*>/iu.test(text))
    throw new Error("Puhetekstiin ei voi lisätä ohjaus- tai SSML-merkintöjä.");
}

function parseDraft(value: unknown, previous?: VoiceDraft): VoiceDraft {
  if (!value || typeof value !== "object") throw new Error("Puheäänen tiedot puuttuvat.");
  const defaults = previous ?? { text: "", voiceId: "fixture-fi", model: ELEVENLABS_VOICE_MODEL };
  const text = draftField(value, "text", defaults.text).trim();
  const voiceId = draftField(value, "voiceId", defaults.voiceId).trim();
  const model = draftField(value, "model", defaults.model);
  validateSpeechText(text);
  if (!/^[A-Za-z0-9_-]{5,80}$/u.test(voiceId)) throw new Error("Äänen tunniste ei kelpaa.");
  if (model !== ELEVENLABS_VOICE_MODEL) throw new Error("Valittu puhemalli ei ole tuettu.");
  return {
    text,
    voiceId,
    model: ELEVENLABS_VOICE_MODEL,
    locale: "fi-FI",
    presentation: parseTimedTextPreferences(
      Reflect.get(value, "presentation"),
      previous?.presentation,
    ),
  };
}

function binding(
  draft: Omit<VoiceDraft, "presentation">,
  revision: string,
  provider: string,
): string {
  return versionDigest(Buffer.from(JSON.stringify([draft, revision, provider, "ari-voice-v1"])));
}

function generationDraft(draft: VoiceDraft): Omit<VoiceDraft, "presentation"> {
  const { presentation: _presentation, ...generation } = draft;
  return generation;
}

function voiceGenerationSourceRevision(root: string): string {
  const files = projectVersionFiles(root);
  delete files[COMPOSITION];
  for (const path of Object.keys(files)) {
    if (path.startsWith("assets/voice/ari-")) delete files[path];
  }
  const index = files["index.html"];
  if (index) {
    const { document } = parseHTML(index.toString());
    document.getElementById(HOST_ID)?.remove();
    files["index.html"] = Buffer.from(document.toString());
  }
  return sourceRevision(files);
}

function quotePath(root: string, id: string): string {
  if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error("Äänitarjouksen tunniste ei kelpaa.");
  return confinedPath(root, `${STORE}/quotes/${id}.json`);
}

function resultPath(bindingValue: string): string {
  if (!/^[a-f0-9]{64}$/u.test(bindingValue)) throw new Error("Äänituloksen sidonta ei kelpaa.");
  return `${STORE}/results/${bindingValue}.json`;
}

function isStoredWord(word: unknown): boolean {
  if (!word || typeof word !== "object") return false;
  return (
    typeof Reflect.get(word, "text") === "string" &&
    Number.isFinite(Reflect.get(word, "startMs")) &&
    Number.isFinite(Reflect.get(word, "endMs"))
  );
}

function parseAlignment(bytes: Buffer, expectedText: string): AriVoiceAlignment {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString());
  } catch {
    throw new Error("Tallennettua puheen ajoitusta ei voi lukea.");
  }
  if (!value || typeof value !== "object") throw new Error("Tallennettu puheen ajoitus ei kelpaa.");
  const words = Reflect.get(value, "words");
  if (
    Reflect.get(value, "transcript") !== expectedText ||
    !["elevenlabs", "fixture"].includes(Reflect.get(value, "source")) ||
    !Array.isArray(words) ||
    words.length === 0 ||
    !words.every(isStoredWord)
  )
    throw new Error("Tallennettu puheen ajoitus ei vastaa hyväksyttyä tekstiä.");
  return value as AriVoiceAlignment;
}

function verifyResultPaths(quote: VoiceQuote, result: VoiceResult) {
  const extension = quote.provider === "elevenlabs" ? "mp3" : "wav";
  const expectedAudioPath = `assets/voice/ari-${quote.binding.slice(0, 16)}.${extension}`;
  const expectedAlignmentPath = `assets/voice/ari-${quote.binding.slice(0, 16)}.alignment.json`;
  if (
    result.audioPath !== expectedAudioPath ||
    result.alignmentPath !== expectedAlignmentPath ||
    !result.publishedVersions ||
    typeof result.publishedVersions !== "object" ||
    !Object.values(result.publishedVersions).every((version) => typeof version === "string")
  )
    throw new Error("Tallennetun äänituloksen tiedostot eivät kelpaa.");
  const expectedPaths = [
    result.audioPath,
    result.alignmentPath,
    COMPOSITION,
    "index.html",
    STATE,
  ].sort();
  if (
    result.compositionPath !== COMPOSITION ||
    Object.keys(result.publishedVersions).sort().join("\n") !== expectedPaths.join("\n")
  )
    throw new Error("Tallennetun äänituloksen tiedostoluettelo ei kelpaa.");
}

function verifyResultChecksums(root: string, result: VoiceResult) {
  const audio = readOptionalBytes(confinedPath(root, result.audioPath));
  const alignment = readOptionalBytes(confinedPath(root, result.alignmentPath));
  if (
    !audio ||
    !alignment ||
    sha256(audio) !== result.audioSha256 ||
    sha256(alignment) !== result.alignmentSha256
  )
    throw new Error("Äänituloksen tarkistussumma ei täsmää.");
}

function verifyStoredResult(root: string, quote: VoiceQuote, value: unknown): VoiceResult {
  if (!value || typeof value !== "object" || Reflect.get(value, "binding") !== quote.binding)
    throw new Error("Tallennettu äänitulos ei vastaa hyväksyttyä ajoa.");
  const result = value as VoiceResult;
  verifyResultPaths(quote, result);
  for (const [path, expectedVersion] of Object.entries(result.publishedVersions)) {
    const current = bytesAndVersion(root, path);
    if (current.version !== expectedVersion)
      throw new Error(`Äänituloksen tiedosto muuttui: ${path}. Päivitä näkymä.`);
  }
  verifyResultChecksums(root, result);
  return result;
}

export function readVoiceWorkflow(root: string) {
  const state = priorState(root);
  const mode = providerMode();
  const voices = voiceChoices(mode);
  const connectionReady =
    mode === "elevenlabs" &&
    process.env.ELEVENLABS_VOICE_LIVE_APPROVED === "1" &&
    Boolean(process.env.ELEVENLABS_API_KEY?.trim());
  return {
    ok: true,
    mode,
    providerLabel: mode === "elevenlabs" ? "ElevenLabs" : "Paikallinen testiääni",
    liveReady: connectionReady && voices.length > 0,
    voices,
    voiceUnavailableReason:
      mode === "elevenlabs" && voices.length === 0
        ? "Puheääntä ei ole vielä määritetty. Lisää vähintään yksi suomenkielinen ääni palvelimen asetuksiin."
        : mode === "elevenlabs" && !connectionReady
          ? "Puhepalvelun yhteys ei ole käyttövalmis. Tarkista palvelimen puheasetukset."
          : null,
    models: [{ id: ELEVENLABS_VOICE_MODEL, label: "Monikielinen v2" }],
    presets: TIMED_TEXT_PRESETS,
    modes: TIMED_TEXT_MODES,
    positions: TIMED_TEXT_POSITIONS,
    aligns: TIMED_TEXT_ALIGNS,
    state,
  };
}

export function quoteVoiceWorkflow(root: string, input: unknown) {
  const draft = parseDraft(input, priorState(root)?.draft);
  const paidDraft = generationDraft(draft);
  const provider = providerMode();
  requireVoiceChoice(provider, draft.voiceId);
  const revision = voiceGenerationSourceRevision(root);
  const quote: VoiceQuote = {
    ...paidDraft,
    id: randomUUID(),
    sourceRevision: revision,
    textSha256: sha256(draft.text),
    binding: binding(paidDraft, revision, provider),
    provider,
    maxUsd: provider === "elevenlabs" ? estimatedVoiceUsd(draft.text) : 0,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
  if (quote.maxUsd > VOICE_HARD_CEILING_USD)
    throw new Error(
      `Puheäänen enimmäishinta ylittää ${VOICE_HARD_CEILING_USD.toFixed(2)} dollaria.`,
    );
  if (provider === "elevenlabs") liveConfig(quote.maxUsd);
  mkdirSync(confinedPath(root, `${STORE}/quotes`), { recursive: true });
  writeFileSync(quotePath(root, quote.id), JSON.stringify(quote), { flag: "wx" });
  return {
    ok: true,
    quoteId: quote.id,
    provider,
    providerLabel: provider === "elevenlabs" ? "ElevenLabs" : "Paikallinen testiääni",
    textSha256: quote.textSha256,
    characters: draft.text.length,
    maxUsd: quote.maxUsd,
    expiresAt: quote.expiresAt,
    disclosure:
      provider === "elevenlabs"
        ? "Hyväksytty puheteksti lähetetään ElevenLabsille äänen ja sanakohtaisten aikojen luontia varten."
        : "Testitilassa tekstiä ei lähetetä ulkopuoliselle palvelulle.",
  };
}

function liveConfig(maxUsd: number) {
  if (process.env.ARI_OFFLINE === "1")
    throw new Error("Puheääntä ei voi luoda verkkoyhteydettömässä tilassa.");
  if (process.env.ELEVENLABS_VOICE_LIVE_APPROVED !== "1")
    throw new Error("ElevenLabs-puheäänen käyttölupa puuttuu.");
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ElevenLabs-yhteyttä ei ole määritetty.");
  const costDir = process.env.ARI_VOICE_COST_DIR;
  const budget = Number(process.env.ARI_VOICE_BUDGET_USD);
  if (
    !costDir ||
    !isAbsolute(costDir) ||
    !Number.isFinite(budget) ||
    budget < maxUsd ||
    budget >= 10
  )
    throw new Error("Puheäänen alle kymmenen dollarin kulurajaa ei ole määritetty.");
  return { apiKey, costDir, budget };
}

function addOrUpdateHost(indexHtml: string, durationMs: number, startSeconds: number): string {
  const { document } = parseHTML(indexHtml);
  const roots = Array.from(document.querySelectorAll("[data-composition-id]"));
  const root = roots.find((candidate) => !candidate.closest("[data-composition-src]"));
  if (!root) throw new Error("Pääkoostetta ei löydy.");
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.className = "clip";
    host.setAttribute("data-hf-id", `hf-${randomUUID()}`);
    host.setAttribute("data-composition-id", "ari-voice-layer");
    host.setAttribute("data-composition-src", COMPOSITION);
    host.setAttribute("data-no-timeline", "true");
    host.setAttribute("data-track-index", "90");
    host.setAttribute("data-width", root.getAttribute("data-width") ?? "1080");
    host.setAttribute("data-height", root.getAttribute("data-height") ?? "1920");
    host.setAttribute("style", "position:absolute;inset:0;z-index:90;pointer-events:none");
    root.appendChild(host);
  }
  host.setAttribute("data-start", startSeconds.toFixed(3));
  const layerDuration = startSeconds + durationMs / 1000;
  host.setAttribute("data-duration", (durationMs / 1000).toFixed(3));
  const rootDurationName = root.hasAttribute("data-duration")
    ? "data-duration"
    : "data-composition-duration";
  const currentDuration = Number(root.getAttribute(rootDurationName));
  if (!Number.isFinite(currentDuration) || currentDuration < layerDuration)
    root.setAttribute(rootDurationName, layerDuration.toFixed(3));
  return document.toString();
}

function approvedVoiceQuote(root: string, input: unknown): VoiceQuote {
  if (!input || typeof input !== "object" || Reflect.get(input, "approved") !== true)
    throw new Error("Hyväksy hintakortti ennen puheäänen luontia.");
  const quoteId = String(Reflect.get(input, "quoteId") ?? "");
  const quote = JSON.parse(readFileSync(quotePath(root, quoteId), "utf8")) as VoiceQuote;
  if (quote.expiresAt < Date.now()) throw new Error("Äänitarjous vanheni. Tee uusi hintakortti.");
  const paidDraft = generationDraft(parseDraft(quote));
  if (binding(paidDraft, quote.sourceRevision, quote.provider) !== quote.binding)
    throw new Error("Äänitarjouksen sidonta ei täsmää.");
  return quote;
}

function validateOutputFormat(provider: VoiceQuote["provider"], mime: string) {
  const expectedMime = { elevenlabs: "audio/mpeg", fixture: "audio/wav" }[provider];
  if (mime !== expectedMime)
    throw new Error("Puheäänen tiedostomuoto ei vastaa hyväksyttyä palvelua.");
}

async function generateSettledVoice(
  quote: VoiceQuote,
  live: ReturnType<typeof liveConfig> | null,
  dependencies: VoiceWorkflowDependencies,
) {
  const output = live
    ? await (dependencies.generateLiveVoice ?? elevenLabsVoice)({
        apiKey: live.apiKey,
        voiceId: quote.voiceId,
        text: quote.text,
        model: quote.model,
      })
    : fixtureVoice(quote.text);
  const actualUsd =
    output.provider === "elevenlabs"
      ? (output.characterCost * ELEVENLABS_USD_PER_1K_CHARACTERS) / 1000
      : 0;
  // A successful paid response is a real vendor cost even if validation or publication below
  // fails. Settle it immediately and exactly once.
  if (live) settleVoiceCost(live.costDir, quote, actualUsd);
  if (actualUsd > quote.maxUsd + Number.EPSILON)
    throw new Error(
      "Todennettu äänikulu ylitti hyväksytyn hinnan. Tiedostoja ei julkaistu projektiin.",
    );

  validateOutputFormat(quote.provider, output.mime);
  return { output, actualUsd };
}

export async function generateVoiceWorkflow(
  root: string,
  input: unknown,
  dependencies: VoiceWorkflowDependencies = {},
) {
  const quote = approvedVoiceQuote(root, input);
  const storedResultPath = resultPath(quote.binding);
  const existing = confinedPath(root, storedResultPath);
  if (existsSync(existing)) {
    const stored = verifyStoredResult(root, quote, JSON.parse(readFileSync(existing, "utf8")));
    return { ok: true, reused: true, ...stored };
  }
  if (voiceGenerationSourceRevision(root) !== quote.sourceRevision)
    throw new Error("Mainos muuttui hintakortin jälkeen. Tee uusi hintakortti.");

  const presentation = priorState(root)?.draft.presentation ?? parseTimedTextPreferences(undefined);

  const live = quote.provider === "elevenlabs" ? liveConfig(quote.maxUsd) : null;
  if (live) reserveVoiceCost(live.costDir, live.budget, quote);
  const extension = quote.provider === "elevenlabs" ? "mp3" : "wav";
  const audioPath = `assets/voice/ari-${quote.binding.slice(0, 16)}.${extension}`;
  const alignmentPath = `assets/voice/ari-${quote.binding.slice(0, 16)}.alignment.json`;
  // These versions are deliberately captured before the provider call. A Studio edit made
  // while the request is in flight must win instead of being overwritten by the response.
  const expected = Object.fromEntries(
    [audioPath, alignmentPath, COMPOSITION, "index.html", STATE, storedResultPath].map((path) => [
      path,
      bytesAndVersion(root, path),
    ]),
  );
  const { output, actualUsd } = await generateSettledVoice(quote, live, dependencies);
  return publishVoice(
    root,
    quote,
    presentation,
    { audioPath, alignmentPath, storedResultPath, expected },
    output,
    actualUsd,
  );
}

function publishVoice(
  root: string,
  quote: VoiceQuote,
  presentation: TimedTextPreferences,
  publication: {
    audioPath: string;
    alignmentPath: string;
    storedResultPath: string;
    expected: Record<string, ReturnType<typeof bytesAndVersion>>;
  },
  output: AriVoiceOutput,
  actualUsd: number,
) {
  const { audioPath, alignmentPath, storedResultPath, expected } = publication;
  const alignmentBytes = Buffer.from(JSON.stringify(output.alignment, null, 2));
  const cues = groupTimedText(output.alignment, presentation);
  const composition = timedTextComposition({
    audioPath,
    durationMs: output.durationMs,
    cues,
    preferences: presentation,
  });
  const indexBefore = expected["index.html"]!.bytes;
  if (!indexBefore) throw new Error("Projektin pääkooste puuttuu.");
  const indexAfter = Buffer.from(
    addOrUpdateHost(indexBefore.toString(), output.durationMs, presentation.startSeconds),
  );
  const state: VoiceState = {
    schemaVersion: 1,
    draft: {
      text: quote.text,
      voiceId: quote.voiceId,
      model: quote.model,
      locale: quote.locale,
      presentation,
    },
    generated: {
      quoteId: quote.id,
      binding: quote.binding,
      provider: output.provider,
      model: output.model,
      placeholder: output.provider === "fixture",
      audioPath,
      audioSha256: sha256(output.audio),
      alignmentPath,
      alignmentSha256: sha256(alignmentBytes),
      durationMs: output.durationMs,
      cueCount: cues.length,
      cues,
      actualUsd,
      characterCost: output.characterCost,
      ...(output.requestId ? { requestId: output.requestId } : {}),
      ...(output.traceId ? { traceId: output.traceId } : {}),
    },
  };
  const stateBytes = Buffer.from(JSON.stringify(state, null, 2));
  const compositionBytes = Buffer.from(composition);
  const publishedVersions = {
    [audioPath]: fileContentVersion(output.audio),
    [alignmentPath]: fileContentVersion(alignmentBytes),
    [COMPOSITION]: fileContentVersion(compositionBytes),
    "index.html": fileContentVersion(indexAfter),
    [STATE]: fileContentVersion(stateBytes),
  };
  const result: VoiceResult = {
    binding: quote.binding,
    provider: output.provider,
    placeholder: output.provider === "fixture",
    audioPath,
    audioSha256: state.generated!.audioSha256,
    alignmentPath,
    alignmentSha256: state.generated!.alignmentSha256,
    compositionPath: COMPOSITION,
    durationMs: output.durationMs,
    cues,
    presentation,
    actualUsd,
    characterCost: output.characterCost,
    publishedVersions,
  };
  const resultBytes = Buffer.from(JSON.stringify(result));
  commitConditionalFiles(root, [
    { path: audioPath, expectedVersion: expected[audioPath]!.version, content: output.audio },
    {
      path: alignmentPath,
      expectedVersion: expected[alignmentPath]!.version,
      content: alignmentBytes,
    },
    {
      path: COMPOSITION,
      expectedVersion: expected[COMPOSITION]!.version,
      content: compositionBytes,
    },
    { path: "index.html", expectedVersion: expected["index.html"]!.version, content: indexAfter },
    {
      path: STATE,
      expectedVersion: expected[STATE]!.version,
      content: stateBytes,
    },
    {
      path: storedResultPath,
      expectedVersion: expected[storedResultPath]!.version,
      content: resultBytes,
    },
  ]);
  return { ok: true, reused: false, ...result };
}

export function updateVoicePresentationWorkflow(root: string, input: unknown) {
  const current = priorState(root);
  if (!current?.generated)
    throw new Error("Luo puheääni ennen tekstityksen esitystavan päivittämistä.");
  const presentationInput =
    input && typeof input === "object" && Reflect.has(input, "presentation")
      ? Reflect.get(input, "presentation")
      : input;
  const presentation = parseTimedTextPreferences(presentationInput, current.draft.presentation);
  const audio = bytesAndVersion(root, current.generated.audioPath);
  const alignment = bytesAndVersion(root, current.generated.alignmentPath);
  if (
    !audio.bytes ||
    !alignment.bytes ||
    sha256(audio.bytes) !== current.generated.audioSha256 ||
    sha256(alignment.bytes) !== current.generated.alignmentSha256
  )
    throw new Error("Tallennettu puheääni tai ajoitus muuttui. Luo puhe uudelleen.");
  const parsedAlignment = parseAlignment(alignment.bytes, current.draft.text);
  const cues = groupTimedText(parsedAlignment, presentation);
  const composition = Buffer.from(
    timedTextComposition({
      audioPath: current.generated.audioPath,
      durationMs: current.generated.durationMs,
      cues,
      preferences: presentation,
    }),
  );
  const index = bytesAndVersion(root, "index.html");
  const priorComposition = bytesAndVersion(root, COMPOSITION);
  const priorStateFile = bytesAndVersion(root, STATE);
  if (!index.bytes) throw new Error("Projektin pääkooste puuttuu.");
  const nextIndex = Buffer.from(
    addOrUpdateHost(
      index.bytes.toString(),
      current.generated.durationMs,
      presentation.startSeconds,
    ),
  );
  const nextState: VoiceState = {
    ...current,
    draft: { ...current.draft, presentation },
    generated: {
      ...current.generated,
      cueCount: cues.length,
      cues,
    },
  };
  commitConditionalFiles(root, [
    {
      path: COMPOSITION,
      expectedVersion: priorComposition.version,
      content: composition,
    },
    { path: "index.html", expectedVersion: index.version, content: nextIndex },
    {
      path: STATE,
      expectedVersion: priorStateFile.version,
      content: Buffer.from(JSON.stringify(nextState, null, 2)),
    },
  ]);
  return {
    ok: true,
    reusedAudio: true,
    chargedUsd: 0,
    audioPath: current.generated.audioPath,
    audioSha256: current.generated.audioSha256,
    alignmentPath: current.generated.alignmentPath,
    alignmentSha256: current.generated.alignmentSha256,
    durationMs: current.generated.durationMs,
    cues,
    presentation,
  };
}
