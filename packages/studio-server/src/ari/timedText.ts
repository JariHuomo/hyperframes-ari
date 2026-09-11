import type { AriVoiceAlignment, AriVoiceWord } from "./voiceAlignment.js";

export const TIMED_TEXT_PRESETS = ["selkea", "vaalea", "korostettu"] as const;
export const TIMED_TEXT_MODES = ["tekstitys", "lyriikka"] as const;
export const TIMED_TEXT_POSITIONS = ["yla", "keski", "ala"] as const;
export const TIMED_TEXT_ALIGNS = ["vasen", "keskella", "oikea"] as const;
export type TimedTextPreset = (typeof TIMED_TEXT_PRESETS)[number];
export type TimedTextMode = (typeof TIMED_TEXT_MODES)[number];
export type TimedTextPosition = (typeof TIMED_TEXT_POSITIONS)[number];
export type TimedTextAlign = (typeof TIMED_TEXT_ALIGNS)[number];

export interface TimedTextPreferences {
  mode: TimedTextMode;
  preset: TimedTextPreset;
  position: TimedTextPosition;
  align: TimedTextAlign;
  safeInsetPx: number;
  maxWords: number;
  startSeconds: number;
}

export interface TimedTextCue {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words: AriVoiceWord[];
}

const choice = <T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) =>
  typeof value === "string" && allowed.includes(value) ? (value as T[number]) : fallback;
const finite = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function parseTimedTextPreferences(
  value: unknown,
  previous?: TimedTextPreferences,
): TimedTextPreferences {
  const row = value && typeof value === "object" ? value : {};
  const prior: TimedTextPreferences = previous ?? {
    mode: "tekstitys",
    preset: "selkea",
    position: "ala",
    align: "keskella",
    safeInsetPx: 76,
    maxWords: 5,
    startSeconds: 0.35,
  };
  const safeInsetPx = Math.round(finite(Reflect.get(row, "safeInsetPx"), prior.safeInsetPx));
  const maxWords = Math.round(finite(Reflect.get(row, "maxWords"), prior.maxWords));
  const startSeconds = finite(Reflect.get(row, "startSeconds"), prior.startSeconds);
  if (safeInsetPx < 48 || safeInsetPx > 180)
    throw new Error("Turva-alueen pitää olla 48–180 pikseliä.");
  if (maxWords < 2 || maxWords > 9) throw new Error("Tekstiryhmässä voi olla 2–9 sanaa.");
  if (startSeconds < 0 || startSeconds > 300)
    throw new Error("Puheen aloitusajan pitää olla nollan ja viiden minuutin välissä.");
  return {
    mode: choice(Reflect.get(row, "mode"), TIMED_TEXT_MODES, prior.mode),
    preset: choice(Reflect.get(row, "preset"), TIMED_TEXT_PRESETS, prior.preset),
    position: choice(Reflect.get(row, "position"), TIMED_TEXT_POSITIONS, prior.position),
    align: choice(Reflect.get(row, "align"), TIMED_TEXT_ALIGNS, prior.align),
    safeInsetPx,
    maxWords,
    startSeconds: Math.round(startSeconds * 1000) / 1000,
  };
}

function closesPhrase(text: string): boolean {
  return /[.!?…:;]$/u.test(text);
}

export function groupTimedText(
  alignment: AriVoiceAlignment,
  preferences: TimedTextPreferences,
): TimedTextCue[] {
  const result: TimedTextCue[] = [];
  let words: AriVoiceWord[] = [];
  const flush = () => {
    if (!words.length) return;
    result.push({
      id: `ari-cue-${String(result.length + 1).padStart(3, "0")}`,
      text: words.map((word) => word.text).join(" "),
      startMs: words[0]!.startMs,
      endMs: words.at(-1)!.endMs,
      words,
    });
    words = [];
  };
  for (const word of alignment.words) {
    words.push(word);
    const elapsed = words.at(-1)!.endMs - words[0]!.startMs;
    const phraseBreak = closesPhrase(word.text) && words.length >= 2;
    const durationLimit = preferences.mode === "lyriikka" ? 2_200 : 3_100;
    if (words.length >= preferences.maxWords || elapsed >= durationLimit || phraseBreak) flush();
  }
  flush();
  return result;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character]!;
  });
}

function cueFontSize(mode: TimedTextMode, longestWord: number): number {
  if (mode === "tekstitys") return longestWord > 30 ? 48 : 56;
  if (longestWord > 24) return 48;
  return longestWord > 20 ? 56 : 68;
}

export function timedTextComposition(input: {
  audioPath: string;
  durationMs: number;
  cues: TimedTextCue[];
  preferences: TimedTextPreferences;
}): string {
  const { preferences } = input;
  const top = { yla: 180, keski: 760, ala: 1370 }[preferences.position];
  const justify = { vasen: "flex-start", oikea: "flex-end", keskella: "center" }[preferences.align];
  const textAlign = { vasen: "left", oikea: "right", keskella: "center" }[preferences.align];
  const duration = input.durationMs / 1000;
  const cues = input.cues
    .map((cue) => {
      const start = cue.startMs / 1000;
      const cueDuration = Math.max(0.05, (cue.endMs - cue.startMs) / 1000);
      const longestWord = Math.max(...cue.words.map((word) => Array.from(word.text).length));
      const fontSize = cueFontSize(preferences.mode, longestWord);
      const words = cue.words
        .map(
          (word) =>
            `<span data-word-start="${(word.startMs / 1000).toFixed(3)}" data-word-end="${(word.endMs / 1000).toFixed(3)}">${escapeHtml(word.text)}</span>`,
        )
        .join(" ");
      return `<div id="${cue.id}" class="clip ari-cue" data-start="${start.toFixed(3)}" data-duration="${cueDuration.toFixed(3)}" data-track-index="91" style="--ari-font-size:${fontSize}px">${words}</div>`;
    })
    .join("\n");
  return `<!DOCTYPE html><html lang="fi"><body><template>
<div id="ari-voice-layer" data-composition-id="ari-voice-layer" data-width="1080" data-height="1920" data-duration="${duration.toFixed(3)}">
<style>
#ari-voice-layer{position:relative;width:1080px;height:1920px;overflow:hidden;background:transparent;font-family:Inter,Arial,sans-serif;pointer-events:none}
.ari-cue{position:absolute;left:${preferences.safeInsetPx}px;right:${preferences.safeInsetPx}px;top:${top}px;min-height:180px;display:flex;align-items:center;justify-content:${justify};text-align:${textAlign};font-size:var(--ari-font-size);font-weight:${preferences.mode === "lyriikka" ? 800 : 700};line-height:1.12;color:${preferences.preset === "vaalea" ? "#26372F" : "#FFFFFF"};text-shadow:${preferences.preset === "korostettu" ? "0 4px 18px rgba(0,0,0,.7)" : "none"};isolation:isolate}
.ari-cue span{display:inline-block;position:relative;z-index:1;max-width:100%;overflow-wrap:anywhere}.ari-cue{gap:.22em;flex-wrap:wrap}
.ari-cue::before{content:"";position:absolute;inset:-18px -24px;z-index:-1;border-radius:${preferences.preset === "korostettu" ? 14 : 28}px;background:${preferences.preset === "selkea" ? "rgba(19,27,23,.82)" : preferences.preset === "vaalea" ? "rgba(255,252,245,.92)" : "rgba(154,73,52,.9)"}}
</style>
<audio id="ari-voice-audio" data-audio-group="voiceover" src="${escapeHtml(input.audioPath)}" data-start="0" data-duration="${duration.toFixed(3)}"></audio>
${cues}
</div></template></body></html>`;
}
