import { useState, useSyncExternalStore } from "react";
import { usePlayerStore } from "../player";
import { useStudioShellContext, useStudioPlaybackContext } from "../contexts/StudioContext";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import { studioEditLifecycle } from "../webmcp/writeCoordinator";
import { type StudioLookSnapshot } from "../webmcp/tools/lookTools";
import type { AriAgentBridge, AriCallReceipt } from "./agentBridge";
import { AriCommandPanel } from "./AriCommandPanel";
import { ariButton as button } from "./styles";

const subscribeEmpty = () => () => {};
const emptySnapshot = () => null;

function receiptText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "Toiminto päättyi";
  if (Reflect.get(result, "ok") === false) return "Toiminto ei onnistunut — katso tiedot";
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
}: {
  bridge: AriAgentBridge | null;
  focusMode: boolean;
  onToggleFocus: () => void;
  getSnapshot: () => StudioLookSnapshot;
}) {
  const [expanded, setExpanded] = useState(false);
  const [time, setTime] = useState("0");
  const { writeBlockedReason, editHistory, handleUndo, handleRedo } = useStudioShellContext();
  const keyframes = usePlayerStore((state) => state.autoKeyframeEnabled);
  const call = useSyncExternalStore(
    bridge?.subscribe ?? subscribeEmpty,
    bridge?.getSnapshot ?? emptySnapshot,
  );
  const busy = call?.state === "running";
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
        <button className={button} aria-pressed={focusMode} onClick={onToggleFocus}>
          {focusMode ? "Näytä työkalupaneelit" : "Kuva isoksi"}
        </button>
        <AriSelection />
        <label className="flex items-center gap-2 text-sm">
          Aika (s)
          <input
            aria-label="Aika sekunteina"
            className="w-20 rounded border border-neutral-500 bg-neutral-900 p-2"
            type="number"
            min="0"
            step="0.1"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <button
          className={button}
          disabled={!bridge || busy || time.trim() === ""}
          onClick={() => void run("studio_seek", { time: Number(time) })}
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
      {expanded && bridge && (
        <AriCommandPanel bridge={bridge} getSnapshot={getSnapshot} time={time} call={call} />
      )}
    </section>
  );
}

function AriPlayhead() {
  const time = usePlayerStore((state) => state.currentTime);
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
  const selectedId = usePlayerStore((state) => state.selectedElementId);
  const timelineLabel = usePlayerStore(
    (state) => state.elements.find((e) => e.id === selectedId)?.label,
  );
  return (
    <div className="min-w-36 max-w-72 text-sm">
      <span className="text-neutral-400">Kuvavalinta </span>
      <strong data-testid="ari-target">{domEditSelection?.label ?? "Ei valintaa"}</strong>
      <br />
      <span className="text-xs text-neutral-300">
        Aikajanan kohde: {timelineLabel ?? "Ei valintaa"}
      </span>
    </div>
  );
}
