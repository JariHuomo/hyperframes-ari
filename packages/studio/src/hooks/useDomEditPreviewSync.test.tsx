// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useDomEditPreviewSync } from "./useDomEditPreviewSync";
import { installReactActEnvironment, makeSelection } from "./domSelectionTestHarness";
import type { DomEditSelection } from "../components/editor/domEditing";
installReactActEnvironment();
vi.mock("../components/editor/manualEdits", () => ({ reapplyPositionEditsAfterSeek: () => {} }));
vi.mock("../components/editor/domEditing", async (original) => ({
  ...(await original<typeof import("../components/editor/domEditing")>()),
  findElementForSelection: () => document.createElement("div"),
}));
for (const change of ["none", "element", "instance", "clear", "unmount"]) {
  it(`guards delayed preview rebind: ${change}`, async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const root = createRoot(document.createElement("div"));
    const selection = {
      ...makeSelection("A", document.createElement("div")),
      instanceId: "host-b",
    };
    const selected: { current: DomEditSelection | null } = { current: selection };
    const revision = { current: 0 };
    const apply = vi.fn();
    let finish: (selection: DomEditSelection) => void = () => {};
    const build = vi.fn(
      () =>
        new Promise<DomEditSelection>((resolve) => {
          finish = resolve;
        }),
    );
    function Harness() {
      useDomEditPreviewSync({
        selectionRevisionRef: revision,
        previewIframe: frame,
        activeCompPath: "index.html",
        captionEditMode: false,
        domEditSelectionRef: selected,
        domEditGroupSelectionsRef: { current: [] },
        domEditSelection: selection,
        applyDomSelection: apply,
        buildDomSelectionFromTarget: build,
        refreshDomEditGroupSelectionsFromPreview: async () => {},
        refreshPreviewDocumentVersion: () => {},
        syncPreviewHotkeys: () => {},
        applyStudioManualEditsToPreviewRef: { current: async () => {} },
      });
      return null;
    }
    act(() => root.render(<Harness />));
    expect(build).toHaveBeenCalledOnce();
    if (change === "unmount") act(() => root.unmount());
    else if (change !== "none") {
      revision.current++;
      selected.current =
        change === "clear"
          ? null
          : {
              ...selection,
              instanceId: change === "instance" ? "host-a" : "host-b",
              label: change,
            };
    }
    await act(async () => finish({ ...selection, instanceId: undefined }));
    if (change === "none")
      expect(apply).toHaveBeenCalledExactlyOnceWith(selection, {
        revealPanel: false,
        preserveGroup: true,
        preserveRevision: true,
      });
    else expect(apply).not.toHaveBeenCalled();
    if (change !== "unmount") act(() => root.unmount());
    frame.remove();
  });
}
