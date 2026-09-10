import { sceneInstanceChoice, describeScene } from "../webmcp/tools/animationScene";
import { usePlayerStore } from "../player";
import { useCallback, useEffect, useRef } from "react";
import { useDomEditActionsContext } from "../contexts/DomEditContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../contexts/StudioContext";
import { resolveLiveHandleSelection, mintElementHandle } from "../webmcp/handles";

/** Resolve the saved identity in the new preview, never an old detached node. */
export function useElementReceiptSelection() {
  const { projectId, activeCompPath } = useStudioShellContext();
  const { setRefreshKey } = useStudioPlaybackContext();
  const { previewIframeRef, buildDomSelectionFromTarget, applyDomSelection, selectionRevisionRef } =
    useDomEditActionsContext();
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [projectId, activeCompPath],
  );
  return useCallback(
    async (receipt: {
      target: string;
      sourceFile: string;
      deleted: boolean;
      previewTime?: number;
      selectionRevision?: number;
    }) => {
      const current = ++generation.current;
      let revision = receipt.selectionRevision ?? selectionRevisionRef.current;
      if (receipt.deleted && revision === selectionRevisionRef.current) {
        applyDomSelection(null, { revealPanel: false });
        revision = selectionRevisionRef.current;
      }
      const stale = () =>
        generation.current !== current || selectionRevisionRef.current !== revision;
      const oldDocument = previewIframeRef.current?.contentDocument;
      setRefreshKey((key) => key + 1);
      const handle = mintElementHandle({
        projectId,
        activeCompositionPath: activeCompPath ?? "index.html",
        sourceFile: receipt.sourceFile,
        hfId: receipt.target,
      });
      return pollSavedPreview({
        receipt,
        stale,
        handle,
        ready: () =>
          savedPreviewReady(
            previewIframeRef.current?.contentDocument,
            oldDocument,
            receipt.sourceFile,
            activeCompPath,
          ),
        apply: (handle) =>
          applySavedSelection({
            previewIframeRef,
            handle,
            buildDomSelectionFromTarget,
            applyDomSelection,
            sourceFile: receipt.sourceFile,
            stale,
          }),
      });
    },
    [
      projectId,
      activeCompPath,
      previewIframeRef,
      setRefreshKey,
      buildDomSelectionFromTarget,
      applyDomSelection,
      selectionRevisionRef,
    ],
  );
}

function savedPreviewReady(
  doc: Document | null | undefined,
  oldDocument: Document | null | undefined,
  sourceFile: string,
  activeCompPath: string | null,
) {
  if (!doc || doc === oldDocument || doc.readyState !== "complete") return false;
  if (sourceFile === (activeCompPath ?? "index.html")) return true;
  return Boolean(
    describeScene(
      {
        getClipManifest: () => usePlayerStore.getState().clipManifest,
        getCompositionPath: () => activeCompPath,
      },
      sourceFile,
    ),
  );
}

async function applySavedSelection({
  previewIframeRef,
  handle,
  buildDomSelectionFromTarget,
  applyDomSelection,
  sourceFile,
  stale,
}: Pick<
  ReturnType<typeof useDomEditActionsContext>,
  "previewIframeRef" | "buildDomSelectionFromTarget" | "applyDomSelection"
> & {
  handle: string;
  sourceFile: string;
  stale: () => boolean;
}) {
  const result = await resolveLiveHandleSelection(
    () => previewIframeRef.current?.contentDocument ?? null,
    handle,
    buildDomSelectionFromTarget,
    sceneInstanceChoice.forSource(sourceFile) ?? undefined,
  );
  if (stale()) return false;
  if (result.status === "ready") {
    const instanceId = sceneInstanceChoice.forSource(sourceFile);
    const selection = instanceId ? { ...result.selection, instanceId } : result.selection;
    applyDomSelection(selection, { revealPanel: false });
    return true;
  }
  return null;
}

async function pollSavedPreview({
  receipt,
  stale,
  handle,
  ready,
  apply,
}: {
  receipt: { deleted: boolean; previewTime?: number };
  stale: () => boolean;
  handle: string | null;
  ready: () => boolean;
  apply: (handle: string) => Promise<boolean | null>;
}) {
  let positioned = receipt.previewTime === undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (stale()) return false;
    if (!ready()) continue;
    if (receipt.deleted) return true;
    if (!handle) return false;
    if (!positioned && receipt.previewTime !== undefined) {
      usePlayerStore.getState().requestSeek(receipt.previewTime);
      positioned = true;
      continue;
    }
    const applied = await apply(handle);
    if (applied !== null) return applied;
  }
  // Persistence already succeeded; preview timeout is not a failed source write.
  return false;
}
