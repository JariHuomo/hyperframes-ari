import type { DomEditSelection } from "../components/editor/domEditing";
import { getDomEditTargetKey } from "../components/editor/domEditing";

export function domEditSelectionsTargetSame(
  a: DomEditSelection | null,
  b: DomEditSelection | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // Assigning an id changes the selector, not the selected authored element.
  if (
    a.sourceFile === b.sourceFile &&
    (a.element === b.element ||
      (a.hfId && a.hfId === b.hfId && (a.selectorIndex ?? 0) === (b.selectorIndex ?? 0)))
  )
    return true;
  return getDomEditTargetKey(a) === getDomEditTargetKey(b);
}

export function domEditSelectionInGroup(
  group: DomEditSelection[],
  selection: DomEditSelection | null,
): boolean {
  if (!selection) return false;
  return group.some((entry) => domEditSelectionsTargetSame(entry, selection));
}

export function toggleDomEditGroupSelection(
  group: DomEditSelection[],
  selection: DomEditSelection,
): DomEditSelection[] {
  if (domEditSelectionInGroup(group, selection)) {
    return group.filter((entry) => !domEditSelectionsTargetSame(entry, selection));
  }
  return [...group, selection];
}

export function replaceDomEditGroupSelection(
  group: DomEditSelection[],
  selection: DomEditSelection,
): DomEditSelection[] {
  let replaced = false;
  const nextGroup = group.map((entry) => {
    if (!domEditSelectionsTargetSame(entry, selection)) return entry;
    replaced = true;
    return selection;
  });
  return replaced ? nextGroup : [...group, selection];
}

export function seedDomEditGroupWithSelection(
  group: DomEditSelection[],
  selection: DomEditSelection | null,
): DomEditSelection[] {
  if (!selection || domEditSelectionInGroup(group, selection)) return group;
  return [selection, ...group];
}
