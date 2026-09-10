import type { TimelineElement } from "../player";

/**
 * The timeline can report itself ready while its element list is still the one
 * from before an undo, a redo or a save: the rebuild replaces the clips a beat
 * later. The selection sync ran inside that beat, found none of the selected
 * ids, and cleared the canvas selection for good — nothing re-runs it once the
 * store's own selection is gone. `ari:test:panel` failed on exactly that, about
 * one run in three, at "the selection survives undo and redo".
 *
 * Absence during a rebuild is not a deletion. This waits, bounded, for the list
 * to name the ids again; when it never does, the caller clears as before, so a
 * clip that really was removed still cannot keep the canvas pointed at it.
 */
export async function waitForTimelineIds({
  ids,
  read,
  cancelled,
  timeoutMs = 1500,
  intervalMs = 100,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  ids: string[];
  read: () => TimelineElement[];
  cancelled: () => boolean;
  timeoutMs?: number;
  intervalMs?: number;
  wait?: (ms: number) => Promise<void>;
}): Promise<TimelineElement[] | null> {
  if (ids.length === 0) return null;
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (cancelled()) return null;
    const found = findTimelineElements(ids, read());
    if (found) return found;
    await wait(intervalMs);
  }
  return null;
}

/** Every id present, in the order asked for — or null when one is missing. */
export function findTimelineElements(
  ids: string[],
  elements: TimelineElement[],
): TimelineElement[] | null {
  const found: TimelineElement[] = [];
  for (const id of ids) {
    const element = elements.find((item) => (item.key ?? item.id) === id);
    if (!element) return null;
    found.push(element);
  }
  return found;
}

/**
 * The element list to resolve a selection against. When the list names none of
 * the selected ids while the canvas still holds a selection, wait for the
 * rebuild first; when it never comes back, hand over the latest list and let the
 * caller clear.
 */
export async function timelineElementsForSelection({
  ids,
  elements,
  read,
  cancelled,
  hasCanvasSelection,
}: {
  ids: string[];
  elements: TimelineElement[];
  read: () => TimelineElement[];
  cancelled: () => boolean;
  hasCanvasSelection: boolean;
}): Promise<TimelineElement[]> {
  const listed = ids.some((id) => elements.some((item) => (item.key ?? item.id) === id));
  if (listed || !hasCanvasSelection || ids.length === 0) return elements;
  return (await waitForTimelineIds({ ids, read, cancelled })) ?? read();
}

/** Resolve each selected id that the list still names, in order. */
export async function resolveTimelineSelections<Selection>({
  ids,
  elements,
  build,
}: {
  ids: string[];
  elements: TimelineElement[];
  build: (element: TimelineElement) => Promise<Selection | null>;
}): Promise<{ selections: Selection[]; resolvableCount: number }> {
  const selections: Selection[] = [];
  let resolvableCount = 0;
  for (const id of ids) {
    const element = elements.find((item) => (item.key ?? item.id) === id);
    if (!element) continue;
    resolvableCount += 1;
    const selection = await build(element);
    if (selection) selections.push(selection);
  }
  return { selections, resolvableCount };
}
