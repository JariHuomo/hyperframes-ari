/** Ari fork: explicit command form and source-frame evidence. */
import { useState } from "react";
import { buildStudioLook, type StudioLookSnapshot } from "../webmcp/tools/lookTools";
import type { AriAgentBridge, AriCallReceipt } from "./agentBridge";
import { ariButton as button } from "./styles";

const labels: Record<string, string> = {
  studio_look: "Lue näkymä",
  studio_select: "Valitse kohde",
  studio_seek: "Siirry aikaan",
  studio_frame: "Tarkista ruutukuva",
  studio_inspect: "Tutki valintaa",
  studio_set_text: "Muuta teksti",
  studio_set_style: "Muuta ulkoasua",
  studio_transform: "Siirrä tai skaalaa",
  studio_add_animation: "Lisää liike",
  studio_update_animation: "Muuta liikettä",
  studio_add_keyframe: "Lisää avainruutu",
  studio_delete_animation: "Poista liike",
};

export function AriCommandPanel({
  bridge,
  getSnapshot,
  time,
  call,
}: {
  bridge: AriAgentBridge;
  getSnapshot: () => StudioLookSnapshot;
  time: string;
  call: AriCallReceipt | null;
}) {
  const [toolName, setToolName] = useState("studio_look");
  const [input, setInput] = useState("{}");
  const [inputError, setInputError] = useState("");
  const [scene, setScene] = useState(() => buildStudioLook(getSnapshot(), { limit: 100 }));
  const busy = call?.state === "running";
  const tools = bridge.tools();
  const selectedTool = tools.find((tool) => tool.name === toolName);
  async function run(name: string, args: unknown = {}) {
    setInputError("");
    await bridge.call(name, args);
    setScene(buildStudioLook(getSnapshot(), { limit: 100 }));
  }
  async function runInput() {
    try {
      await run(toolName, JSON.parse(input));
    } catch {
      setInputError("Tarkista komennon JSON-muoto.");
    }
  }
  function prepare(name: string) {
    setToolName(name);
    const look = buildStudioLook(getSnapshot());
    const selection = look.ok ? look.selection : null;
    const handle = selection?.handle ?? "";
    const selectedText = selection?.text ?? "";
    const examples: Record<string, object> = {
      studio_seek: { time: Number(time) },
      studio_frame: { time: Number(time) },
      studio_select: { handle },
      studio_inspect: {},
      studio_set_text: { handle, text: selectedText },
      studio_set_style: { handle, styles: { color: "#ffffff" } },
    };
    setInput(JSON.stringify(examples[name] ?? {}, null, 2));
  }

  return (
    <div className="grid max-h-80 grid-cols-[minmax(180px,1fr)_minmax(280px,1fr)_minmax(280px,1.3fr)] gap-4 overflow-auto border-t border-neutral-600 p-4">
      <div className="overflow-auto">
        <div className="mb-2 flex items-center justify-between">
          <strong>Kohteet</strong>
          <button
            className={button}
            onClick={() => setScene(buildStudioLook(getSnapshot(), { limit: 100 }))}
          >
            Päivitä
          </button>
        </div>
        {scene?.ok &&
          scene.elements.map((element) => (
            <button
              key={element.handle}
              className="mb-1 block min-h-10 w-full rounded border border-neutral-600 px-3 text-left text-sm hover:bg-neutral-700"
              disabled={busy}
              onClick={() => void run("studio_select", { handle: element.handle })}
            >
              {element.label}
              <span className="ml-2 text-xs text-neutral-400">{element.tag}</span>
              <span className="block break-all text-xs text-neutral-400">{element.sourceFile}</span>
            </button>
          ))}
        {scene?.ok && scene.truncated && (
          <p>Näytetään ensimmäiset sata kohdetta. Lue loput skriptirajapinnasta.</p>
        )}
      </div>
      <div>
        <label className="block text-sm">
          Toiminto
          <select
            className="my-2 block min-h-10 w-full rounded border border-neutral-500 bg-neutral-900 p-2"
            value={toolName}
            onChange={(event) => prepare(event.target.value)}
          >
            {tools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {labels[tool.name] ?? tool.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Komennon tiedot (JSON)
          <textarea
            aria-label="Komennon tiedot"
            className="my-2 h-24 w-full rounded border border-neutral-500 bg-neutral-900 p-2 font-mono text-xs"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button
          className={`${button} bg-emerald-900`}
          disabled={busy}
          onClick={() => void runInput()}
        >
          Suorita toiminto
        </button>
        {inputError && (
          <p role="alert" className="text-amber-300">
            {inputError}
          </p>
        )}
        <details className="mt-3 text-xs">
          <summary>Ohje ja skriptirajapinta</summary>
          <p className="my-2">{selectedTool?.description}</p>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(selectedTool?.inputSchema, null, 2)}
          </pre>
          <code>await window.ariStudio.call("studio_look", {"{}"})</code>
        </details>
      </div>
      <div className="overflow-auto">
        <strong>Tulos ja todiste</strong>
        <p className="my-2 text-xs text-neutral-400">
          Tallennettu muutos ja kuvan laatu arvioidaan erikseen.
        </p>
        <FrameResult result={call?.result} />
        <pre
          aria-label="Toiminnon tulos"
          className="whitespace-pre-wrap break-all rounded bg-neutral-950 p-3 text-xs"
        >
          {call ? JSON.stringify(call, null, 2) : "Ei vielä toimintoja."}
        </pre>
      </div>
    </div>
  );
}

function FrameResult({ result }: { result: unknown }) {
  if (typeof result !== "object" || result === null || Reflect.get(result, "ok") !== true)
    return null;
  const url: unknown = Reflect.get(result, "url");
  const time: unknown = Reflect.get(result, "time");
  if (typeof url !== "string" || typeof time !== "number") return null;
  let frameUrl: URL;
  try {
    frameUrl = new URL(url, window.location.href);
  } catch {
    return null;
  }
  if (frameUrl.origin !== window.location.origin || !frameUrl.pathname.startsWith("/api/"))
    return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mb-3 block text-emerald-200">
      Avaa tallennetusta lähteestä renderöity ruutu · {time.toFixed(2)} s
      <img
        src={url}
        alt={`Renderöity ruutu kohdassa ${time.toFixed(2)} sekuntia`}
        className="mt-2 max-h-36 rounded object-contain"
      />
    </a>
  );
}
