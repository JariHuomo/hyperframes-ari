import { AriCreativeFeedback } from "./AriCreativeFeedback";
/** Ari fork: explicit command form and source-frame evidence. */
import { useState } from "react";
import { buildStudioLook, type StudioLookSnapshot } from "../webmcp/tools/lookTools";
import type { AriAgentBridge, AriCallReceipt } from "./agentBridge";
import { ariButton as button } from "./styles";
import { AriFrameEvidence } from "./AriFrameEvidence";
import { AriExport } from "./AriExport";
import { AriProperties } from "./AriProperties";
import { AriMotion } from "./AriMotion";
import { AriQuickText } from "./AriQuickText";
import { AriPanelSections } from "./AriPanelSections";
import { AriReview } from "./AriReview";

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
  const busy = call?.state === "running";
  const tools = bridge.tools();
  const selectedTool = tools.find((tool) => tool.name === toolName);
  const currentSelection = buildStudioLook(getSnapshot());
  const selected = currentSelection.ok ? currentSelection.selection : null;
  async function run(name: string, args: unknown = {}) {
    setInputError("");
    await bridge.call(name, args);
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
      studio_seek: { time: Number(time.replace(",", ".")) },
      studio_frame: { time: Number(time.replace(",", ".")) },
      studio_select: { handle },
      studio_inspect: {},
      studio_set_text: { handle, text: selectedText },
      studio_set_style: { handle, styles: { color: "#ffffff" } },
      studio_add_animation: { handle, method: "from" },
    };
    setInput(JSON.stringify(examples[name] ?? {}, null, 2));
  }

  return (
    <div
      data-testid="ari-command-panel"
      className="h-full space-y-4 overflow-auto border-l border-neutral-600 bg-[#202525] p-4 text-neutral-100"
    >
      <AriPanelSections
        text={
          selected?.handle &&
          selected.text !== null &&
          getSnapshot().selection?.textFields.length === 1 ? (
            <AriQuickText
              key={`${selected.handle}:${selected.text}`}
              bridge={bridge}
              handle={selected.handle}
              initialText={selected.text}
              busy={busy}
            />
          ) : (
            <p>Valitse muokattava teksti kuvasta tai tasoluettelosta.</p>
          )
        }
        appearance={
          selected?.handle ? (
            <AriProperties bridge={bridge} handle={selected.handle} busy={busy} />
          ) : (
            <p>Valitse kohde.</p>
          )
        }
        motion={
          selected?.handle ? (
            <AriMotion bridge={bridge} handle={selected.handle} busy={busy} />
          ) : (
            <p>Valitse kohde.</p>
          )
        }
        review={
          <>
            <button
              type="button"
              className={button}
              onClick={() => window.dispatchEvent(new Event("ari-open-versions"))}
            >
              Vertaa muutosta
            </button>
            <AriCreativeFeedback busy={busy} />
            <AriReview bridge={bridge} projectId={getSnapshot().projectId} />
            <AriExport busy={busy} />
            <AriFrameEvidence call={call} />
          </>
        }
      />
      <div>
        <details>
          <summary className="cursor-pointer py-2 text-sm">Skriptikomennot</summary>
          <label className="block text-sm">
            Toiminto
            <select
              className="my-2 block min-h-10 w-full rounded border border-neutral-500 bg-neutral-900 p-2"
              aria-label="Skriptitoiminto"
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
        </details>
      </div>
      <details className="overflow-auto">
        <summary>Tekniset tiedot ja todisteet</summary>
        <strong>Tulos ja todiste</strong>
        <p className="my-2 text-xs text-neutral-400">
          Tallennettu muutos ja kuvan laatu arvioidaan erikseen.
        </p>
        <AriFrameEvidence call={call} />
        <details>
          <summary className="cursor-pointer py-2 text-sm">Toiminnon tarkat tiedot</summary>
          <pre
            aria-label="Toiminnon tulos"
            className="whitespace-pre-wrap break-all rounded bg-neutral-950 p-3 text-xs"
          >
            {call ? JSON.stringify(call, null, 2) : "Ei vielä toimintoja."}
          </pre>
        </details>
      </details>
    </div>
  );
}
