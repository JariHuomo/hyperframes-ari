// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AriLayers } from "./AriLayers";
import type { StudioLookSnapshot } from "../webmcp/tools/lookTools";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const SCENE = "scenes/headline-card.html";

/**
 * A scene hosted twice contributes the SAME element handle to the layer tree
 * once per placement — `examples/rajamarket-scenes` hosts `headline-card.html`
 * at 0,12 s and again at 5,60 s, and `studio_look` reports six rows for it.
 * Keying the rows by handle alone made React drop one and warn on every render.
 */
function layer(label: string, hfId: string) {
  return {
    key: `${SCENE}:${hfId}:0`,
    element: document.createElement("p"),
    label,
    tagName: "p",
    depth: 0,
    childCount: 0,
    hfId,
    selectorIndex: 0,
    sourceFile: SCENE,
  };
}

function snapshot(): StudioLookSnapshot {
  return {
    projectId: "rajamarket-scenes",
    compositionPath: "index.html",
    currentTime: 0,
    duration: 7,
    isPlaying: false,
    elements: [],
    scene: {
      status: "ready",
      items: [
        layer("Hc Headline", "headline-card-headline"),
        layer("Hc Offer", "headline-card-offer"),
        // the second placement of the very same scene file
        layer("Hc Headline", "headline-card-headline"),
        layer("Hc Offer", "headline-card-offer"),
      ],
      drillInItem: null,
    },
    selection: null,
    selectionAnimationCount: 0,
    history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
  } as unknown as StudioLookSnapshot;
}

describe("AriLayers", () => {
  it("keeps a row per placement of a twice-hosted scene and logs no duplicate-key warning", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <AriLayers
          bridge={{ call: vi.fn(async () => ({ ok: true })) } as never}
          getSnapshot={snapshot}
          busy={false}
        />,
      );
    });

    expect(host.querySelectorAll('[aria-label="Tasot"] button').length).toBe(4);
    expect(errors.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    act(() => root.unmount());
  });
});
