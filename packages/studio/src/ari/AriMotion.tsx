/** Ari: explicit add versus edit; presets never overwrite existing motion.
 * Sprint S2 adds the nested-scene header: which placement of a shared scene the
 * panel is looking at, and an explicit choice when there is more than one.
 * Sprint S3 adds the second clock: a nested motion is shown and edited in the
 * scene's own time AND in master time, either field deriving the other. */
import { useEffect, useRef, useState } from "react";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import { useStudioShellContext } from "../contexts/StudioContext";
import { usePlayerStore } from "../player/store/playerStore";
import type { AriAgentBridge } from "./agentBridge";
import { formatSceneSeconds } from "../webmcp/tools/animationScene";
import { AriNumber, ariInput, ariNumber } from "./AriNumber";
import { AriEase, AriEasePicker } from "./AriEase";
import { replayMotion } from "./replayMotion";
import {
  formatPlaybackRate,
  localFromMaster,
  masterFromLocal,
  motionReplaySpan,
  roundMotionSeconds,
} from "./sceneMotion";
import type { SceneInstance } from "./sceneTime";
import { useAriScene, type AriScene } from "./useAriScene";
import { ariButton } from "./styles";

export function AriMotion({
  bridge,
  handle,
  busy,
}: {
  bridge: AriAgentBridge;
  handle: string;
  busy: boolean;
}) {
  const { selectedGsapAnimations, gsapMultipleTimelines, gsapUnsupportedTimelinePattern } =
    useDomEditSelectionContext();
  const { setActiveCompPath } = useStudioShellContext();
  const scene = useAriScene();
  // Only the master view shows two clocks. Inside an opened scene the selection
  // is no longer nested, so this is null and the form is local-time only.
  const instance = scene.instance;
  const instanceKey = instance?.hostId ?? "root";
  return (
    <section className="mb-4 space-y-2" aria-label="Liike">
      {gsapMultipleTimelines || gsapUnsupportedTimelinePattern ? (
        <p>Tämän aikajanan liikettä ei voi muokata perussäätimillä.</p>
      ) : (
        <>
          {selectedGsapAnimations.map((animation, index) => (
            <MotionForm
              key={`${handle}:${instanceKey}:${animation.id}:${animation.position}:${animation.duration}:${motionEase(animation)}`}
              bridge={bridge}
              handle={handle}
              busy={busy}
              animation={animation}
              index={index}
              instance={instance}
            />
          ))}
          <details>
            <summary className="min-h-10 cursor-pointer py-2 text-sm">Lisää uusi liike</summary>
            <MotionForm
              key={`${handle}:${instanceKey}`}
              bridge={bridge}
              handle={handle}
              busy={busy}
              instance={instance}
            />
          </details>
        </>
      )}
      {scene.nested && (
        <details>
          <summary className="cursor-pointer text-xs">Esiintymän valinta ja ajoitus</summary>
          <SceneInstancePanel
            scene={scene}
            onOpenScene={() => setActiveCompPath(scene.sourceFile)}
          />
        </details>
      )}
    </section>
  );
}
/**
 * S2: a nested selection names a scene FILE, and one file can play in several
 * places. This shows where those placements are in master time, keeps the shared
 * source warning honest ("muutos koskee kaikkia N esiintymää"), and refuses to
 * default when there is more than one — the choice is the human's, and it lives
 * in panel state that no tool reads on its own.
 */
function SceneInstancePanel({ scene, onOpenScene }: { scene: AriScene; onOpenScene: () => void }) {
  const { instances, instance: active, index } = scene;
  return (
    <div className="space-y-2 rounded border border-amber-700 p-3 text-sm">
      {active ? (
        <p>
          Kohtaus {scene.sourceFile} · esiintymä {index}/{instances.length} · koko videossa{" "}
          {formatSceneSeconds(active.visibleStart)}–{formatSceneSeconds(active.visibleEnd)} s
          {active.playbackRate !== 1 ? ` · ${formatPlaybackRate(active.playbackRate)}` : ""}
        </p>
      ) : instances.length > 1 ? (
        <p>
          Kohtaus {scene.sourceFile} · {instances.length} esiintymää · valitse mitä säädät.
        </p>
      ) : (
        <p>Avaa kohtaus säätääksesi sen paikallista aikaa.</p>
      )}
      {instances.length > 1 && (
        <label className="block text-xs">
          Esiintymä
          <select
            aria-label="Esiintymä"
            className={ariInput}
            value={scene.selectedId ?? ""}
            onChange={(event) => scene.choose(event.target.value || null)}
          >
            <option value="">Valitse esiintymä…</option>
            {instances.map((one) => (
              <option key={one.hostId} value={one.hostId}>
                {one.hostLabel} · {formatSceneSeconds(one.visibleStart)}–
                {formatSceneSeconds(one.visibleEnd)} s
              </option>
            ))}
          </select>
        </label>
      )}
      {instances.length > 1 && <p>Muutos koskee kaikkia {instances.length} esiintymää.</p>}
      {scene.unsupported.length > 0 && (
        <p>
          {scene.unsupported.length} esiintymää ei voi muuntaa pääaikaan:{" "}
          {scene.unsupported[0]!.detail}.
        </p>
      )}
      <button className={ariButton} onClick={onOpenScene}>
        Avaa kohtaus
      </button>
    </div>
  );
}

/** A keyframe animation's feel is authored in `keyframes.easeEach`; a plain
 * tween's in `ease`. `AnimationCard` makes the same choice — reading or writing
 * the other key on a keyframe tween changes nothing visible. */
function motionEaseKey(animation?: GsapAnimation): "ease" | "easeEach" {
  return animation?.keyframes ? "easeEach" : "ease";
}

function motionEase(animation?: GsapAnimation): string | undefined {
  return animation?.keyframes ? animation.keyframes.easeEach : animation?.ease;
}

function MotionForm({
  bridge,
  handle,
  busy,
  animation,
  index = 0,
  instance = null,
}: {
  bridge: AriAgentBridge;
  handle: string;
  busy: boolean;
  animation?: GsapAnimation;
  index?: number;
  instance?: SceneInstance | null;
}) {
  // A parsed position can be a relative label ("<0.5"); only a number has a
  // master-time twin, which is exactly the `supported` case below.
  const initial = initialMotionTimes(animation, instance);
  const [position, setPosition] = useState(initial.local);
  const [master, setMaster] = useState(initial.master);
  const [duration, setDuration] = useState(initial.duration);
  const [ease, setEase] = useState(initial.ease);
  const [preset, setPreset] = useState("fade");
  const [error, setError] = useState("");
  const stopPreview = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPreview.current?.(), []);
  function editLocal(value: string) {
    setPosition(value);
    const local = ariNumber(value);
    if (instance && Number.isFinite(local)) {
      setMaster(String(roundMotionSeconds(masterFromLocal(instance, local))));
    }
  }
  function editMaster(value: string) {
    setMaster(value);
    const point = ariNumber(value);
    if (instance && Number.isFinite(point)) {
      setPosition(String(roundMotionSeconds(localFromMaster(instance, point))));
    }
  }
  function previewMotion() {
    stopPreview.current?.();
    const span = animationReplaySpan(animation, instance);
    if (!span) {
      setError("Liike ei näy tässä esiintymässä.");
      return;
    }
    stopPreview.current = replayMotion(span);
  }
  const supported = !animation || typeof animation.position === "number";
  // The curve panel replays the same span, so it needs it in the same clock the
  // player understands: master time for a nested motion.
  const replaySpan = animationReplaySpan(animation, instance);
  async function save() {
    const p = ariNumber(position),
      d = ariNumber(duration);
    // A nested motion's bounds belong to the scene, not the master composition:
    // the tool re-checks them against the host window (S5) and refuses in
    // Finnish, so the client only screens out plainly unusable numbers.
    if (!validMotionNumbers(p, d, instance)) {
      setError("Anna alku ja kesto videon sisältä.");
      return;
    }
    setError("");
    // Success is the receipt, never a timer: the call resolves only once the
    // write has been read back from source.
    const result = await bridge.call(
      animation ? "studio_update_animation" : "studio_add_animation",
      motionRequest({ handle, animation, instance, position: p, duration: d, preset, ease }),
    );
    if (typeof result === "object" && result !== null && Reflect.get(result, "ok") === false)
      setError(String(Reflect.get(result, "reason")));
  }
  return (
    <form
      className="space-y-2 rounded border border-neutral-600 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <MotionKind animation={animation} index={index} preset={preset} setPreset={setPreset} />
      {!supported ? (
        <p className="text-xs">Mukautettu ajoitus: avaa tarkat työkalut.</p>
      ) : (
        <>
          <MotionTimingFields
            prefix={animation ? `Liike ${index + 1}` : "Uusi liike"}
            instance={instance}
            position={position}
            master={master}
            duration={duration}
            editLocal={editLocal}
            editMaster={editMaster}
            setDuration={setDuration}
          />
          <AriEasePicker
            label={animation ? `Liike ${index + 1} tuntuma` : "Uuden liikkeen tuntuma"}
            value={ease}
            onChange={setEase}
            disabled={busy}
          />
          <button className={`${ariButton} bg-emerald-900`} disabled={busy}>
            {animation ? `Tallenna liike ${index + 1}` : "Lisää liike"}
          </button>
        </>
      )}
      <MotionExtras
        animation={animation}
        supported={supported}
        bridge={bridge}
        handle={handle}
        busy={busy}
        instance={instance}
        index={index}
        replaySpan={replaySpan}
        previewMotion={previewMotion}
      />
      {error && (
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
      )}
    </form>
  );
}

function MotionTimingFields({
  prefix,
  instance,
  position,
  master,
  duration,
  editLocal,
  editMaster,
  setDuration,
}: {
  prefix: string;
  instance: SceneInstance | null;
  position: string;
  master: string;
  duration: string;
  editLocal: (value: string) => void;
  editMaster: (value: string) => void;
  setDuration: (value: string) => void;
}) {
  return (
    <>
      {" "}
      <div className="grid grid-cols-2 gap-2">
        <AriNumber label={`${prefix} · Kohtauksessa (s)`} value={position} onChange={editLocal} />
        {instance && (
          <AriNumber label={`${prefix} · Koko videossa (s)`} value={master} onChange={editMaster} />
        )}
        <AriNumber label={`${prefix} kesto (s)`} value={duration} onChange={setDuration} />
      </div>
    </>
  );
}

function animationReplaySpan(animation: GsapAnimation | undefined, instance: SceneInstance | null) {
  if (!animation || typeof animation.position !== "number") return null;
  const local = { position: animation.position, duration: animation.duration ?? 0 };
  return instance ? motionReplaySpan(instance, local.position, local.duration) : local;
}

function MotionExtras({
  animation,
  supported,
  bridge,
  handle,
  busy,
  instance,
  index,
  replaySpan,
  previewMotion,
}: {
  animation?: GsapAnimation;
  supported: boolean;
  bridge: AriAgentBridge;
  handle: string;
  busy: boolean;
  instance: SceneInstance | null;
  index: number;
  replaySpan: { position: number; duration: number } | null;
  previewMotion: () => void;
}) {
  if (!animation) return null;
  return (
    <>
      {" "}
      {supported && (
        <details>
          <summary className="cursor-pointer py-2 text-sm">Tarkat käyräsäädöt</summary>
          <AriEase
            bridge={bridge}
            handle={handle}
            animationId={animation.id}
            instance={instance?.hostId}
            ease={motionEase(animation) ?? "power2.out"}
            busy={busy}
            index={index}
            position={replaySpan?.position}
            duration={replaySpan?.duration}
          />
        </details>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={ariButton}
          disabled={busy || !supported}
          onClick={previewMotion}
        >
          Toista liike {index + 1}
        </button>
        <button
          type="button"
          className={ariButton}
          disabled={busy}
          onClick={() =>
            void bridge.call("studio_delete_animation", { handle, animationId: animation.id })
          }
        >
          Poista liike {index + 1}
        </button>
      </div>
    </>
  );
}

function validMotionNumbers(position: number, duration: number, instance: SceneInstance | null) {
  if (![position, duration].every(Number.isFinite)) return false;
  if (position < 0 || duration <= 0) return false;
  return Boolean(instance) || position + duration <= usePlayerStore.getState().duration;
}
function motionRequest({
  handle,
  animation,
  instance,
  position,
  duration,
  preset,
  ease,
}: {
  handle: string;
  animation?: GsapAnimation;
  instance: SceneInstance | null;
  position: number;
  duration: number;
  preset: string;
  ease: string;
}) {
  return {
    handle,
    position,
    duration,
    ...(animation ? { animationId: animation.id } : { method: "from", preset }),
    ...(instance ? { instance: instance.hostId, timeBasis: "scene" as const } : {}),
    [motionEaseKey(animation)]: ease,
  };
}

function initialMotionTimes(animation: GsapAnimation | undefined, instance: SceneInstance | null) {
  const value = animation?.position ?? usePlayerStore.getState().currentTime;
  const local = String(value);
  const defaults = {
    duration: String(animation?.duration ?? 0.45),
    ease: motionEase(animation) ?? "power2.out",
  };
  if (!instance || typeof value !== "number") return { ...defaults, local, master: local };
  return {
    ...defaults,
    local,
    master: String(roundMotionSeconds(masterFromLocal(instance, value))),
  };
}
function MotionKind({
  animation,
  index,
  preset,
  setPreset,
}: {
  animation?: GsapAnimation;
  index: number;
  preset: string;
  setPreset: (value: string) => void;
}) {
  return animation ? (
    <p className="text-sm">
      Liike {index + 1} {animation.hasOwnProperty("keyframes") ? "· avainruudut" : ""}
    </p>
  ) : (
    <label className="block text-xs">
      Liikevalinta
      <select
        aria-label="Liikevalinta"
        className={ariInput}
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
      >
        <option value="fade">Häivytys</option>
        <option value="slide">Liu’u sisään alhaalta</option>
        <option value="grow">Kasva paikalleen</option>
      </select>
    </label>
  );
}
