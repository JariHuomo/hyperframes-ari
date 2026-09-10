// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AriNotebookRepair } from "./AriNotebookRepair";
import { setNativeValue as set } from "./ariTestInput";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
afterEach(() => {
  document.body.innerHTML = "";
});
const data = {
  notebook: {
    tasks: [
      { id: "task-1", text: "Korjaa otsikko", remaining: "Hinta puuttuu", suggestion: "Kysy" },
    ],
    locks: [{ id: "lock-1", label: "Pääviesti", text: "Pieni tauko.", tasks: [] }],
  },
  repair: {
    limit: 2,
    activeTaskId: "task-1",
    tasks: [
      { id: "task-1", used: 2, exhausted: true, remaining: "Hinta puuttuu", suggestion: "Kysy" },
    ],
    refusals: [
      {
        id: "ref-1",
        createdAt: "2026-09-10T09:00:00.000Z",
        message: "Korjauskierrosten raja täyttyi",
      },
    ],
  },
};
function render(save = vi.fn(async () => {})) {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(<AriNotebookRepair data={data} busy={false} save={save} />);
  });
  return { host, save };
}
const byText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;

it("shows the exhausted round count with the remaining gap and next suggestion", () => {
  const { host } = render();
  const rounds = host.querySelector('[aria-label="Käytetyt korjauskierrokset"]')!.textContent!;
  expect(rounds).toContain("Korjaa otsikko: 2/2 kierrosta — raja täynnä");
  expect(rounds).toContain("Hinta puuttuu");
  expect(rounds).toContain("Kysy");
  expect(host.querySelector('[aria-label="Torjutut muutokset"]')!.textContent).toContain(
    "Korjauskierrosten raja täyttyi",
  );
});
it("drives locks, mandates and the active task through the shared notebook service", async () => {
  const { host, save } = render();
  const lock = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(lock.checked).toBe(false);
  await act(async () => lock.click());
  expect(save).toHaveBeenCalledWith({
    action: "authority",
    id: "lock-1",
    taskId: "task-1",
    granted: true,
  });
  await act(async () => byText(host, "Poista lukitus").click());
  expect(save).toHaveBeenCalledWith({ action: "unlock", id: "lock-1" });
  const selects = host.querySelectorAll<HTMLSelectElement>("select");
  await act(async () => set(selects[0]!, ""));
  expect(save).toHaveBeenCalledWith({ action: "active_repair", id: "" });
});
it("sends a bounded repair limit and a new approved-text lock", async () => {
  const { host, save } = render();
  const inputs = host.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])');
  await act(async () => set(inputs[0]!, "3"));
  await act(async () => byText(host, "Tallenna kierrosraja").click());
  expect(save).toHaveBeenCalledWith({ action: "repair_limit", limit: 3 });
  await act(async () => set(inputs[0]!, "kolme"));
  expect(byText(host, "Tallenna kierrosraja").disabled).toBe(true);
  const label = host.querySelector<HTMLInputElement>("[aria-label], input")!;
  expect(label).toBeTruthy();
  await act(async () => set(inputs[3]!, "Tarjous"));
  await act(async () => set(inputs[4]!, "Kaksi yhden hinnalla"));
  await act(async () => byText(host, "Lukitse hyväksytty teksti").click());
  expect(save).toHaveBeenCalledWith({
    action: "lock",
    label: "Tarjous",
    text: "Kaksi yhden hinnalla",
  });
});
