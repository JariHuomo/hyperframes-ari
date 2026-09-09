import { describe, expect, it } from "vitest";
import { resolveSceneInstances, type SceneInstance, type SceneTimeManifestClip } from "./sceneTime";
import {
  describeDualTime,
  formatPlaybackRate,
  localDurationFromMaster,
  localFromMaster,
  masterDurationFromLocal,
  masterFromLocal,
  motionMasterSpan,
  motionReplaySpan,
} from "./sceneMotion";

/** The sprint's acceptance fixture: a scene hosted at 4 s, rate 1. */
function hostedAt(
  start: number,
  options: { duration?: number; rate?: number; playbackStart?: number } = {},
): SceneInstance {
  const clips: SceneTimeManifestClip[] = [
    {
      id: "title-host",
      label: "Otsikkokortti",
      start,
      duration: options.duration ?? 4,
      compositionId: "title-a",
      compositionSrc: "scenes/title-card.html",
      compositionAncestors: [],
      playbackStart: options.playbackStart ?? 0,
      playbackRate: options.rate ?? 1,
    },
  ];
  const { instances } = resolveSceneInstances({ clips }, "scenes/title-card.html");
  return instances[0]!;
}

describe("sceneMotion", () => {
  it("puts a 1 s motion in a scene hosted at 4 s at master 5 s", () => {
    const instance = hostedAt(4);
    const span = motionMasterSpan(instance, 1, 1);

    expect(span.position).toBe(5);
    expect(span.duration).toBe(1);
    expect(span.clipped).toBe(false);
    expect(span.reason).toBeNull();
  });

  it("stops the replay at localToMaster(end)", () => {
    const instance = hostedAt(4);

    expect(motionReplaySpan(instance, 1, 1)).toEqual({ position: 5, duration: 1 });
  });

  it("converts a master-time drag back to the scene's own clock", () => {
    const instance = hostedAt(4);
    // The sprint's acceptance line: drag 5 -> 5,5 s writes 1,5 s to source.
    expect(localFromMaster(instance, 5.5)).toBeCloseTo(1.5, 10);
    expect(masterFromLocal(instance, 1.5)).toBeCloseTo(5.5, 10);
  });

  it("round-trips either field through the other", () => {
    const instance = hostedAt(1, { playbackStart: 0.5, rate: 1.5, duration: 2 });
    for (const local of [0.5, 0.9, 1.4, 2]) {
      expect(localFromMaster(instance, masterFromLocal(instance, local))).toBeCloseTo(local, 10);
    }
  });

  it("halves a duration on a 1,5x instance and puts it back", () => {
    const instance = hostedAt(5.6, { duration: 1.4, rate: 1.5 });

    expect(masterDurationFromLocal(instance, 0.9)).toBeCloseTo(0.6, 10);
    expect(localDurationFromMaster(instance, 0.6)).toBeCloseTo(0.9, 10);
    // The RajaMarket fixture's second headline: scene 0-0,90 s over master
    // 5,60-6,20 s, i.e. 1,5x faster than the instance at the start.
    const span = motionMasterSpan(instance, 0, 0.9);
    expect(span.position).toBe(5.6);
    expect(span.duration).toBe(0.6);
    expect(span.clipped).toBe(false);
  });

  it("clips a motion that leaves the host window and keeps the refusal reason", () => {
    // Host shows 0-4 s; a motion at 3,5 s lasting 1 s ends outside it.
    const instance = hostedAt(0, { duration: 4 });
    const span = motionMasterSpan(instance, 3.5, 1);

    expect(span.clipped).toBe(true);
    expect(span.reason).toBe("liike ei näy pääajassa (kohtaus loppuu 4,00 s)");
    // Drawn short rather than long: the bar never claims time it does not have.
    expect(span.position).toBe(3.5);
    expect(span.duration).toBe(0.5);
  });

  it("refuses a replay of a motion that never shows in this instance", () => {
    const instance = hostedAt(1, { playbackStart: 0.5, duration: 2 });

    expect(motionReplaySpan(instance, 0.3, 0.2)).toBeNull();
  });

  it("badges only a retimed instance", () => {
    expect(formatPlaybackRate(1.5)).toBe("×1,5");
    expect(formatPlaybackRate(2)).toBe("×2");
    expect(formatPlaybackRate(0.5)).toBe("×0,5");
  });

  it("reads out both clocks with a decimal comma", () => {
    expect(describeDualTime(hostedAt(4), 1)).toBe("Alkaa kohtauksessa 1,00 s · pääajassa 5,00 s");
  });
});
