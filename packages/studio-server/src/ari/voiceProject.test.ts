import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateVoiceWorkflow,
  quoteVoiceWorkflow,
  readVoiceWorkflow,
  updateVoicePresentationWorkflow,
} from "./voiceProject";
import { characterAlignmentToWords } from "./voiceAlignment";
import { elevenLabsVoice, fixtureVoice } from "./voiceProvider";
import { groupTimedText, parseTimedTextPreferences, timedTextComposition } from "./timedText";

const dirs: string[] = [];
const originalMode = process.env.ARI_VOICE_EXECUTION_MODE;
const originalApproval = process.env.ELEVENLABS_VOICE_LIVE_APPROVED;
const originalKey = process.env.ELEVENLABS_API_KEY;
const originalCostDir = process.env.ARI_VOICE_COST_DIR;
const originalBudget = process.env.ARI_VOICE_BUDGET_USD;
const originalVoices = process.env.ARI_ELEVENLABS_VOICES_JSON;

function project() {
  const root = mkdtempSync(join(tmpdir(), "ari-voice-"));
  dirs.push(root);
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><body><div id="main" data-composition-id="main" data-width="1080" data-height="1920" data-duration="12"></div></body></html>',
  );
  return root;
}

afterEach(() => {
  process.env.ARI_VOICE_EXECUTION_MODE = originalMode;
  process.env.ELEVENLABS_VOICE_LIVE_APPROVED = originalApproval;
  process.env.ELEVENLABS_API_KEY = originalKey;
  process.env.ARI_VOICE_COST_DIR = originalCostDir;
  process.env.ARI_VOICE_BUDGET_USD = originalBudget;
  process.env.ARI_ELEVENLABS_VOICES_JSON = originalVoices;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Ari voice workflow", () => {
  it("quotes before generating a checksum-bound fixture with reusable timed text", async () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "fixture";
    const root = project();
    const quote = quoteVoiceWorkflow(root, {
      text: "Tässä on lämmin koti, jonka voit tehdä omaksesi.",
      voiceId: "fixture-fi",
      presentation: {
        mode: "lyriikka",
        preset: "vaalea",
        position: "keski",
        align: "vasen",
        safeInsetPx: 90,
        maxWords: 3,
        startSeconds: 0.5,
      },
    });
    expect(quote.maxUsd).toBe(0);
    expect(readFileSync(join(root, "index.html"), "utf8")).not.toContain("ari-voice-layer");

    const generated = await generateVoiceWorkflow(root, { quoteId: quote.quoteId, approved: true });
    const replay = await generateVoiceWorkflow(root, { quoteId: quote.quoteId, approved: true });
    expect(replay.reused).toBe(true);
    const result = updateVoicePresentationWorkflow(root, {
      presentation: {
        mode: "lyriikka",
        preset: "vaalea",
        position: "keski",
        align: "vasen",
        safeInsetPx: 90,
        maxWords: 3,
        startSeconds: 0.5,
      },
    });
    expect(generated.placeholder).toBe(true);
    expect(result.cues.length).toBeGreaterThan(2);
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain("ari-voice-layer-host");
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain('data-no-timeline="true"');
    expect(readFileSync(join(root, "compositions/ari-voice-layer.html"), "utf8")).toContain(
      'data-audio-group="voiceover"',
    );
    const state = readVoiceWorkflow(root).state;
    expect(state?.draft.presentation).toMatchObject({
      mode: "lyriikka",
      preset: "vaalea",
      position: "keski",
      align: "vasen",
      safeInsetPx: 90,
    });
  });

  it("reflows timed text for free without network access and preserves omitted choices", async () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "fixture";
    const root = project();
    const quote = quoteVoiceWorkflow(root, {
      text: "Tässä on lämmin koti, jonka voit tehdä omaksesi.",
      voiceId: "fixture-fi",
      presentation: {
        mode: "tekstitys",
        preset: "vaalea",
        position: "ala",
        align: "oikea",
        safeInsetPx: 92,
        maxWords: 5,
        startSeconds: 0.35,
      },
    });
    const generated = await generateVoiceWorkflow(root, {
      quoteId: quote.quoteId,
      approved: true,
    });
    updateVoicePresentationWorkflow(root, {
      presentation: {
        mode: "tekstitys",
        preset: "vaalea",
        position: "ala",
        align: "oikea",
        safeInsetPx: 92,
        maxWords: 5,
        startSeconds: 0.35,
      },
    });
    const audioBefore = readFileSync(join(root, generated.audioPath));
    const alignmentBefore = readFileSync(join(root, generated.alignmentPath));

    const expectUnchangedVoice = () => {
      expect(readFileSync(join(root, generated.audioPath))).toEqual(audioBefore);
      expect(readFileSync(join(root, generated.alignmentPath))).toEqual(alignmentBefore);
    };

    process.env.ARI_VOICE_EXECUTION_MODE = "live";
    process.env.ARI_ELEVENLABS_VOICES_JSON = JSON.stringify([
      { id: "GdUwr3tVJwSb22ROvLCr", label: "Jukka" },
    ]);
    process.env.ELEVENLABS_API_KEY = "must-not-be-used";
    delete process.env.ELEVENLABS_VOICE_LIVE_APPROVED;
    const updated = updateVoicePresentationWorkflow(root, {
      presentation: { mode: "lyriikka", maxWords: 2, startSeconds: 1.125 },
    });

    expect(updated).toMatchObject({
      ok: true,
      reusedAudio: true,
      chargedUsd: 0,
      presentation: {
        mode: "lyriikka",
        preset: "vaalea",
        position: "ala",
        align: "oikea",
        safeInsetPx: 92,
        maxWords: 2,
        startSeconds: 1.125,
      },
    });
    expectUnchangedVoice();
    expect(readVoiceWorkflow(root).state?.draft.presentation).toEqual(updated.presentation);
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain('data-start="1.125"');

    const updatedAgain = updateVoicePresentationWorkflow(root, {
      presentation: {
        preset: "korostettu",
        position: "keski",
        align: "vasen",
        safeInsetPx: 120,
      },
    });
    expect(updatedAgain.presentation).toEqual({
      mode: "lyriikka",
      preset: "korostettu",
      position: "keski",
      align: "vasen",
      safeInsetPx: 120,
      maxWords: 2,
      startSeconds: 1.125,
    });
    expectUnchangedVoice();
  });

  it("keeps a paid quote valid across a free presentation update and uses the latest choices", async () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "fixture";
    const root = project();
    const firstQuote = quoteVoiceWorkflow(root, {
      text: "Ensimmäinen hyväksytty teksti.",
      voiceId: "fixture-fi",
    });
    await generateVoiceWorkflow(root, { quoteId: firstQuote.quoteId, approved: true });
    const nextQuote = quoteVoiceWorkflow(root, {
      text: "Toinen hyväksytty teksti tehdään samalla äänellä.",
      voiceId: "fixture-fi",
    });

    updateVoicePresentationWorkflow(root, {
      presentation: {
        mode: "lyriikka",
        preset: "korostettu",
        position: "keski",
        align: "vasen",
        safeInsetPx: 110,
        maxWords: 3,
        startSeconds: 0.75,
      },
    });

    const regenerated = await generateVoiceWorkflow(root, {
      quoteId: nextQuote.quoteId,
      approved: true,
    });
    expect(regenerated.presentation).toEqual({
      mode: "lyriikka",
      preset: "korostettu",
      position: "keski",
      align: "vasen",
      safeInsetPx: 110,
      maxWords: 3,
      startSeconds: 0.75,
    });
    expect(readVoiceWorkflow(root).state?.draft.presentation).toEqual(regenerated.presentation);
  });

  it("fails closed on stale source and when a key exists without the live approval", async () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "fixture";
    const root = project();
    const quote = quoteVoiceWorkflow(root, { text: "Hyväksytty teksti.", voiceId: "fixture-fi" });
    writeFileSync(join(root, "index.html"), readFileSync(join(root, "index.html"), "utf8") + "\n");
    await expect(
      generateVoiceWorkflow(root, { quoteId: quote.quoteId, approved: true }),
    ).rejects.toThrow(/muuttui/);

    process.env.ARI_VOICE_EXECUTION_MODE = "live";
    process.env.ARI_ELEVENLABS_VOICES_JSON = JSON.stringify([
      { id: "GdUwr3tVJwSb22ROvLCr", label: "Jukka" },
    ]);
    process.env.ELEVENLABS_API_KEY = "not-used";
    delete process.env.ELEVENLABS_VOICE_LIVE_APPROVED;
    const liveRoot = project();
    expect(() =>
      quoteVoiceWorkflow(liveRoot, {
        text: "Tämä pyyntö ei saa lähteä verkkoon.",
        voiceId: "GdUwr3tVJwSb22ROvLCr",
      }),
    ).toThrow(/käyttölupa puuttuu/);
  });

  it("does not return stale idempotent success after a published file changes", async () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "fixture";
    const root = project();
    const quote = quoteVoiceWorkflow(root, {
      text: "Tämä tulos sidotaan julkaistuihin tiedostoihin.",
      voiceId: "fixture-fi",
    });
    await generateVoiceWorkflow(root, { quoteId: quote.quoteId, approved: true });
    const composition = join(root, "compositions/ari-voice-layer.html");
    writeFileSync(composition, readFileSync(composition, "utf8") + "\n<!-- studio edit -->\n");

    await expect(
      generateVoiceWorkflow(root, { quoteId: quote.quoteId, approved: true }),
    ).rejects.toThrow(/tiedosto muuttui/);
  });

  it("preserves concurrent Studio edits and records a billed response before publication fails", async () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "live";
    process.env.ELEVENLABS_VOICE_LIVE_APPROVED = "1";
    process.env.ELEVENLABS_API_KEY = "server-only-test-key";
    process.env.ARI_ELEVENLABS_VOICES_JSON = JSON.stringify([
      { id: "GdUwr3tVJwSb22ROvLCr", label: "Jukka" },
    ]);
    const root = project();
    const costDir = mkdtempSync(join(tmpdir(), "ari-voice-cost-"));
    dirs.push(costDir);
    process.env.ARI_VOICE_COST_DIR = costDir;
    process.env.ARI_VOICE_BUDGET_USD = "0.09";
    const text = "Tämä vastaus laskutetaan mutta rinnakkainen muutos säilyy.";
    const quote = quoteVoiceWorkflow(root, {
      text,
      voiceId: "GdUwr3tVJwSb22ROvLCr",
    });
    const concurrentIndex = `${readFileSync(join(root, "index.html"), "utf8")}\n<!-- concurrent -->`;

    await expect(
      generateVoiceWorkflow(
        root,
        { quoteId: quote.quoteId, approved: true },
        {
          generateLiveVoice: async () => {
            writeFileSync(join(root, "index.html"), concurrentIndex);
            const fixture = fixtureVoice(text);
            return {
              ...fixture,
              audio: Buffer.from("billed-mp3"),
              mime: "audio/mpeg",
              provider: "elevenlabs",
              model: "eleven_multilingual_v2",
              characterCost: text.length,
              requestId: "request-billed",
            };
          },
        },
      ),
    ).rejects.toThrow(/index\.html/);

    expect(readFileSync(join(root, "index.html"), "utf8")).toBe(concurrentIndex);
    expect(existsSync(join(root, ".ari-notebook/voice/state.json"))).toBe(false);
    expect(readdirSync(costDir).filter((name) => name.endsWith(".settled.json"))).toHaveLength(1);
    const settlement = JSON.parse(
      readFileSync(
        join(costDir, readdirSync(costDir).find((name) => name.endsWith(".settled.json"))!),
        "utf8",
      ),
    );
    expect(settlement.actualUsd).toBe((text.length * 0.1) / 1000);
  });

  it("returns friendly server-owned voice choices and rejects an unconfigured id", () => {
    process.env.ARI_VOICE_EXECUTION_MODE = "live";
    process.env.ELEVENLABS_VOICE_LIVE_APPROVED = "1";
    process.env.ELEVENLABS_API_KEY = "server-only-test-key";
    process.env.ARI_ELEVENLABS_VOICES_JSON = JSON.stringify([
      { id: "voice-one", label: "Rauhallinen suomalainen ääni" },
    ]);
    const root = project();
    expect(readVoiceWorkflow(root)).toMatchObject({
      liveReady: true,
      voices: [{ id: "voice-one", label: "Rauhallinen suomalainen ääni" }],
      voiceUnavailableReason: null,
    });
    expect(() =>
      quoteVoiceWorkflow(root, { text: "Hyväksytty teksti.", voiceId: "voice-two" }),
    ).toThrow(/ei ole enää käytettävissä/);
  });
});

describe("word timing and grouping", () => {
  it("keeps approved punctuation and emits deterministic clip windows", () => {
    const text = "Hei koti! Tule katsomaan.";
    const characters = Array.from(text);
    const alignment = characterAlignmentToWords(text, {
      characters,
      character_start_times_seconds: characters.map((_, index) => index * 0.05),
      character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
    });
    expect(alignment.words.map((word) => word.text)).toEqual([
      "Hei",
      "koti!",
      "Tule",
      "katsomaan.",
    ]);
    const preferences = parseTimedTextPreferences({ maxWords: 2, startSeconds: 1 });
    const cues = groupTimedText(alignment, preferences);
    expect(cues.map((cue) => cue.text)).toEqual(["Hei koti!", "Tule katsomaan."]);
    const html = timedTextComposition({
      audioPath: "assets/voice/test.mp3",
      durationMs: 1400,
      cues,
      preferences,
    });
    expect(html).toContain('data-start="0.000"');
    expect(html).toContain('data-word-start="0.000"');
    expect(html).toContain("--ari-font-size:");
    expect(html).toContain("Hei");
  });

  it("reduces lyric type deterministically for a long Finnish compound word", () => {
    const preferences = parseTimedTextPreferences({ mode: "lyriikka", maxWords: 3 });
    const cues = groupTimedText(
      {
        transcript: "seitsemänkymmentäkahdeksan tuhatta euroa.",
        source: "elevenlabs",
        words: [
          { text: "seitsemänkymmentäkahdeksan", startMs: 0, endMs: 900 },
          { text: "tuhatta", startMs: 950, endMs: 1200 },
          { text: "euroa.", startMs: 1250, endMs: 1500 },
        ],
      },
      preferences,
    );
    const html = timedTextComposition({
      audioPath: "assets/voice/test.mp3",
      durationMs: 1500,
      cues,
      preferences,
    });
    expect(html).toContain('style="--ari-font-size:48px"');
  });
});

describe("ElevenLabs timestamp transport", () => {
  it("uses the timing endpoint and retains the original-text alignment and receipt", async () => {
    const text = "Hei koti.";
    const characters = Array.from(text);
    const transport = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("/with-timestamps");
      expect(init?.headers).toMatchObject({ "xi-api-key": "server-secret" });
      const request = JSON.parse(String(init?.body));
      expect(request).toMatchObject({
        text,
        model_id: "eleven_multilingual_v2",
        apply_text_normalization: "auto",
      });
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("mp3").toString("base64"),
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, index) => index * 0.1),
            character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.1),
          },
        }),
        {
          headers: {
            "character-cost": String(text.length),
            "request-id": "request-one",
          },
        },
      );
    };
    const output = await elevenLabsVoice({
      apiKey: "server-secret",
      voiceId: "voice-one",
      text,
      model: "eleven_multilingual_v2",
      transport,
    });
    expect(output.alignment).toMatchObject({
      source: "elevenlabs",
      transcript: text,
      words: [{ text: "Hei" }, { text: "koti." }],
    });
    expect(output.characterCost).toBe(text.length);
    expect(output.requestId).toBe("request-one");
  });
});
