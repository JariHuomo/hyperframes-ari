// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { usePreviewPersistence } from "./usePreviewPersistence";
import { usePlayerStore } from "../player";
import { installReactActEnvironment } from "./domSelectionTestHarness";
installReactActEnvironment();
vi.mock("../utils/gsapUndoRestore", () => ({ applyUndoRestoreToPreview: () => "full" }));
it("retains the selected placement while a history restore rebuilds preview rows", async () => {
  const root = createRoot(document.createElement("div"));
  let sync: ReturnType<
    typeof usePreviewPersistence
  >["syncHistoryPreviewAfterApply"] = async () => {};
  const callbacks = {
    showToast: vi.fn(),
    readOptionalProjectFile: async () => "",
    writeProjectFile: async () => {},
    recordEdit: async () => {},
    previewIframeRef: { current: null },
    activeCompPathRef: { current: "index.html" },
    reloadPreview: vi.fn(),
  };
  function Harness() {
    sync = usePreviewPersistence(callbacks).syncHistoryPreviewAfterApply;
    return null;
  }
  act(() => root.render(<Harness />));
  usePlayerStore.getState().setSelectedElementId("second-placement");
  await act(async () => sync({ paths: ["scenes/headline.html"] }));
  expect(usePlayerStore.getState().selectedElementId).toBe("second-placement");
  expect(usePlayerStore.getState().timelineReady).toBe(false);
  act(() => root.unmount());
  usePlayerStore.getState().setSelectedElementId(null);
});
