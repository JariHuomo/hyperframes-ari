import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePlayerStore } from "../player";
import { useStudioShellContext, useStudioPlaybackContext } from "../contexts/StudioContext";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import { studioEditLifecycle } from "../webmcp/writeCoordinator";
import { type StudioLookSnapshot } from "../webmcp/tools/lookTools";
import type { AriAgentBridge, AriCallReceipt } from "./agentBridge";
import { ariNumber } from "./AriNumber";
import { useAriTime } from "./useAriTime";
import { AriTimeline } from "./AriTimeline";
import { AriLayers } from "./AriLayers";
import { buildStudioLook } from "../webmcp/tools/lookTools";
import { AriCommandPanel } from "./AriCommandPanel";
import { ariButton as button } from "./styles";

const subscribeEmpty = () => () => {};
const emptySnapshot = () => null;

function receiptText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "Toiminto päättyi";
  if (Reflect.get(result, "ok") === false)
    return `Toiminto ei onnistunut: ${String(Reflect.get(result, "reason") ?? "katso tiedot")}`;
  if (Reflect.get(result, "partial") === true) return "Vain osa muutoksista onnistui";
  switch (Reflect.get(result, "stage")) {
    case "verified":
      return "Muutos tallennettu ja tarkistettu";
    case "saved":
      return "Muutos tallennettu — tarkista kuva";
    case "dispatched":
      return "Muutos lähetetty — tallennus vielä varmistamatta";
    default:
      return "Toiminto valmis";
  }
}

export function AriControlPanel({
  bridge,
  getSnapshot,
  focusMode,
  onToggleFocus,
  commandPanelHost,
  layersHost,
  timelineHost,
}: {
  bridge: AriAgentBridge | null;
  focusMode: boolean;
  onToggleFocus: () => void;
  commandPanelHost?: HTMLElement | null;
  layersHost?: HTMLElement | null;
  timelineHost?: HTMLElement | null;
  getSnapshot: () => StudioLookSnapshot;
}) {
  const [expanded, setExpanded] = useState(true);
  const [time, setTime] = useState("0");
  const pausedTime = usePlayerStore((state) => (state.isPlaying ? null : state.currentTime));
  useEffect(() => {
    if (pausedTime !== null) setTime(String(Math.round(pausedTime * 1000) / 1000));
  }, [pausedTime]);
  const { writeBlockedReason, editHistory, handleUndo, handleRedo } = useStudioShellContext();
  const keyframes = usePlayerStore((state) => state.autoKeyframeEnabled);
  const call = useSyncExternalStore(
    bridge?.subscribe ?? subscribeEmpty,
    bridge?.getSnapshot ?? emptySnapshot,
  );
  const busy = call?.state === "running";
  const look = buildStudioLook(getSnapshot());
  async function run(name: string, args: unknown = {}) {
    await bridge?.call(name, args);
  }

  return (
    <section
      aria-label="Ari-ohjaamo"
      data-testid="ari-control-panel"
      className="shrink-0 border-b border-neutral-600 bg-[#202525] text-neutral-100"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <button
          className={`${button} border-emerald-400 text-emerald-200`}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          Ari-ohjaamo {expanded ? "▴" : "▾"}
        </button>
        <button
          className={`${button} w-48 shrink-0`}
          aria-pressed={focusMode}
          onClick={onToggleFocus}
        >
          {focusMode ? "Näytä työkalupaneelit" : "Kuva isoksi"}
        </button>
        <AriSelection />
        <label className="flex items-center gap-2 text-sm">
          Aika (s)
          <input
            aria-label="Aika sekunteina"
            className="w-20 rounded border border-neutral-500 bg-neutral-900 p-2"
            type="text"
            inputMode="decimal"
            min="0"
            step="0.1"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <button
          className={button}
          disabled={!bridge || busy || !Number.isFinite(ariNumber(time))}
          onClick={() => void run("studio_seek", { time: ariNumber(time) })}
        >
          Siirry
        </button>
        <button
          className={button}
          disabled={!bridge || busy}
          onClick={() => {
            setExpanded(true);
            void run("studio_frame");
          }}
        >
          Tarkista ruutukuva
        </button>
        <button
          className={button}
          aria-pressed={keyframes}
          onClick={() => usePlayerStore.getState().setAutoKeyframeEnabled(!keyframes)}
        >
          Liikkeen tallennus: {keyframes ? "päällä" : "pois"}
        </button>
        <button
          className={button}
          disabled={!editHistory.canUndo || busy || Boolean(writeBlockedReason)}
          onClick={() => void handleUndo()}
        >
          Peru
        </button>
        <button
          className={button}
          disabled={!editHistory.canRedo || busy || Boolean(writeBlockedReason)}
          onClick={() => void handleRedo()}
        >
          Tee uudelleen
        </button>
      </div>
      <AriStatus bridge={bridge} call={call} />
      {bridge &&
        focusMode &&
        layersHost &&
        createPortal(
          <AriLayers bridge={bridge} getSnapshot={getSnapshot} busy={busy} />,
          layersHost,
        )}
      {bridge &&
        focusMode &&
        timelineHost &&
        createPortal(
          <AriTimeline
            bridge={bridge}
            handle={look.ok ? look.selection?.handle : null}
            busy={busy}
          />,
          timelineHost,
        )}
      {expanded &&
        bridge &&
        commandPanelHost &&
        createPortal(
          <AriCommandPanel bridge={bridge} getSnapshot={getSnapshot} time={time} call={call} />,
          commandPanelHost,
        )}
    </section>
  );
}

function AriPlayhead() {
  const time = useAriTime();
  const duration = usePlayerStore((state) => state.duration);
  return (
    <span data-testid="ari-playhead">
      Kuvassa {time.toFixed(2)} / {duration.toFixed(2)} s
    </span>
  );
}

function AriStatus({
  bridge,
  call,
}: {
  bridge: AriAgentBridge | null;
  call: AriCallReceipt | null;
}) {
  const { compositionLoading } = useStudioPlaybackContext();
  const { writeBlockedReason } = useStudioShellContext();
  const edit = useSyncExternalStore(studioEditLifecycle.subscribe, studioEditLifecycle.getSnapshot);
  const busy = call?.state === "running";
  const status = busy
    ? "Toiminto käynnissä…"
    : call
      ? receiptText(call.result)
      : "Valitse kohde kuvasta tai tasoluettelosta";
  return (
    <div role="status" className="flex flex-wrap gap-x-6 px-4 pb-2 text-xs text-neutral-300">
      <AriPlayhead />
      <span>{bridge ? status : "Agenttiyhteys ei ole käytössä"}</span>
      <span>
        {compositionLoading
          ? "Esikatselu latautuu…"
          : "Esikatselu — tarkista lopputulos ruutukuvasta"}
      </span>
      {edit.phase !== "idle" && (
        <span>
          Viimeisin muutos: {edit.target.sourceFile} · {receiptText(edit.receipt)}
        </span>
      )}
      {writeBlockedReason && (
        <strong className="text-amber-300">Tallennus estynyt: {writeBlockedReason}</strong>
      )}
    </div>
  );
}

function AriSelection() {
  const { domEditSelection } = useDomEditSelectionContext();
  return (
    <div className="w-52 shrink-0 truncate text-sm">
      <span className="text-neutral-400">Valittu kohde </span>
      <strong data-testid="ari-target">{domEditSelection?.label ?? "Ei valintaa"}</strong>
      <br />
      <span className="text-xs text-neutral-300">
        {domEditSelection?.sourceFile ?? "Valitse taso tai kohde kuvasta"}
      </span>
    </div>
  );
}
