import {
  characterAlignmentToWords,
  fixtureAlignment,
  type AriVoiceAlignment,
} from "./voiceAlignment.js";

export const ELEVENLABS_VOICE_MODEL = "eleven_multilingual_v2";
export const ELEVENLABS_USD_PER_1K_CHARACTERS = 0.1;
export const VOICE_HARD_CEILING_USD = 0.3;

export interface AriVoiceOutput {
  audio: Buffer;
  mime: "audio/mpeg" | "audio/wav";
  durationMs: number;
  alignment: AriVoiceAlignment;
  provider: "elevenlabs" | "fixture";
  model: string;
  characterCost: number;
  requestId?: string;
  traceId?: string;
}

interface ElevenLabsResponse {
  audio_base64?: unknown;
  alignment?: {
    characters?: unknown;
    character_start_times_seconds?: unknown;
    character_end_times_seconds?: unknown;
  };
}

function wavSilence(durationMs: number): Buffer {
  const sampleRate = 16_000;
  const samples = Math.ceil((durationMs * sampleRate) / 1000);
  const bytes = samples * 2;
  const output = Buffer.alloc(44 + bytes);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + bytes, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(bytes, 40);
  return output;
}

function durationFromAlignment(alignment: AriVoiceAlignment): number {
  return Math.max(1, alignment.words.at(-1)?.endMs ?? 0);
}

function headerInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name)?.trim();
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function estimatedVoiceUsd(text: string): number {
  return (
    Math.ceil((Math.max(1, text.length) * ELEVENLABS_USD_PER_1K_CHARACTERS * 100) / 1000) / 100
  );
}

export function fixtureVoice(text: string): AriVoiceOutput {
  const alignment = fixtureAlignment(text);
  const durationMs = durationFromAlignment(alignment);
  return {
    audio: wavSilence(durationMs),
    mime: "audio/wav",
    durationMs,
    alignment,
    provider: "fixture",
    model: "deterministic-silence-v1",
    characterCost: 0,
  };
}

export async function elevenLabsVoice(input: {
  apiKey: string;
  voiceId: string;
  text: string;
  model: string;
  transport?: typeof fetch;
}): Promise<AriVoiceOutput> {
  const transport = input.transport ?? fetch;
  const response = await transport(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
      headers: { "content-type": "application/json", "xi-api-key": input.apiKey },
      body: JSON.stringify({
        text: input.text,
        model_id: input.model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          speed: 1,
        },
        apply_text_normalization: "auto",
      }),
    },
  );
  const raw = await response.text();
  if (!response.ok)
    throw new Error(`ElevenLabs ei luonut puhetta (${response.status}): ${raw.slice(0, 240)}`);
  let body: ElevenLabsResponse;
  try {
    body = JSON.parse(raw) as ElevenLabsResponse;
  } catch {
    throw new Error("ElevenLabs palautti virheellisen vastauksen.");
  }
  if (typeof body.audio_base64 !== "string" || !body.audio_base64)
    throw new Error("ElevenLabs ei palauttanut äänitiedostoa.");
  const alignment = characterAlignmentToWords(input.text, body.alignment);
  const characterCost = headerInteger(response.headers, "character-cost");
  if (characterCost === undefined)
    throw new Error("ElevenLabs ei palauttanut kulun todentavaa merkkimäärää.");
  return {
    audio: Buffer.from(body.audio_base64, "base64"),
    mime: "audio/mpeg",
    durationMs: durationFromAlignment(alignment),
    alignment,
    provider: "elevenlabs",
    model: input.model,
    characterCost,
    requestId: response.headers.get("request-id")?.trim() || undefined,
    traceId: response.headers.get("x-trace-id")?.trim() || undefined,
  };
}
