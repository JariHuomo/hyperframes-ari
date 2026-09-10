// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { LeftSidebarHandle } from "../components/sidebar/LeftSidebar";
import { usePlayerStore } from "../player/store/playerStore";
import { useAppHotkeys } from "./useAppHotkeys";
import { mountReactHarness } from "./domSelectionTestHarness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const domDelete = vi.fn(async () => undefined);
let root: Root | null = null;
let sync: ((iframe: HTMLIFrameElement | null) => void) | null = null;

function selection(): DomEditSelection {
  const element = document.createElement("section");
  element.id = "card";
  return {
    element,
    id: "card",
    selector: "#card",
    selectorIndex: 0,
    sourceFile: "index.html",
  } as unknown as DomEditSelection;
}

let historyActions: ReturnType<typeof useAppHotkeys>;
function Harness({ overrides = {} }: { overrides?: Partial<Parameters<typeof useAppHotkeys>[0]> }) {
  const selectionRef = useRef<DomEditSelection | null>(selection());
  const hotkeys = useAppHotkeys({
    handleTimelineElementsDelete: vi.fn(async () => undefined),
    handleTimelineElementSplit: vi.fn(async () => undefined),
    handleDomEditElementDelete: domDelete,
    domEditSelectionRef: selectionRef,
    clearDomSelectionRef: useRef<() => void>(() => undefined),
    editHistory: {
      undo: vi.fn(async () => ({ ok: false })),
      redo: vi.fn(async () => ({ ok: false })),
      state: { undo: [], redo: [] },
    },
    readOptionalProjectFile: vi.fn(async () => ""),
    readProjectFile: vi.fn(async () => ""),
    writeProjectFile: vi.fn(async () => undefined),
    domEditSaveTimestampRef: useRef(0),
    showToast: vi.fn(),
    syncHistoryPreviewAfterApply: vi.fn(async () => undefined),
    waitForPendingDomEditSaves: vi.fn(async () => undefined),
    leftSidebarRef: useRef<LeftSidebarHandle | null>(null),
    handleCopy: vi.fn(() => false),
    handlePaste: vi.fn(() => false),
    handleCut: vi.fn(() => false),
    onResetKeyframes: vi.fn(() => false),
    onDeleteSelectedKeyframes: vi.fn(),
    onAfterUndoRedo: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof useAppHotkeys>[0]);
  sync = hotkeys.syncPreviewHotkeys;
  historyActions = hotkeys;
  return null;
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  domDelete.mockClear();
});

describe("preview iframe hotkey forwarding", () => {
  it("still delivers Delete after the preview reloads", () => {
    // A reload keeps the iframe element (no ref callback) and the same
    // WindowProxy (an identity check sees no change) but replaces the window
    // holding the listeners. Attaching once left Delete dead inside the canvas
    // after the first reload — and clicking the canvas is what puts focus there.
    root = mountReactHarness(<Harness />);

    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    act(() => sync?.(iframe));

    // The reload: same element, a window that has lost its listeners.
    act(() => sync?.(iframe));

    const inner = iframe.contentWindow as (Window & typeof globalThis) | null;
    if (!inner) throw new Error("expected an iframe window");
    inner.document.body.dispatchEvent(
      new inner.KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );

    expect(domDelete).toHaveBeenCalledTimes(1);
  });
});

it.each(["undo", "redo"] as const)(
  "%s invalidates animation reads only after structural preview reconciliation",
  async (direction) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const syncPreview = vi.fn(() => pending);
    const invalidate = vi.fn();
    const apply = vi.fn(async () => ({
      ok: true,
      label: "Own copy",
      paths: ["own.html"],
      files: { "own.html": { previous: "bytes", restored: null } },
    }));
    root = mountReactHarness(
      <Harness
        overrides={{
          editHistory: { undo: apply, redo: apply, state: { undo: [], redo: [] } } as never,
          syncHistoryPreviewAfterApply: syncPreview,
          onAfterUndoRedo: invalidate,
        }}
      />,
    );
    let action!: Promise<void>;
    await act(async () => {
      action = direction === "undo" ? historyActions.handleUndo() : historyActions.handleRedo();
      await Promise.resolve();
    });
    expect(syncPreview).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await action;
    });
    expect(invalidate).toHaveBeenCalledOnce();
  },
);
