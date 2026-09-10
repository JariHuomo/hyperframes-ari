/** Invalidate a removed source selection before consumers refetch its animations. */
export function clearRemovedHistorySelection(
  files: Record<string, { restored: string | null }> | undefined,
  sourceFile: string | undefined,
  clear: () => void,
) {
  if (sourceFile && files?.[sourceFile]?.restored === null) clear();
}
