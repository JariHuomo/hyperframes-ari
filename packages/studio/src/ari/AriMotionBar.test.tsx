// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { AriMotionBar } from "./AriMotionBar";
import { resolveSceneInstances, type SceneInstance, type SceneTimeManifestClip } from "./sceneTime";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

const MASTER_DURATION = 12;

function hosted(start: number, duration: number, rate = 1): SceneInstance {
  const clips: SceneTimeManifestClip[] = [
    {
      id: "title-host",
      label: "Otsikkokortti",
      start,
      duration,
      compositionId: "title-a",
      compositionSrc: "scenes/title-card.html",
      compositionAncestors: [],
      playbackStart: 0,
      playbackRate: rate,
    },
  ];
  return resolveSceneInstances({ clips }, "scenes/title-card.html").instances[0]!;
}

const tween = (position: number, duration: number): GsapAnimation =>
  ({
    id: "a1",
    method: "from",
    position,
    duration,
    ease: "power2.out",
  }) as unknown as GsapAnimation;

function render(animation: GsapAnimation, instance: SceneInstance | null) {
  const call = vi.fn(async () => ({ ok: true, stage: "verified" }) as unknown);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <AriMotionBar
        animation={animation}
        index={0}
        duration={MASTER_DURATION}
        handle="index.html#hero"
        bridge={{ call }}
        busy={false}
        instance={instance}
      />,
    );
  });
  return { host, root, call };
}

/** One pixel of the (zero-width, so `|| 1`) rail is the whole composition. */
function dragBy(host: HTMLElement, seconds: number) {
  const bar = host.querySelector<HTMLElement>('[role="group"]')!;
  bar.setPointerCapture = vi.fn();
  bar.releasePointerCapture = vi.fn();
  const to = seconds / MASTER_DURATION;
  act(() => {
    bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 0 }));
  });
  act(() => {
    bar.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: to }));
  });
}

describe("AriMotionBar", () => {
  it("draws a nested motion at its master time and writes back scene time", () => {
    // Scene hosted at 4 s; a 1 s motion at local 1 s is master 5 s (acceptance).
    const { host, root, call } = render(tween(1, 1), hosted(4, 4));

    expect(host.textContent).toContain("kohtaus 1.00–2.00 s");
    expect(host.textContent).toContain("pääaika 5.00–6.00 s");

    // Drag 5 -> 5,5 s must write 1,5 s into the scene file, not 5,5.
    dragBy(host, 0.5);

    expect(call).toHaveBeenCalledTimes(1);
    const [tool, input] = call.mock.calls[0] as unknown as [
      string,
      { position: number; duration: number; instance: string; timeBasis: string },
    ];
    expect(tool).toBe("studio_update_animation");
    expect(input.position).toBeCloseTo(1.5, 6);
    expect(input.duration).toBeCloseTo(1, 6);
    expect(input.instance).toBe("title-host");
    expect(input.timeBasis).toBe("scene");
    act(() => root.unmount());
  });

  it("badges a retimed instance and converts its duration", () => {
    // The RajaMarket fixture's second headline: hosted 5,6 s at 1,5x.
    const { host, root, call } = render(tween(0, 0.9), hosted(5.6, 1.4, 1.5));

    expect(host.querySelector('[aria-label="Liike 1 toistonopeus ×1,5"]')?.textContent).toBe(
      "×1,5",
    );
    expect(host.textContent).toContain("pääaika 5.60–6.20 s");

    dragBy(host, 0.3);

    const [, input] = call.mock.calls[0] as unknown as [
      string,
      { position: number; duration: number },
    ];
    // 0,3 s of master time is 0,45 s of this scene's own clock.
    expect(input.position).toBeCloseTo(0.45, 6);
    expect(input.duration).toBeCloseTo(0.9, 6);
    act(() => root.unmount());
  });

  it("has no rate badge when the instance plays at 1x", () => {
    const { host, root } = render(tween(1, 1), hosted(4, 4));

    expect(host.querySelector('[aria-label^="Liike 1 toistonopeus"]')).toBeNull();
    act(() => root.unmount());
  });

  it("draws a motion that leaves the host window clipped, with the reason visible", () => {
    // Host shows 0-4 s; the motion is authored 3,5-4,5 s in scene time.
    const { host, root } = render(tween(3.5, 1), hosted(0, 4));
    const bar = host.querySelector<HTMLElement>('[role="group"]')!;

    expect(bar.getAttribute("title")).toBe(
      "Ei mahdu näkyviin: liike ei näy pääajassa (kohtaus loppuu 4,00 s)",
    );
    expect(bar.getAttribute("aria-label")).toContain("liike ei näy pääajassa");
    // Clipped to the window rather than drawn past it.
    expect(bar.style.width).toBe(`${(0.5 / MASTER_DURATION) * 100}%`);
    act(() => root.unmount());
  });

  it("leaves a root-composition motion in master time untouched", () => {
    const { host, root, call } = render(tween(2, 1), null);

    expect(host.textContent).toContain("Liike 1 · 2.00–3.00 s");
    dragBy(host, 0.5);

    const [, input] = call.mock.calls[0] as unknown as [
      string,
      { position: number; instance?: string; timeBasis?: string },
    ];
    expect(input.position).toBeCloseTo(2.5, 6);
    expect(input.instance).toBeUndefined();
    expect(input.timeBasis).toBeUndefined();
    act(() => root.unmount());
  });
});
