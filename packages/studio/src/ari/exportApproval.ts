/**
 * Ari · which source revisions a local approval still stands for (D7)
 *
 * The server owns the decision; this only carries it. An export is never
 * blocked — a missing approval changes what the receipt CALLS the file, not
 * whether it can be made, and an approved file is still a local draft.
 */
export async function readApprovedRevisions(projectId: string): Promise<string[]> {
  if (!projectId) return [];
  try {
    const response = await fetch(`/api/ari/projects/${encodeURIComponent(projectId)}/notebook`);
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== "object") return [];
    const rows = Reflect.get(result, "approvedRevisions");
    return Array.isArray(rows) ? rows.filter((row) => typeof row === "string") : [];
  } catch {
    // An unreadable notebook must not make an unapproved export look approved.
    return [];
  }
}
