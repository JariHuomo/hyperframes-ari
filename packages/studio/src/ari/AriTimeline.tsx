/** Ari: a small view of the existing player clock, not a second timeline engine.
 *
 * Sprint S3: the rail is always MASTER time. A nested selection's motion bars
 * are drawn through the scene transform (`AriMotionBar`) instead of being
 * hidden, so a scene can be retimed without opening it — but only when the
 * placement is unambiguous or chosen. With several placements and no choice the
 * bars stay hidden, because drawing the first one would be a guess. */
import { useAriTime } from "./useAriTime";
import { usePlayerStore } from "../player";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import { AriMotionBar } from "./AriMotionBar";
import { useAriScene } from "./useAriScene";
import type { AriAgentBridge } from "./agentBridge";
import { ariButton } from "./styles";
export function AriTimeline({
  bridge,
  handle,
  busy,
}: {
  bridge: AriAgentBridge;
  handle?: string | null;
  busy: boolean;
}) {
  const time = useAriTime(),
    duration = usePlayerStore((s) => s.duration),
    playing = usePlayerStore((s) => s.isPlaying);
  const { selectedGsapAnimations, domEditSelection } = useDomEditSelectionContext();
  const scene = useAriScene();
  // A root selection draws straight through; a nested one needs a placement.
  const drawable = !scene.nested || scene.instance !== null;
  const seek = (t: number) =>
    void bridge.call("studio_seek", {
      time: Math.max(0, Math.min(Math.max(0, duration - 1 / 30), t)),
    });
  return (
    <section
      aria-label="Kevyt aikajana"
      className="shrink-0 border-t border-neutral-600 bg-[#202525] px-4 py-2 text-neutral-100"
    >
      <div className="flex items-center gap-2">
        <button
          className={ariButton}
          disabled={busy}
          onClick={() => usePlayerStore.getState().requestPlayback(!playing)}
        >
          {playing ? "Pysäytä" : "Toista"}
        </button>
        <button
          className={ariButton}
          aria-label="Edellinen ruutu"
          disabled={busy}
          onClick={() => seek(time - 1 / 30)}
        >
          −1 ruutu
        </button>
        <button
          className={ariButton}
          aria-label="Seuraava ruutu"
          disabled={busy}
          onClick={() => seek(time + 1 / 30)}
        >
          +1 ruutu
        </button>
        <span className="w-32 text-xs tabular-nums">
          {time.toFixed(2).replace(".", ",")} / {duration.toFixed(2).replace(".", ",")} s
        </span>
        <span className="truncate text-xs">{domEditSelection?.label || "Valitse kohde"}</span>
      </div>
      <input
        aria-label="Toistokohta"
        type="range"
        min={0}
        max={Math.max(0, duration - 1 / 30) || 1}
        step={1 / 30}
        value={time}
        disabled={busy}
        onChange={(e) => seek(Number(e.target.value))}
        className="block h-8 w-full accent-emerald-400"
      />
      <div className="max-h-24 space-y-1 overflow-auto">
        {handle &&
          drawable &&
          selectedGsapAnimations.map((animation, index) => (
            <AriMotionBar
              key={`${handle}:${animation.id}:${animation.position}:${animation.duration}`}
              animation={animation}
              index={index}
              duration={duration}
              handle={handle}
              bridge={bridge}
              busy={busy}
              instance={scene.instance}
            />
          ))}
        {handle && scene.nested && !scene.instance && (
          <p className="text-xs text-neutral-300">Valitse esiintymä, niin liike näkyy pääajassa.</p>
        )}
      </div>
    </section>
  );
}
