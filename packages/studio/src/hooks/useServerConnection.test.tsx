// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useServerConnection } from "./useServerConnection";
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
  document.body.innerHTML = "";
});
it("opens the explicitly created project after an empty workspace instead of taking the first project", async () => {
  vi.useFakeTimers();
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [] })))
      .mockResolvedValue(
        new Response(
          JSON.stringify({ projects: [{ id: "alphabetically-first" }, { id: "new-ad" }] }),
        ),
      ),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const state = useServerConnection();
    return <output>{JSON.stringify(state)}</output>;
  }
  await act(async () => {
    root.render(<Harness />);
  });
  expect(JSON.parse(host.textContent!)).toMatchObject({ projectId: null, waitingForServer: true });
  await act(async () => {
    window.location.hash = "#project/new-ad";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(JSON.parse(host.textContent!)).toMatchObject({
    projectId: "new-ad",
    waitingForServer: false,
  });
  act(() => root.unmount());
});
