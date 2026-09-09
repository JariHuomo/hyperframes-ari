// Modified for Ari Studio; changes documented in /ARI.md.
import { withGeometryReadback } from "./geometryReadback";
import { readAnimationSource } from "./tools/animationReadback";
import { AriControlPanel } from "../ari/AriControlPanel";
import { useCallback, useEffect, useMemo } from "react";
import { useDomEditActionsContext, useDomEditSelectionContext } from "../contexts/DomEditContext";
import { useStudioShellContext } from "../contexts/StudioContext";
import { usePlayerStore } from "../player";
import { useStudioAgentTools, type StudioAgentToolsDeps } from "./useStudioAgentTools";
import { collectStudioLookScene, type StudioLookSnapshot } from "./tools/lookTools";
import { studioEditLifecycle } from "./writeCoordinator";
import { findElementForSelection } from "../components/editor/domEditingElement";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import {
  applyStudioBoxSizeDraft,
  captureStudioBoxSize,
  restoreStudioBoxSize,
} from "../components/editor/manualEdits";

export function readLiveSelectionBox(
  doc: Document | null | undefined,
  selection: DomEditSelection,
  activeCompositionPath: string | null,
) {
  const liveElement = doc
    ? findElementForSelection(doc, selection, activeCompositionPath)
    : selection.element;
  if (!liveElement) throw new Error("the target is missing from the current Studio preview");
  const rect = liveElement.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

type ResizeCommit = (
  selection: DomEditSelection,
  next: { width: number; height: number },
  offset?: { x: number; y: number },
  restore?: () => void,
) => Promise<void>;

export function resizeSelectionFromAgent(
  selection: DomEditSelection,
  next: { width: number; height: number },
  commit: ResizeCommit,
): Promise<void> {
  const previous = captureStudioBoxSize(selection.element);
  applyStudioBoxSizeDraft(selection.element, next);
  return commit(selection, next, undefined, () => {
    restoreStudioBoxSize(selection.element, previous);
  });
}

/**
 * Mounts the shared WebMCP/script tools and Ari's visible control panel.
 *
 * Lives inside `EditorShell` rather than `App` for two reasons: the DomEdit
 * contexts are only readable below `DomEditProvider`, which `App` renders, and
 * `App.tsx` sits three lines under the 600-line cap.
 *
 * The player store is read IMPERATIVELY through `getState()` rather than
 * subscribed to. Subscribing to `currentTime` would re-render this component on
 * every animation frame during playback for a value nothing here displays.
 */
export function StudioAgentTools({
  focusMode,
  onToggleFocus,
  commandPanelHost,
  layersHost,
  timelineHost,
}: {
  focusMode: boolean;
  onToggleFocus: () => void;
  commandPanelHost?: HTMLElement | null;
  layersHost?: HTMLElement | null;
  timelineHost?: HTMLElement | null;
}) {
  const { projectId, activeCompPath, editHistory, writeBlockedReason } = useStudioShellContext();
  const {
    domEditSelection,
    activeGroupElement,
    selectedGsapAnimations,
    gsapMultipleTimelines,
    gsapUnsupportedTimelinePattern,
  } = useDomEditSelectionContext();
  const {
    previewIframeRef,
    buildDomSelectionFromTarget,
    applyDomSelection,
    handleDomTextCommitForSelection,
    handleDomStyleCommitForSelection,
    handleDomPathOffsetCommit,
    handleDomBoxSizeCommit,
    handleDomRotationCommit,
    handleGsapAddAnimation,
    handleGsapUpdateMeta,
    handleGsapAddKeyframeBatch,
    handleGsapDeleteAnimation,
  } = useDomEditActionsContext();

  useEffect(() => {
    studioEditLifecycle.activateProject(projectId);
    return () => studioEditLifecycle.reset();
  }, [projectId]);

  const getSnapshot = useCallback((): StudioLookSnapshot => {
    const player = usePlayerStore.getState();
    return {
      projectId,
      compositionPath: activeCompPath,
      clipManifest: player.clipManifest,
      currentTime: player.currentTime,
      duration: player.duration,
      isPlaying: player.isPlaying,
      elements: player.elements,
      scene: collectStudioLookScene(
        previewIframeRef.current?.contentDocument ?? null,
        activeCompPath,
        activeGroupElement,
      ),
      selection: domEditSelection,
      selectionAnimationCount: selectedGsapAnimations.length,
      history: {
        canUndo: editHistory.canUndo,
        canRedo: editHistory.canRedo,
        undoLabel: editHistory.undoLabel ?? null,
        redoLabel: editHistory.redoLabel ?? null,
      },
    };
  }, [
    projectId,
    activeCompPath,
    domEditSelection,
    activeGroupElement,
    selectedGsapAnimations,
    editHistory,
    previewIframeRef,
  ]);

  const deps = useMemo<StudioAgentToolsDeps>(
    () => ({
      getSnapshot,
      getPreviewDocument: () => previewIframeRef.current?.contentDocument ?? null,
      buildSelection: (element) => buildDomSelectionFromTarget(element, { exactTarget: true }),
      applySelection: (selection) => applyDomSelection(selection, { revealPanel: true }),
      requestSeek: (time) => usePlayerStore.getState().requestSeek(time),
      readPlayhead: () => {
        const player = usePlayerStore.getState();
        return {
          currentTime: player.currentTime,
          duration: player.duration,
          isPlaying: player.isPlaying,
        };
      },
      getProjectId: () => projectId,
      getCompositionPath: () => activeCompPath,
      // Scene placements are read live: the manifest is republished whenever the
      // preview reloads, and a stale copy would address the wrong instance.
      getClipManifest: () => usePlayerStore.getState().clipManifest,
      // HEAD, not GET: the tool only needs to know the frame renders. Pulling
      // the PNG here would download it once for nothing, since the agent
      // fetches the URL itself.
      probeFrame: async (url) => {
        try {
          const response = await fetch(url, { method: "HEAD" });
          const sourceRevision = response.headers.get("X-Hyperframes-Source-Revision");
          return {
            ok: response.ok && Boolean(sourceRevision),
            status: response.status,
            ...(sourceRevision ? { sourceRevision } : {}),
          };
        } catch {
          return { ok: false, status: 0 };
        }
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      getCurrentSelection: () => domEditSelection,
      getWriteBlockedReason: () => writeBlockedReason,
      setText: (selection, value, fieldKey) =>
        handleDomTextCommitForSelection(selection, value, fieldKey),
      setStyle: (selection, property, value) =>
        handleDomStyleCommitForSelection(selection, property, value),
      // Measured, not authored: the tool compares this before and after to
      // tell a real change from a handler that did nothing and resolved. A
      // successful commit may replace the preview document, so re-resolve the
      // source-safe selection instead of measuring its detached old node.
      readBox: (selection) =>
        readLiveSelectionBox(previewIframeRef.current?.contentDocument, selection, activeCompPath),
      moveTo: (selection, next) =>
        withGeometryReadback(projectId, selection, () =>
          handleDomPathOffsetCommit(selection, next),
        ),
      resizeTo: (selection, next) =>
        withGeometryReadback(projectId, selection, () =>
          resizeSelectionFromAgent(selection, next, handleDomBoxSizeCommit),
        ),
      rotateTo: (selection, next) =>
        withGeometryReadback(projectId, selection, () => handleDomRotationCommit(selection, next)),
      readAnimationSource: (selection) => readAnimationSource(projectId, selection),
      addAnimation: (selection, method, options, instance) =>
        handleGsapAddAnimation(method, selection, options, instance),
      updateAnimation: (selection, animationId, updates) =>
        handleGsapUpdateMeta(animationId, updates, selection),
      addKeyframe: (selection, animationId, percent, properties) =>
        handleGsapAddKeyframeBatch(animationId, percent, properties, undefined, selection),
      deleteAnimation: (selection, animationId) =>
        handleGsapDeleteAnimation(animationId, selection),
      getAnimationsForSelection: async (selection) =>
        (await readAnimationSource(projectId, selection)).animations,
      getGsapDiagnostics: () => ({
        animations: selectedGsapAnimations,
        multipleTimelines: gsapMultipleTimelines,
        unsupportedTimelinePattern: gsapUnsupportedTimelinePattern,
      }),
    }),
    [
      getSnapshot,
      previewIframeRef,
      buildDomSelectionFromTarget,
      applyDomSelection,
      projectId,
      activeCompPath,
      writeBlockedReason,
      handleDomTextCommitForSelection,
      handleDomStyleCommitForSelection,
      handleDomPathOffsetCommit,
      handleDomBoxSizeCommit,
      handleDomRotationCommit,
      handleGsapAddAnimation,
      handleGsapUpdateMeta,
      handleGsapAddKeyframeBatch,
      handleGsapDeleteAnimation,
      domEditSelection,
      selectedGsapAnimations,
      gsapMultipleTimelines,
      gsapUnsupportedTimelinePattern,
    ],
  );

  const bridge = useStudioAgentTools(deps);
  return (
    <AriControlPanel
      bridge={bridge}
      getSnapshot={getSnapshot}
      focusMode={focusMode}
      onToggleFocus={onToggleFocus}
      commandPanelHost={commandPanelHost}
      layersHost={layersHost}
      timelineHost={timelineHost}
    />
  );
}
