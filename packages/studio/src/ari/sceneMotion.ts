/**
 * Ari · one motion, seen in two clocks (sprint S3).
 *
 * A motion inside a nested scene is authored in the scene's own clock — that is
 * what `deps.addAnimation` writes into the scene file — but the human and the
 * agent are looking at the master timeline. S3's job is to show the same motion
 * in both places without ever letting the two drift.
 *
 * There are deliberately TWO pairs of conversions here, and they are not
 * interchangeable:
 *
 * - `masterToLocal` / `localToMaster` (in `sceneTime.ts`) reproduce the runtime
 *   exactly: they clamp to the scene's duration and REFUSE (null) outside the
 *   host's visible window. Those are the truth for "where does this actually
 *   play" — the timeline bar and every validation use them.
 * - `masterFromLocal` / `localFromMaster` below are the same affine map without
 *   the clamp. A form field needs them: while a human is typing 6,2 s into a
 *   scene that ends at 6,0 s the field must still show the master time that
 *   number WOULD mean, so the refusal can name it. They are exact inverses of
 *   each other, so a value round-trips through the two fields unchanged.
 *
 * Nothing here touches the DOM, React or the bridge, so every number the panel
 * and the timeline show is reproducible in a unit test.
 */

import { localToMaster, type SceneInstance } from "./sceneTime";
import { formatSceneSeconds, validateSceneFit } from "../webmcp/tools/animationScene";

/** Master seconds for a scene-local time, unclamped. Inverse of `localFromMaster`. */
export function masterFromLocal(instance: SceneInstance, localSeconds: number): number {
  const rate = instance.playbackRate > 0 ? instance.playbackRate : 1;
  return instance.start + (localSeconds - instance.playbackStart) / rate;
}

/** Scene-local seconds for a master time, unclamped. Inverse of `masterFromLocal`. */
export function localFromMaster(instance: SceneInstance, masterSeconds: number): number {
  const rate = instance.playbackRate > 0 ? instance.playbackRate : 1;
  return instance.playbackStart + (masterSeconds - instance.start) * rate;
}

/** A scene-local length in master seconds: a 1,5× instance plays it faster. */
export function masterDurationFromLocal(instance: SceneInstance, localDuration: number): number {
  const rate = instance.playbackRate > 0 ? instance.playbackRate : 1;
  return Math.max(0, localDuration) / rate;
}

/** A master length back in the scene's own clock. */
export function localDurationFromMaster(instance: SceneInstance, masterDuration: number): number {
  const rate = instance.playbackRate > 0 ? instance.playbackRate : 1;
  return Math.max(0, masterDuration) * rate;
}

/** Kill float noise before a number is written or printed. */
export function roundMotionSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface MotionMasterSpan {
  /** First master second the motion is on screen. */
  position: number;
  /** How long it is on screen in master seconds. */
  duration: number;
  /** True when part of the authored motion never reaches the master timeline. */
  clipped: boolean;
  /** The S5 refusal, in Finnish, when clipped. Shown, never swallowed. */
  reason: string | null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/**
 * Where one scene-local motion sits on the master rail.
 *
 * The drawn span is clamped to the instance's visible window, because a bar
 * outside it would claim screen time the motion does not have. When the clamp
 * actually bit, `reason` carries the same Finnish sentence `studio_add_animation`
 * would refuse with (S5), so the timeline can say WHY the bar is short instead
 * of quietly drawing a wrong one.
 */
export function motionMasterSpan(
  instance: SceneInstance,
  localPosition: number,
  localDuration: number,
): MotionMasterSpan {
  const rawStart = masterFromLocal(instance, localPosition);
  const rawEnd = rawStart + masterDurationFromLocal(instance, localDuration);
  const start = clamp(rawStart, instance.visibleStart, instance.visibleEnd);
  const end = clamp(rawEnd, start, instance.visibleEnd);
  const fit = validateSceneFit(instance, localPosition, localDuration);
  return {
    position: roundMotionSeconds(start),
    duration: roundMotionSeconds(end - start),
    clipped: fit !== null,
    reason: fit?.reason ?? null,
  };
}

/**
 * The master span "Toista liike" should play: start and end taken through the
 * runtime-faithful `localToMaster`, falling back to the visible window when an
 * end is authored past it. Null when the motion never shows in this instance.
 */
export function motionReplaySpan(
  instance: SceneInstance,
  localPosition: number,
  localDuration: number,
): { position: number; duration: number } | null {
  const start = localToMaster(instance, localPosition);
  if (start === null) return null;
  const end = localToMaster(instance, localPosition + Math.max(0, localDuration));
  const stop = end ?? instance.visibleEnd;
  return {
    position: roundMotionSeconds(start),
    duration: roundMotionSeconds(Math.max(0, stop - start)),
  };
}

/** `×1,5` for a retimed instance; nothing to say when the rate is 1. */
export function formatPlaybackRate(rate: number): string {
  const rounded = roundMotionSeconds(rate);
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  return `×${text}`;
}

/** "Alkaa kohtauksessa 1,00 s · pääajassa 5,00 s" — the S3 dual readout. */
export function describeDualTime(instance: SceneInstance, localPosition: number): string {
  return `Alkaa kohtauksessa ${formatSceneSeconds(localPosition)} s · pääajassa ${formatSceneSeconds(
    masterFromLocal(instance, localPosition),
  )} s`;
}
