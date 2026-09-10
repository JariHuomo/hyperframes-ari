import { useEffect, useMemo, useRef } from "react";
import type { TimelineElement } from "../player";
import type { DomEditSelection } from "../components/editor/domEditing";
import { resolveTimelineIdForSelection } from "../utils/studioHelpers";
import { logSelect } from "../utils/selectDebug";
import {
  resolveTimelineSelections,
  timelineElementsForSelection,
} from "./timelineSelectionPresence";

interface UseTimelineSelectionPreviewSyncParams {
  previewPending?: boolean;
  selectedElementId: string | null;
  selectedElementIds: Set<string>;
  timelineElements: TimelineElement[];
  domEditSelection: DomEditSelection | null;
  domEditGroupSelections: DomEditSelection[];
  activeCompPath: string | null;
  buildDomSelectionForTimelineElement: (
    element: TimelineElement,
  ) => Promise<DomEditSelection | null>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: {
      revealPanel?: boolean;
      additive?: boolean;
      preserveGroup?: boolean;
      announce?: boolean;
      preserveRevision?: boolean;
    },
  ) => void;
  applyMarqueeSelection: (selections: DomEditSelection[], additive: boolean) => void;
  onSelectionNotFound: () => void;
}

function orderSelectedIds(ids: Set<string>, anchor: string | null): string[] {
  const ordered = [...ids];
  if (!anchor || !ids.has(anchor)) return ordered;
  return [anchor, ...ordered.filter((id) => id !== anchor)];
}

function selectionIdsMatch(
  currentIds: string[],
  selectedIds: string[],
  currentAnchor: string | null,
  wantedAnchor: string | null,
): boolean {
  // Compare as sets in BOTH directions: length equality misreads duplicates (two DOM
  // children resolving to the same clip id) as a full match and skips mirroring the
  // members that never made it into the preview.
  const current = new Set(currentIds);
  const selected = new Set(selectedIds);
  if (current.size !== selected.size) return false;
  for (const id of selected) {
    if (!current.has(id)) return false;
  }
  // The primary/anchor must also agree, or a change of just the anchor within the
  // same set would never re-sync the preview's primary selection.
  return currentAnchor === wantedAnchor;
}

/**
 * The invariant this file owes the Delete key, now that Delete prefers the
 * canvas: the canvas selection never points outside the current timeline
 * selection. A member still resolving has no anchor of its own yet, so it is
 * not caught here — only a canvas selection that belongs to something else.
 */
function anchorIsOutsideSelection(anchor: string | null, selectedIds: string[]): boolean {
  return anchor !== null && !selectedIds.includes(anchor);
}

export function useTimelineSelectionPreviewSync({
  previewPending = false,
  selectedElementId,
  selectedElementIds,
  timelineElements,
  domEditSelection,
  domEditGroupSelections,
  activeCompPath,
  buildDomSelectionForTimelineElement,
  applyDomSelection,
  applyMarqueeSelection,
  onSelectionNotFound,
}: UseTimelineSelectionPreviewSyncParams): void {
  const selectedIds = useMemo(
    () => orderSelectedIds(selectedElementIds, selectedElementId),
    [selectedElementId, selectedElementIds],
  );
  const selectedKey = selectedIds.join("\0");
  const domEditSelectionRef = useRef(domEditSelection);
  const domEditGroupSelectionsRef = useRef(domEditGroupSelections);
  const lastSyncedSelectedKeyRef = useRef("");
  const missingSelectionKeyRef = useRef("");
  // The list as it is now, not as it was when this effect run started: a rebuild
  // that lands mid-wait has to be visible to the wait itself.
  const timelineElementsRef = useRef(timelineElements);
  timelineElementsRef.current = timelineElements;
  domEditSelectionRef.current = domEditSelection;
  domEditGroupSelectionsRef.current = domEditGroupSelections;

  useEffect(() => {
    if (previewPending) return;
    const previousSelectedKey = lastSyncedSelectedKeyRef.current;
    lastSyncedSelectedKeyRef.current = selectedKey;
    const currentDomEditSelection = domEditSelectionRef.current;
    const currentDomEditGroupSelections = domEditGroupSelectionsRef.current;
    const currentSelections = previewSelectionGroup(
      currentDomEditGroupSelections,
      currentDomEditSelection,
    );
    const currentIds = currentSelections
      .map((selection) =>
        resolveTimelineIdForSelection(selection, timelineElements, activeCompPath),
      )
      .filter((id): id is string => Boolean(id));
    const currentAnchor = currentDomEditSelection
      ? resolveTimelineIdForSelection(currentDomEditSelection, timelineElements, activeCompPath)
      : null;

    if (selectedIds.length === 0) {
      missingSelectionKeyRef.current = "";
      // The timeline holds nothing, so the canvas is about to hold nothing either.
      // This is the path that silently drops a selection the user can still see.
      logSelect("timeline-empty", {
        had: currentIds.length,
        previousKey: previousSelectedKey.length > 0,
        clearing: previousSelectedKey.length > 0 && currentIds.length > 0,
      });
      if (previousSelectedKey.length > 0 && currentIds.length > 0) {
        applyDomSelection(null, { revealPanel: false });
      }
      return;
    }
    if (selectionIdsMatch(currentIds, selectedIds, currentAnchor, selectedElementId)) {
      missingSelectionKeyRef.current = "";
      return;
    }

    let cancelled = false;
    // One warning per selection, however many times the effect retries it.
    const warnSelectionMissingOnce = () => {
      if (missingSelectionKeyRef.current === selectedKey) return;
      missingSelectionKeyRef.current = selectedKey;
      onSelectionNotFound();
    };
    // Re-resolving the same timeline identity after a preview rebuild is not
    // new user intent and must not invalidate a pending saved-selection receipt.
    const refreshOptions = selectionRefreshOptions(selectedKey, previousSelectedKey);
    const syncSelection = async () => {
      // Nothing selected listed any more, while the canvas still holds a
      // selection: that is what an undo/redo rebuild looks like for a beat, and
      // clearing on it dropped the selection permanently. Give the list a bounded
      // chance to name them again; a real removal still falls through and clears.
      const available = await timelineElementsForSelection({
        ids: selectedIds,
        elements: timelineElements,
        read: () => timelineElementsRef.current,
        cancelled: () => cancelled,
        hasCanvasSelection: Boolean(currentDomEditSelection),
      });
      const { selections, resolvableCount } = await resolveTimelineSelections({
        ids: selectedIds,
        elements: available,
        build: buildDomSelectionForTimelineElement,
      });
      if (cancelled) return;
      // The store is the source of truth: applying a partial set would write that
      // shrunk set back and silently drop the members whose DOM node was not ready.
      // Bail instead; a later effect run (on timelineElements/DOM change) applies the
      // full set once every resolvable member has a live node.
      if (selections.length < resolvableCount) {
        warnSelectionMissingOnce();
        // Bailing keeps whatever the canvas already held, and Delete acts on the
        // canvas first — so an anchor pointing OUTSIDE this selection is an
        // element the user is no longer looking at, and deleting it is the
        // damage. Only that goes: a member still resolving has no anchor of its
        // own here and is left for the later run. Quietly, because announcing
        // the clear would deselect the clip that was just picked.
        if (anchorIsOutsideSelection(currentAnchor, selectedIds)) {
          applyDomSelection(null, { revealPanel: false, announce: false, ...refreshOptions });
        }
        return;
      }
      missingSelectionKeyRef.current = "";
      logSelect("timeline-sync", {
        wanted: selectedIds.length,
        had: currentIds.length,
        resolved: selections.length,
      });
      if (selections.length === 0) {
        applyDomSelection(null, { revealPanel: false, ...refreshOptions });
      } else if (selections.length === 1) {
        applyDomSelection(selections[0], refreshOptions);
      } else {
        applyMarqueeSelection(selections, false);
      }
    };

    void syncSelection();
    return () => {
      cancelled = true;
    };
    // DOM selection changes are read through refs. Depending on them directly
    // would let the preview-to-timeline echo cancel an in-flight timeline click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    previewPending,
    activeCompPath,
    applyDomSelection,
    applyMarqueeSelection,
    buildDomSelectionForTimelineElement,
    onSelectionNotFound,
    selectedElementId,
    selectedIds,
    selectedKey,
    timelineElements,
  ]);
}

function selectionRefreshOptions(current: string, previous: string) {
  return current === previous ? { preserveRevision: true } : {};
}

function previewSelectionGroup(group: DomEditSelection[], primary: DomEditSelection | null) {
  if (group.length > 1) return group;
  return primary ? [primary] : [];
}
