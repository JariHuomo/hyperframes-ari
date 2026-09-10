/**
 * Ari · notebook value guards (D1, shared with D4 assessments)
 *
 * One set of bounded readers for everything stored in the project notebook.
 * The notebook and the review assessments recorded inside it share these so a
 * value can never be accepted by one path and refused by the other.
 */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Muistikirjan tiedot eivät kelpaa.");
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown, limit = 8000): string {
  if (typeof value !== "string" || value.length > limit)
    throw new Error("Muistikirjan teksti puuttuu tai on liian pitkä.");
  return value;
}
export function requiredText(value: unknown, limit = 8000) {
  const result = text(value, limit);
  if (!result.trim()) throw new Error("Täytä muistikirjan pakolliset tiedot.");
  return result;
}
export function choice<T extends string>(value: unknown, options: readonly T[]): T {
  const found = options.find((option) => option === value);
  if (!found) throw new Error("Muistikirjan valinta ei kelpaa.");
  return found;
}
export function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 500)
    throw new Error("Muistikirjan luettelo ei kelpaa.");
  return value;
}
export function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Muistikirjan valinta ei kelpaa.");
  return value;
}
