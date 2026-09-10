// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { installReactActEnvironment } from "../hooks/domSelectionTestHarness";
installReactActEnvironment();
const cleanups: (() => void)[] = [];
function renderHook(hook: typeof useElementReceiptSelection) {
  const root = createRoot(document.createElement("div"));
  const result: { current: ReturnType<typeof hook> } = { current: async () => false };
  function Harness() {
    result.current = hook();
    return null;
  }
  const rerender = () => act(() => root.render(React.createElement(Harness)));
  rerender();
  cleanups.push(() => act(() => root.unmount()));
  return { result, rerender };
}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElementReceiptSelection } from "./useElementReceiptSelection";
const state = vi.hoisted(() => ({
  projectId: "project",
  instance: null as string | null,
  activeCompPath: "index.html",
  revision: { current: 0 },
  apply: vi.fn(),
  refresh: vi.fn(),
  frame: { current: { contentDocument: { readyState: "complete" } } },
  resolve: vi.fn(),
  build: vi.fn(),
}));
vi.mock("../webmcp/tools/animationScene", () => ({
  describeScene: () => ({}),
  sceneInstanceChoice: { forSource: () => state.instance },
}));
vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContext: () => state,
  useStudioPlaybackContext: () => ({ setRefreshKey: state.refresh }),
}));
vi.mock("../contexts/DomEditContext", () => ({
  useDomEditActionsContext: () => ({
    previewIframeRef: state.frame,
    buildDomSelectionFromTarget: state.build,
    applyDomSelection: state.apply,
    selectionRevisionRef: state.revision,
  }),
}));
vi.mock("../webmcp/handles", () => ({
  mintElementHandle: (value: { hfId: string }) => value.hfId,
  resolveLiveHandleSelection: (...args: unknown[]) => state.resolve(...args),
}));
const receipt = { target: "copy", sourceFile: "scenes/card.html", deleted: false };
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.projectId = "project";
  state.instance = null;
  state.revision.current = 0;
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});
describe("saved element selection", () => {
  it("waits for the new preview and resolves the saved target", async () => {
    const { result } = renderHook(useElementReceiptSelection);
    act(() => {
      void result.current(receipt);
    });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(state.resolve).not.toHaveBeenCalled();
    state.frame.current.contentDocument = { readyState: "complete" };
    state.resolve.mockResolvedValue({ status: "ready", selection: { hfId: "copy" } });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(state.resolve.mock.calls[0]?.[1]).toBe("copy");
    expect(state.apply).toHaveBeenCalledWith({ hfId: "copy" }, { revealPanel: false });
  });
  it("deletion clears selection and cancels an earlier pending copy", async () => {
    const { result } = renderHook(useElementReceiptSelection);
    act(() => {
      result.current(receipt);
      result.current({ ...receipt, deleted: true });
    });
    state.frame.current.contentDocument = { readyState: "complete" };
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.resolve).not.toHaveBeenCalled();
    expect(state.apply).toHaveBeenCalledExactlyOnceWith(null, { revealPanel: false });
  });
  it("never applies an old project selection after asynchronous resolution", async () => {
    const finish = delaySelectionResolve();
    const { result, rerender } = renderHook(useElementReceiptSelection);
    act(() => {
      void result.current(receipt);
    });
    await completePreview();
    state.projectId = "other";
    rerender();
    await act(async () => finish({ status: "ready", selection: { hfId: "copy" } }));
    expect(state.apply).not.toHaveBeenCalled();
  });
});

for (const phase of ["preview", "resolve"]) {
  for (const choice of [{ hfId: "other" }, { hfId: "copy", instanceId: "host-b" }, null]) {
    it(`preserves newer ${JSON.stringify(choice)} during delayed ${phase}`, async () => {
      const finish = delaySelectionResolve();
      const { result } = renderHook(useElementReceiptSelection);
      const pending = result.current(receipt);
      if (phase === "resolve") {
        state.frame.current.contentDocument = { readyState: "complete" };
        await act(() => vi.advanceTimersByTimeAsync(50));
      }
      // The same monotonic ref is advanced by applyDomSelection for every user choice.
      state.revision.current++;
      state.apply(choice, { revealPanel: false });
      state.frame.current.contentDocument = { readyState: "complete" };
      await act(async () => {
        finish({ status: "ready", selection: { hfId: "copy" } });
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(await pending).toBe(false);
      expect(state.apply).toHaveBeenCalledExactlyOnceWith(choice, { revealPanel: false });
    });
  }
}

it("resolves the chosen instance before attempting the hidden first placement", async () => {
  const { result } = renderHook(useElementReceiptSelection);
  state.instance = "second-host";
  state.resolve.mockResolvedValue({ status: "not-found" });
  act(() => {
    void result.current(receipt);
  });
  state.frame.current.contentDocument = { readyState: "complete" };
  await act(() => vi.advanceTimersByTimeAsync(50));
  expect(state.resolve.mock.calls[0]?.[3]).toBe("second-host");
});

function delaySelectionResolve() {
  let finish: (value: unknown) => void = () => {};
  state.resolve.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return (value: unknown) => finish(value);
}

async function completePreview() {
  state.frame.current.contentDocument = { readyState: "complete" };
  await act(() => vi.advanceTimersByTimeAsync(50));
}

it.each([false, true])(
  "does not replace a selection changed during persistence (deleted=%s)",
  async (deleted) => {
    const { result } = renderHook(useElementReceiptSelection);
    state.revision.current = 4;
    const pending = result.current({ ...receipt, deleted, selectionRevision: 3 });
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(await pending).toBe(false);
    expect(state.refresh).toHaveBeenCalled();
    expect(state.apply).not.toHaveBeenCalled();
    expect(state.resolve).not.toHaveBeenCalled();
  },
);

it("reports the refreshed preview when a restore has no selected target", async () => {
  const { result } = renderHook(useElementReceiptSelection);
  const pending = result.current({ target: "", sourceFile: "index.html", deleted: true });
  state.frame.current.contentDocument = { readyState: "complete" };
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(await pending).toBe(true);
  expect(state.resolve).not.toHaveBeenCalled();
  expect(state.apply).toHaveBeenCalledExactlyOnceWith(null, { revealPanel: false });
});
