export interface AriVoiceChoice {
  id: string;
  label: string;
}

const validId = (value: string) => /^[A-Za-z0-9_-]{5,80}$/u.test(value);

function parseVoiceChoice(item: unknown): AriVoiceChoice {
  if (!item || typeof item !== "object") throw new Error("Palvelimen puheäänivalikoima ei kelpaa.");
  const id = String(Reflect.get(item, "id") ?? "").trim();
  const label = String(Reflect.get(item, "label") ?? "").trim();
  if (!validId(id) || !label || label.length > 80)
    throw new Error("Palvelimen puheäänivalikoima ei kelpaa.");
  return { id, label };
}

function configuredLiveVoices(): AriVoiceChoice[] {
  const raw = process.env.ARI_ELEVENLABS_VOICES_JSON?.trim();
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Palvelimen puheäänivalikoima ei ole luettavissa.");
  }
  if (!Array.isArray(value)) throw new Error("Palvelimen puheäänivalikoima ei kelpaa.");
  const choices: AriVoiceChoice[] = [];
  for (const item of value) {
    const { id, label } = parseVoiceChoice(item);
    if (!choices.some((choice) => choice.id === id)) choices.push({ id, label });
  }
  return choices;
}

export function voiceChoices(mode: "elevenlabs" | "fixture"): AriVoiceChoice[] {
  return mode === "fixture"
    ? [{ id: "fixture-fi", label: "Suomenkielinen testiääni" }]
    : configuredLiveVoices();
}

export function requireVoiceChoice(mode: "elevenlabs" | "fixture", voiceId: string) {
  if (!voiceChoices(mode).some((choice) => choice.id === voiceId))
    throw new Error("Valittu puheääni ei ole enää käytettävissä. Valitse ääni uudelleen.");
}
