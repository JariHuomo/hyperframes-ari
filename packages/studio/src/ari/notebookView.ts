export function notebookObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Muistikirjan vastaus ei kelpaa.");
  return Object.fromEntries(Object.entries(value));
}
export function notebookRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(notebookObject) : [];
}
export function notebookResult(value: unknown) {
  const result = notebookObject(value);
  if (result.ok !== true)
    throw new Error(String(result.reason ?? "Muistikirjan toiminto epäonnistui."));
  return result;
}
