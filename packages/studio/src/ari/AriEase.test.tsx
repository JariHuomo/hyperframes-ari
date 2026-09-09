// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AriEase } from "./AriEase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

const okReceipt = { ok: true, stage: "verified", animationId: "a1" };

function render(ease = "power2.out", call = vi.fn(async () => okReceipt as unknown)) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <AriEase
        bridge={{ call }}
        handle="index.html#hero"
        animationId="a1"
        ease={ease}
        busy={false}
        position={2}
        duration={0.8}
      />,
    );
  });
  return { host, root, call };
}

function dragHandle(host: HTMLElement, finish: "pointerup" | "pointercancel") {
  const graph = host.querySelector<SVGSVGElement>('svg[viewBox="0 0 216 288"]')!;
  const handle = graph.querySelector<SVGCircleElement>(".cursor-grab")!;
  handle.setPointerCapture = vi.fn();
  act(() => {
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 46, clientY: 52 }),
    );
  });
  act(() => {
    graph.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 108, clientY: 144 }),
    );
  });
  return () =>
    act(() => {
      graph.dispatchEvent(new PointerEvent(finish, { bubbles: true, pointerId: 1 }));
    });
}

describe("AriEase", () => {
  it("writes one bridge call on pointer-up and none while the pointer moves", () => {
    const { host, root, call } = render();

    const finish = dragHandle(host, "pointerup");
    // A drag is a stream of moves; the serial bridge must see none of them.
    expect(call).not.toHaveBeenCalled();
    finish();

    expect(call).toHaveBeenCalledTimes(1);
    const [tool, input] = call.mock.calls[0] as unknown as [
      string,
      { handle: string; animationId: string; ease: string },
    ];
    expect(tool).toBe("studio_update_animation");
    expect(input.handle).toBe("index.html#hero");
    expect(input.animationId).toBe("a1");
    expect(input.ease).toMatch(/^custom\(M0,0 C/);
    act(() => root.unmount());
  });

  it("restores the draft on pointer-cancel instead of writing it", () => {
    const { host, root, call } = render();

    dragHandle(host, "pointercancel")();

    expect(call).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("shows a pending state that clears on the receipt, not on a timer", async () => {
    let settle: (value: unknown) => void = () => undefined;
    const call = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          settle = resolve;
        }),
    );
    const { host, root } = render("power2.out", call as never);

    dragHandle(host, "pointerup")();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Tallennetaan käyrää…");

    await act(async () => {
      settle(okReceipt);
    });
    expect(host.querySelector('[role="status"]')?.textContent).not.toBe("Tallennetaan käyrää…");
    act(() => root.unmount());
  });

  it("puts the saved curve back and shows the reason when the write is refused", async () => {
    const call = vi.fn(async () => ({ ok: false, kind: "invalid", reason: "Tuntematon käyrä." }));
    const { host, root } = render("power2.out", call as never);

    const finish = dragHandle(host, "pointerup");
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Tuntematon käyrä.");
    // The picker shows the ease the SOURCE holds, not the refused one.
    expect(host.querySelector('button[aria-label="Liike 1 tuntuma"]')?.textContent).toContain(
      "Pehmeä",
    );
    act(() => root.unmount());
  });

  it("commits a grouped preset from the Finnish picker", async () => {
    const { host, root, call } = render();

    act(() =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Liike 1 tuntuma"]')!.click(),
    );
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-ari-ease="back.out(1.7)"]')!.click();
    });

    expect(call).toHaveBeenCalledWith("studio_update_animation", {
      handle: "index.html#hero",
      animationId: "a1",
      ease: "back.out(1.7)",
    });
    act(() => root.unmount());
  });

  it("does not rewrite an existing ease just because the panel opened", () => {
    const { host, root, call } = render("back.out(1.7)");

    const fields = host.querySelectorAll<HTMLInputElement>('input[aria-label="X1"]');
    expect(fields.length).toBe(1);
    expect(call).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("writes the four control-point fields only on an explicit submit", async () => {
    const { host, root, call } = render("power2.out");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    for (const [label, value] of [
      ["X1", "0,2"],
      ["Y1", "0,9"],
      ["X2", "0,4"],
      ["Y2", "1"],
    ]) {
      const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      act(() => {
        setValue?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(call).not.toHaveBeenCalled();

    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Tallenna ohjauspisteet")!
        .click();
    });

    expect(call).toHaveBeenCalledWith("studio_update_animation", {
      handle: "index.html#hero",
      animationId: "a1",
      ease: "custom(M0,0 C0.2,0.9 0.4,1 1,1)",
    });
    act(() => root.unmount());
  });

  /**
   * The panel lives inside `MotionForm`'s <form>. A nested <form> with a submit
   * button navigated the whole studio away instead of writing the curve, so the
   * control-point button must be a plain button and must not submit anything.
   */
  it("commits the control points without submitting the surrounding form", async () => {
    const submitted = vi.fn();
    const call = vi.fn(async () => okReceipt as unknown);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <form onSubmit={submitted}>
          <AriEase
            bridge={{ call }}
            handle="index.html#hero"
            animationId="a1"
            ease="power2.out"
            busy={false}
            position={2}
            duration={0.8}
          />
        </form>,
      );
    });

    expect(host.querySelectorAll("form form").length).toBe(0);
    const save = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Tallenna ohjauspisteet",
    )!;
    expect(save.type).toBe("button");

    await act(async () => save.click());

    expect(submitted).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("asks for three revision-bound frames from the animation's own span", async () => {
    const call = vi.fn(async (tool: string) =>
      tool === "studio_frame"
        ? {
            ok: true,
            frames: [
              { url: "/api/p/thumbnail/index.html?revision=r1", progress: 0.25 },
              { url: "/api/p/thumbnail/index.html?revision=r1&x=2", progress: 0.5 },
              { url: "/api/p/thumbnail/index.html?revision=r1&x=3", progress: 0.75 },
            ],
          }
        : okReceipt,
    );
    const { host, root } = render("power2.out", call as never);

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('button[type="button"][class*="min-h-10"]:last-of-type')
        ?.click();
      const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
      buttons.find((button) => button.textContent?.includes("Ruutukuvat"))!.click();
    });

    expect(call).toHaveBeenCalledWith("studio_frame", {
      animationId: "a1",
      samples: [0.25, 0.5, 0.75],
    });
    expect(host.querySelectorAll("img").length).toBe(3);
    act(() => root.unmount());
  });
});
