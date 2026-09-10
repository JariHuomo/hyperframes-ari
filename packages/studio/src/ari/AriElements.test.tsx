// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AriElements } from "./AriElements";
import { createAriAgentBridge } from "./agentBridge";
import { installReactActEnvironment } from "../hooks/domSelectionTestHarness";
installReactActEnvironment();
it.each([1, 2])("shows the selected name and impact %i before any write", async (count) => {
  const edit = vi.fn(async () => ({
    ok: true,
    target: "second",
    deleted: false,
    affectsInstances: count,
  }));
  let finishRefresh = () => {};
  const refreshGate = new Promise<void>((resolve) => {
    finishRefresh = resolve;
  });
  const bridge = createAriAgentBridge(
    [
      {
        name: "studio_elements",
        description: "read",
        inputSchema: {},
        execute: async () => ({
          ok: true,
          version: "saved-version",
          affectsInstances: count,
          elements: [
            { target: "first", name: "Ensimmäinen" },
            { target: "second", name: "Valittu otsikko" },
          ],
        }),
      },
      {
        name: "studio_images",
        description: "read",
        inputSchema: {},
        execute: async () => ({ ok: true, assets: [] }),
      },
      {
        name: "studio_refresh_project",
        description: "refresh",
        inputSchema: {},
        execute: async () => {
          await refreshGate;
          return {
            ok: true,
            version: "refreshed",
            assets: [],
            affectsInstances: count,
            elements: [
              { target: "first", name: "Remote first" },
              { target: "second", name: "Remote name" },
            ],
          };
        },
      },
      { name: "studio_edit_element", description: "edit", inputSchema: {}, execute: edit },
    ],
    new AbortController().signal,
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const panel = (target: string) => (
    <AriElements
      bridge={bridge}
      sourceFile="scenes/card.html"
      selectedTarget={target}
      instance="host-b"
      instanceLabel="2/2"
    />
  );
  await act(async () => root.render(panel("second")));
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("input")?.value).toBe("Valittu otsikko");
  expect(host.querySelector("[data-testid=element-impact]")?.textContent).toContain(
    count === 1 ? "tätä kohtausta" : "jokaista esiintymää (2)",
  );
  expect(host.querySelector("[data-testid=element-impact]")?.textContent).toContain("2/2");
  expect(edit).not.toHaveBeenCalled();
  const rename = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Nimeä",
  )!;
  await act(async () => rename.click());
  expect(host.querySelector("[role=status]")?.textContent).toContain("Tallennettu");
  edit.mockRejectedValueOnce(new Error("Kohtaus on muuttunut."));
  await act(async () => rename.click());
  expect(host.querySelector("[role=alert]")?.textContent).toContain("Kohtaus on muuttunut");
  expect(host.querySelector("[role=status]")?.textContent).not.toContain("Tallennettu");
  // A checked refresh may update the remote row name, but not the local form draft.
  const draft = host.querySelector("input")!.value;
  const refresh = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Päivitä tilanne",
  )!;
  await act(async () => refresh.click());
  await act(async () => root.render(panel("first")));
  await act(async () => finishRefresh());
  expect(host.querySelectorAll("select")[1]!.value).toBe("first");
  expect(host.querySelector("input")!.value).toBe(draft);
  expect(host.querySelector("[role=alert]")).toBeNull();
  expect(host.querySelector("[role=status]")?.textContent).toContain("Tilanne päivitetty");
  act(() => root.unmount());
  host.remove();
});
