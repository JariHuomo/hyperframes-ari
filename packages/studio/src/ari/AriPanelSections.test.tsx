// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AriPanelSections } from "./AriPanelSections";
import { AriNumber } from "./AriNumber";
vi.mock("../contexts/DomEditContext", () => ({
  useDomEditSelectionContext: () => ({ domEditSelection: { label: "Otsikko" } }),
}));
vi.mock("./useAriScene", () => ({
  useAriScene: () => ({
    nested: true,
    index: 2,
    instances: [{}, {}],
    instance: { hostLabel: "Loppu" },
  }),
}));
afterEach(() => {
  document.body.innerHTML = "";
});
it("keeps identity visible and uses roving keyboard tabs without remounting drafts", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <AriPanelSections
        text={<input defaultValue="draft" />}
        appearance="Style"
        motion="Motion"
        review="Review"
      />,
    ),
  );
  expect(host.querySelector("header")?.textContent).toContain("2 / 2");
  expect(host.querySelector("header")?.textContent).toContain("kaikkia 2 esiintymää");
  const tabs = host.querySelectorAll<HTMLButtonElement>("[role=tab]");
  expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  act(() => {
    tabs[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  });
  expect(document.activeElement).toBe(tabs[0]);
  const draft = host.querySelector("input")!;
  draft.value = "unsaved";
  act(() => tabs[1].click());
  act(() => tabs[0].click());
  expect(host.querySelector("input")?.value).toBe("unsaved");
  act(() => root.unmount());
});
it("displays decimal commas while forwarding user input unchanged", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<AriNumber label="Kesto" value="0.25" onChange={() => {}} />));
  expect(host.querySelector("input")?.value).toBe("0,25");
  expect(host.querySelector("input")?.inputMode).toBe("decimal");
  act(() => root.unmount());
});
