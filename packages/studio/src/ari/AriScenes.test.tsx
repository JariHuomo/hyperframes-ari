// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AriScenes } from "./AriScenes";
import { createAriAgentBridge } from "./agentBridge";
import { installReactActEnvironment } from "../hooks/domSelectionTestHarness";
installReactActEnvironment();
it("shows actual timing/shared-source proposal before save; failed save stays recoverable", async () => {
  const save = vi.fn(async (_input: unknown) => ({ ok: true, target: "new", deleted: false }));
  const bridge = createAriAgentBridge(
    [
      {
        name: "studio_scenes",
        description: "read",
        inputSchema: {},
        execute: async () => ({ ok: true, rows: [] }),
      },
      {
        name: "studio_prepare_scene",
        description: "prepare",
        inputSchema: {},
        execute: async () => ({
          ok: true,
          reviewVersion: "bound",
          beforeDuration: 7,
          afterDuration: 9,
          baseDuration: 7,
          rows: [{ target: "new", name: "New", start: 7, duration: 2, playbackRate: 1 }],
          sharedSources: [{ instances: 2 }],
          sourcePolicy: "Yhteinen lähde",
        }),
      },
      { name: "studio_edit_scene", description: "write", inputSchema: {}, execute: save },
    ],
    new AbortController().signal,
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = async (label: string) =>
    act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent === label)!
        .click(),
    );
  await act(async () => root.render(<AriScenes bridge={bridge} sourceFile="index.html" />));
  await click("Kohtaukset");
  await click("Lisää kohtaus");
  expect(save).not.toHaveBeenCalled();
  expect(host.textContent).toContain("7 s → 9 s");
  expect(host.textContent).toContain("2 esiintymää");
  save.mockRejectedValueOnce(new Error("Lähde muuttui"));
  await click("Tallenna kohtausmuutos");
  expect(host.querySelector("[role=alert]")?.textContent).toBe("Lähde muuttui");
  await click("Tallenna kohtausmuutos");
  expect(save.mock.calls[0]?.[0]).toMatchObject({
    reviewVersion: "bound",
    action: "add",
    sourceFile: "index.html",
  });
  expect(host.textContent).toContain("Kohtausmuutos tallennettu");
  act(() => root.unmount());
  host.remove();
});
