import { useEffect, useState } from "react";
import { AriStructureDialog } from "./AriStructureDialog";
import { ariButton as button } from "./styles";
import { ariField as field } from "./AriNotebookFields";

interface Presentation {
  mode: "tekstitys" | "lyriikka";
  preset: "selkea" | "vaalea" | "korostettu";
  position: "yla" | "keski" | "ala";
  align: "vasen" | "keskella" | "oikea";
  safeInsetPx: number;
  maxWords: number;
  startSeconds: number;
}

interface Draft {
  text: string;
  voiceId: string;
  model: "eleven_multilingual_v2";
  presentation: Presentation;
}

interface Quote {
  quoteId: string;
  providerLabel: string;
  maxUsd: number;
  characters: number;
  disclosure: string;
}

interface Generated {
  audioPath: string;
  durationMs: number;
  cues: Array<{ id: string; text: string; startMs: number; endMs: number }>;
  placeholder: boolean;
  actualUsd: number;
}

interface VoiceChoice {
  id: string;
  label: string;
}

const defaults: Draft = {
  text: "",
  voiceId: "fixture-fi",
  model: "eleven_multilingual_v2",
  presentation: {
    mode: "tekstitys",
    preset: "selkea",
    position: "ala",
    align: "keskella",
    safeInsetPx: 76,
    maxWords: 5,
    startSeconds: 0.35,
  },
};

async function request(projectId: string, suffix = "", init?: RequestInit) {
  const response = await fetch(
    `/api/ari/projects/${encodeURIComponent(projectId)}/voice${suffix}`,
    init,
  );
  const data = await response.json();
  if (!response.ok || data.ok !== true)
    throw new Error(String(data.error ?? "Puheäänen käsittely ei onnistunut."));
  return data;
}

export function AriVoice({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={button} disabled={!projectId} onClick={() => setOpen(true)}>
        Puhe ja ajoitettu teksti
      </button>
      {open && projectId && (
        <VoiceDialog key={projectId} projectId={projectId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function restoredDraft(saved: Draft, voices: VoiceChoice[]): Draft {
  const selected = voices.find((voice) => voice.id === saved.voiceId) ?? voices[0];
  return { ...saved, voiceId: selected?.id ?? saved.voiceId };
}

function VoiceDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(defaults);
  const [provider, setProvider] = useState("Ladataan…");
  const [liveReady, setLiveReady] = useState(false);
  const [voices, setVoices] = useState<VoiceChoice[]>([]);
  const [voiceUnavailableReason, setVoiceUnavailableReason] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void request(projectId)
      .then((data) => {
        setProvider(String(data.providerLabel));
        setLiveReady(data.liveReady === true);
        const availableVoices = Array.isArray(data.voices) ? (data.voices as VoiceChoice[]) : [];
        setVoices(availableVoices);
        setVoiceUnavailableReason(String(data.voiceUnavailableReason ?? ""));
        const state = data.state as { draft?: Draft; generated?: Generated } | null;
        setDraft((current) => restoredDraft(state?.draft ?? current, availableVoices));
        if (state?.generated) setGenerated(state.generated);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [projectId]);

  function presentation<K extends keyof Presentation>(key: K, value: Presentation[K]) {
    setDraft((current) => ({
      ...current,
      presentation: { ...current.presentation, [key]: value },
    }));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Toiminto epäonnistui.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareQuote() {
    const data = await request(projectId, "/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: draft.text, voiceId: draft.voiceId, model: draft.model }),
    });
    setQuote(data as Quote);
    setStatus("Hinta ja lähetettävä teksti ovat valmiina hyväksyttäväksi.");
  }

  async function generate() {
    if (!quote) return;
    const generatedData = (await request(projectId, "/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteId: quote.quoteId, approved: true }),
    })) as Generated;
    const presentationData = await savePresentation();
    setGenerated({
      ...generatedData,
      durationMs: Number(presentationData.durationMs),
      cues: presentationData.cues as Generated["cues"],
    });
    setQuote(null);
    setStatus("Puheraita lisättiin mainokseen. Valittu tekstin esitys tallennettiin maksutta.");
  }

  function savePresentation() {
    return request(projectId, "/presentation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presentation: draft.presentation }),
    });
  }

  async function updatePresentation() {
    const data = await savePresentation();
    setGenerated((current) =>
      current
        ? {
            ...current,
            durationMs: Number(data.durationMs),
            cues: data.cues as Generated["cues"],
          }
        : current,
    );
    setStatus(
      `${draft.presentation.mode === "lyriikka" ? "Lyriikkatyyli" : "Tekstitys"} päivitettiin esikatseluun maksutta. Puheääntä ei luotu uudelleen.`,
    );
  }

  return (
    <AriStructureDialog
      label="Puhe ja ajoitettu teksti"
      title="Puhe ja ajoitettu teksti"
      busy={busy}
      onClose={onClose}
    >
      <p className="text-sm">
        Kirjoita hyväksytty puheteksti. Ari säilyttää äänen mukana sanakohtaiset ajat ja käyttää
        niitä muokattavaan tekstitykseen tai lyriikkatyyliin.
      </p>
      <p className="text-xs text-neutral-300">
        Käytössä: {provider}.{" "}
        {liveReady
          ? "Yhteys on käyttövalmis."
          : voiceUnavailableReason || "Testitila ei lähetä tekstiä ulkopuolelle."}
      </p>
      <label className="block text-sm">
        Hyväksytty puheteksti
        <textarea
          aria-label="Hyväksytty puheteksti"
          className={`${field} mt-1 h-32 w-full`}
          value={draft.text}
          onChange={(event) => {
            setDraft({ ...draft, text: event.target.value });
            setQuote(null);
          }}
        />
      </label>
      <label className="block text-sm">
        Puheääni
        <select
          aria-label="Puheääni"
          className={`${field} mt-1 w-full`}
          disabled={voices.length === 0}
          value={draft.voiceId}
          onChange={(event) => {
            setDraft({ ...draft, voiceId: event.target.value });
            setQuote(null);
          }}
        >
          {voices.length === 0 && <option value={draft.voiceId}>Ei valittavia ääniä</option>}
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Ryhmittely"
          value={draft.presentation.mode}
          options={[
            ["tekstitys", "Tekstitys"],
            ["lyriikka", "Lyriikkatyyli"],
          ]}
          change={(value) => presentation("mode", value as Presentation["mode"])}
        />
        <Select
          label="Tyyli"
          value={draft.presentation.preset}
          options={[
            ["selkea", "Selkeä tumma"],
            ["vaalea", "Vaalea kortti"],
            ["korostettu", "Korostettu"],
          ]}
          change={(value) => presentation("preset", value as Presentation["preset"])}
        />
        <Select
          label="Sijainti"
          value={draft.presentation.position}
          options={[
            ["yla", "Ylhäällä"],
            ["keski", "Keskellä"],
            ["ala", "Alhaalla"],
          ]}
          change={(value) => presentation("position", value as Presentation["position"])}
        />
        <Select
          label="Tasaus"
          value={draft.presentation.align}
          options={[
            ["vasen", "Vasemmalle"],
            ["keskella", "Keskelle"],
            ["oikea", "Oikealle"],
          ]}
          change={(value) => presentation("align", value as Presentation["align"])}
        />
        <NumberField
          label="Turva-alue (px)"
          value={draft.presentation.safeInsetPx}
          min={48}
          max={180}
          change={(value) => presentation("safeInsetPx", value)}
        />
        <NumberField
          label="Sanoja ryhmässä"
          value={draft.presentation.maxWords}
          min={2}
          max={9}
          change={(value) => presentation("maxWords", value)}
        />
        <NumberField
          label="Puhe alkaa (s)"
          value={draft.presentation.startSeconds}
          min={0}
          max={300}
          step={0.05}
          change={(value) => presentation("startSeconds", value)}
        />
      </div>
      <VoiceActions
        generated={generated}
        busy={busy}
        draft={draft}
        voices={voices}
        quote={quote}
        run={run}
        updatePresentation={updatePresentation}
        prepareQuote={prepareQuote}
        generate={generate}
      />
      {status && (
        <p role="status" className="text-emerald-300">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-amber-300">
          {error}
        </p>
      )}
      {generated && <VoiceResult projectId={projectId} result={generated} />}
    </AriStructureDialog>
  );
}

function VoiceActions({
  generated,
  busy,
  draft,
  voices,
  quote,
  run,
  updatePresentation,
  prepareQuote,
  generate,
}: {
  generated: Generated | null;
  busy: boolean;
  draft: Draft;
  voices: VoiceChoice[];
  quote: Quote | null;
  run: (action: () => Promise<void>) => Promise<void>;
  updatePresentation: () => Promise<void>;
  prepareQuote: () => Promise<void>;
  generate: () => Promise<void>;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {generated && (
          <button className={button} disabled={busy} onClick={() => void run(updatePresentation)}>
            Päivitä tekstin esitys maksutta
          </button>
        )}
        <button
          className={`${button} bg-emerald-900`}
          disabled={busy || !draft.text.trim() || voices.length === 0}
          onClick={() => void run(prepareQuote)}
        >
          Näytä hinta
        </button>
        {quote && (
          <button
            className={`${button} border-emerald-400`}
            disabled={busy}
            onClick={() => void run(generate)}
          >
            Hyväksy ja luo · {quote.maxUsd.toFixed(2).replace(".", ",")} USD enintään
          </button>
        )}
      </div>
      {quote && (
        <div className="rounded border border-amber-500 p-3 text-sm">
          <strong>
            {quote.providerLabel} · {quote.characters} merkkiä
          </strong>
          <p>{quote.disclosure}</p>
        </div>
      )}
      {generated && (
        <p className="text-xs text-neutral-300">
          Ryhmittelyn, tyylin, sijainnin, tasauksen, turva-alueen, sanamäärän ja aloitusajan
          muutokset voi esikatsella maksutta. Hinta koskee vain uutta puhetekstiä tai ääntä.
        </p>
      )}
    </>
  );
}

function VoiceResult({ projectId, result }: { projectId: string; result: Generated }) {
  const source = `/api/projects/${encodeURIComponent(projectId)}/preview/${result.audioPath.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <section className="rounded bg-neutral-900 p-3 text-sm">
      <strong>
        {result.placeholder ? "Testiääni" : "Puheääni"} ·{" "}
        {(result.durationMs / 1000).toFixed(1).replace(".", ",")} s
      </strong>
      <audio className="mt-2 w-full" controls src={source} />
      <p>
        {result.cues.length} ajoitettua tekstiryhmää. Hinta{" "}
        {result.actualUsd.toFixed(4).replace(".", ",")} USD.
      </p>
      <ol className="max-h-32 list-decimal overflow-auto pl-5 text-xs">
        {result.cues.map((cue) => (
          <li key={cue.id}>
            {(cue.startMs / 1000).toFixed(2).replace(".", ",")}–
            {(cue.endMs / 1000).toFixed(2).replace(".", ",")} s · {cue.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Select({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  change: (value: string) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <select
        aria-label={label}
        className={`${field} mt-1 w-full`}
        value={value}
        onChange={(event) => change(event.target.value)}
      >
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  change: (value: number) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        aria-label={label}
        className={`${field} mt-1 w-full`}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  );
}
