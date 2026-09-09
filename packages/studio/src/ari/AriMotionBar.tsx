/**
 * Ari: one motion drawn on the MASTER rail (sprint S3).
 *
 * Before this sprint the timeline simply hid the bars of a nested selection,
 * because a scene-local 1,00 s drawn on a master rail would have pointed at the
 * wrong second. It now draws them through the scene transform instead: a 1 s
 * motion in a scene hosted at 4 s sits at 5 s, and a drag converts back to the
 * scene's own clock BEFORE the write, because the source file it lands in only
 * knows local time.
 *
 * Two things this file refuses to do quietly:
 *
 * - A retimed instance is labelled. `×1,5` beside the bar is why 0,60 s of
 *   master time holds a 0,90 s motion; without it the numbers look wrong.
 * - A motion that does not fit the host's visible window is drawn CLIPPED, with
 *   the S5 refusal sentence on its title and aria-label. Drawing the full bar
 *   would claim screen time the motion does not have; drawing nothing would
 *   hide an authoring mistake.
 */

import { useRef, useState } from "react";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { MiniCurveSvg } from "../components/editor/easeCurveSvg";
import type { AriAgentBridge } from "./agentBridge";
import {
  formatPlaybackRate,
  localDurationFromMaster,
  localFromMaster,
  motionMasterSpan,
  roundMotionSeconds,
} from "./sceneMotion";
import type { SceneInstance } from "./sceneTime";

export function AriMotionBar({
  animation,
  index,
  duration,
  handle,
  bridge,
  busy,
  instance = null,
}: {
  animation: GsapAnimation;
  index: number;
  /** The master composition's length: the rail's full width. */
  duration: number;
  handle: string;
  bridge: Pick<AriAgentBridge, "call">;
  busy: boolean;
  /** The resolved scene placement, or null for a motion in the open composition. */
  instance?: SceneInstance | null;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    position: number;
    length: number;
    width: number;
    resize: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<{ position: number; length: number } | null>(null);
  const view = motionBarView(animation, instance, draft, duration, index);
  if (!view) return null;
  const { span, masterPosition, masterLength, p, d, ease, rate, label, title } = view;

  function commit(nextPosition: number, nextLength: number) {
    // The write goes into the scene's own file, so master time is converted
    // back here — never sent as-is. `timeBasis: "scene"` says so explicitly.
    const scene = instance
      ? {
          position: roundMotionSeconds(localFromMaster(instance, nextPosition)),
          duration: roundMotionSeconds(localDurationFromMaster(instance, nextLength)),
          instance: instance.hostId,
          timeBasis: "scene" as const,
        }
      : { position: roundMotionSeconds(nextPosition), duration: roundMotionSeconds(nextLength) };
    void bridge.call("studio_update_animation", { handle, animationId: animation.id, ...scene });
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <span
        className="shrink-0"
        aria-label={`Liike ${index + 1} käyrä ${ease}`}
        title={`Käyrä: ${ease}`}
      >
        <MiniCurveSvg ease={ease} active={false} size={18} />
      </span>
      <span className={`shrink-0 tabular-nums ${instance ? "w-64" : "w-40"}`}>
        {label}
        {rate && (
          <span
            className="ml-1 rounded bg-amber-900 px-1 text-amber-100"
            aria-label={`Liike ${index + 1} toistonopeus ${rate}`}
          >
            {rate}
          </span>
        )}
      </span>
      <div ref={rail} className="relative h-6 flex-1 rounded bg-neutral-800">
        <div
          role="group"
          aria-label={span?.reason ? `${label} · ${span.reason}` : `Liike ${index + 1} aikajanalla`}
          title={title}
          style={{
            left: `${(p / duration) * 100}%`,
            width: `${Math.max(0.5, (d / duration) * 100)}%`,
          }}
          className={`absolute top-0 h-6 min-w-3 touch-none rounded ${
            span?.clipped ? "bg-emerald-700 ring-2 ring-amber-400" : "bg-emerald-700"
          }`}
          onPointerDown={(e) => {
            if (busy) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              position: masterPosition,
              length: masterLength,
              width: rail.current?.clientWidth || 1,
              resize: e.target instanceof HTMLElement && e.target.dataset.resize === "true",
            };
          }}
          onPointerMove={(e) => {
            const a = drag.current;
            if (!a) return;
            const delta = ((e.clientX - a.x) / a.width) * duration;
            setDraft({
              position: a.resize
                ? a.position
                : Math.max(0, Math.min(duration - a.length, a.position + delta)),
              length: a.resize
                ? Math.max(1 / 30, Math.min(duration - a.position, a.length + delta))
                : a.length,
            });
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDraft(null);
          }}
          onPointerUp={(e) => {
            const a = drag.current;
            drag.current = null;
            if (!a) return;
            e.currentTarget.releasePointerCapture(e.pointerId);
            const delta = ((e.clientX - a.x) / a.width) * duration;
            const nextPosition = a.resize
              ? a.position
              : Math.max(0, Math.min(duration - a.length, a.position + delta));
            const nextLength = a.resize
              ? Math.max(1 / 30, Math.min(duration - a.position, a.length + delta))
              : a.length;
            setDraft(null);
            if (Math.abs(delta) > 0.002) commit(nextPosition, nextLength);
          }}
        >
          <span className="pointer-events-none px-1">↔</span>
          <span
            data-resize="true"
            aria-label={`Liike ${index + 1} keston kahva`}
            className="absolute right-0 top-0 h-6 w-3 cursor-ew-resize rounded-r border-l border-emerald-200 bg-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}

function motionBarView(
  animation: GsapAnimation,
  instance: SceneInstance | null,
  draft: { position: number; length: number } | null,
  duration: number,
  index: number,
) {
  const position = typeof animation.position === "number" ? animation.position : null;
  const length = animation.duration ?? 0;
  if (position === null || duration <= 0) return null;

  // Everything below the conversion is master time — including the drag maths,
  // so a pixel always means the same second whatever the instance's rate is.
  const span = instance ? motionMasterSpan(instance, position, length) : null;
  const { masterPosition, masterLength, p, d } = barGeometry(span, position, length, draft);
  // The bar carries the curve's glyph as well as its span: an agent scanning
  // the timeline should see WHICH feel a motion has without opening its form.
  const { ease, rate, label, title } = motionBarLabels(
    animation,
    instance,
    span?.reason,
    position,
    length,
    p,
    d,
    index,
  );

  return { span, masterPosition, masterLength, p, d, ease, rate, label, title };
}

function motionBarLabels(
  animation: GsapAnimation,
  instance: SceneInstance | null,
  reason: string | null | undefined,
  position: number,
  length: number,
  p: number,
  d: number,
  index: number,
) {
  const ease = animation.keyframes?.easeEach ?? animation.ease ?? "none";
  const rate =
    instance && instance.playbackRate !== 1 ? formatPlaybackRate(instance.playbackRate) : null;
  const label = instance
    ? `Liike ${index + 1} · kohtaus ${position.toFixed(2)}–${(position + length).toFixed(2)} s · pääaika ${p.toFixed(2)}–${(p + d).toFixed(2)} s`
    : `Liike ${index + 1} · ${p.toFixed(2)}–${(p + d).toFixed(2)} s`;
  const title = reason ? `Ei mahdu näkyviin: ${reason}` : `Käyrä: ${ease}`;

  return { ease, rate, label, title };
}

function barGeometry(
  span: ReturnType<typeof motionMasterSpan> | null,
  position: number,
  length: number,
  draft: { position: number; length: number } | null,
) {
  const masterPosition = span ? span.position : position;
  const masterLength = span ? span.duration : length;
  return {
    masterPosition,
    masterLength,
    p: draft?.position ?? masterPosition,
    d: draft?.length ?? masterLength,
  };
}
