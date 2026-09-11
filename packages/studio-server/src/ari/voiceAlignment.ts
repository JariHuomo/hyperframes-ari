export interface AriVoiceWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface AriVoiceAlignment {
  source: "elevenlabs" | "fixture";
  transcript: string;
  words: AriVoiceWord[];
}

interface CharacterAlignment {
  characters?: unknown;
  character_start_times_seconds?: unknown;
  character_end_times_seconds?: unknown;
}

function readCharacters(expectedText: string, value: CharacterAlignment | null | undefined) {
  const characters = value?.characters;
  const starts = value?.character_start_times_seconds;
  const ends = value?.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends))
    throw new Error("Äänipalvelun sanakohtainen ajoitus puuttuu.");
  validateCharacterArrays(expectedText, characters, starts, ends);
  return { characters, starts, ends };
}

function validateCharacterArrays(
  expectedText: string,
  characters: unknown[],
  starts: unknown[],
  ends: unknown[],
) {
  if (
    characters.length === 0 ||
    starts.length !== characters.length ||
    ends.length !== characters.length
  )
    throw new Error("Äänipalvelun ajoituksen merkkimäärät eivät täsmää.");
  if (!characters.every((item) => typeof item === "string") || characters.join("") !== expectedText)
    throw new Error("Äänipalvelun ajoitus ei vastaa hyväksyttyä tekstiä.");
}

function validateCharacterTime(
  start: number,
  end: number,
  previousStart: number,
  previousEnd: number,
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start < previousStart ||
    end < previousEnd
  )
    throw new Error("Äänipalvelun ajoitus ei ole nouseva.");
}

export function characterAlignmentToWords(
  expectedText: string,
  value: CharacterAlignment | null | undefined,
  source: AriVoiceAlignment["source"] = "elevenlabs",
): AriVoiceAlignment {
  const { characters, starts, ends } = readCharacters(expectedText, value);
  const words: AriVoiceWord[] = [];
  let token = "";
  let first = -1;
  let previousStart = 0;
  let previousEnd = 0;
  const flush = (last: number) => {
    if (first < 0 || !token) return;
    words.push({
      text: token,
      startMs: Math.round(Number(starts[first]) * 1000),
      endMs: Math.round(Number(ends[last]) * 1000),
    });
    token = "";
    first = -1;
  };
  for (let index = 0; index < characters.length; index++) {
    const start = Number(starts[index]);
    const end = Number(ends[index]);
    validateCharacterTime(start, end, previousStart, previousEnd);
    previousStart = start;
    previousEnd = end;
    const character = String(characters[index]);
    if (!character.trim()) {
      flush(index - 1);
      continue;
    }
    if (first < 0) first = index;
    token += character;
  }
  flush(characters.length - 1);
  if (!words.length || words.some((word) => word.endMs <= word.startMs))
    throw new Error("Äänipalvelun ajoituksesta ei saatu puhuttuja sanoja.");
  return { source, transcript: expectedText, words };
}

/** Deterministic fixture timing. It is visibly labelled fixture and never called provider timing. */
export function fixtureAlignment(text: string): AriVoiceAlignment {
  const tokens = text.trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) throw new Error("Puheteksti puuttuu.");
  const weights = tokens.map((token) => Math.max(2, Array.from(token).length + 1));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const durationMs = Math.max(2_000, Math.round(total * 92));
  let cursor = 180;
  const words = tokens.map((token, index) => {
    const startMs = cursor;
    const span = Math.round(((durationMs - 360) * weights[index]!) / total);
    cursor = index === tokens.length - 1 ? durationMs - 180 : cursor + span;
    return { text: token, startMs, endMs: cursor };
  });
  return { source: "fixture", transcript: text, words };
}
