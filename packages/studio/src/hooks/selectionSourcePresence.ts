import { normalizeTimelineCompositionSource } from "../components/editor/domEditingDom";

/**
 * A source write reloads the preview, and a nested scene mounts a beat after the
 * new document is queryable. The selection's single post-reload re-resolve used
 * to land inside that gap: `findElementForSelection` found nothing, the
 * selection was cleared, and because the publisher consumes exactly one refresh
 * per reload nothing ever retried. Every scene edit therefore ended with
 * "Ei valintaa" even though the element was back a moment later.
 *
 * These two helpers make the absence provable instead of assumed: an element is
 * only gone once the document actually holds its own file.
 */

/** Is the selection's own file mounted in this preview document? */
export function previewHasSourceContent(
  doc: Document | null | undefined,
  sourceFile: string | undefined,
  activeCompositionPath: string | null,
): boolean {
  if (!doc || doc.readyState !== "complete") return false;
  const body = doc.body;
  if (!body || body.childElementCount === 0) return false;
  if (!sourceFile || sourceFile === (activeCompositionPath ?? "index.html")) return true;
  const wanted = comparablePath(sourceFile);
  const hosts = body.querySelectorAll("[data-composition-file], [data-composition-src]");
  for (const host of hosts) {
    const raw =
      host.getAttribute("data-composition-file") ?? host.getAttribute("data-composition-src") ?? "";
    if (!raw) continue;
    if (comparablePath(normalizeTimelineCompositionSource(raw) ?? raw) === wanted) return true;
  }
  return false;
}

/** A host may name its file through a `/preview/` URL, with a cache-busting
 * query and a leading slash. Compare what is left of the path. */
function comparablePath(value: string): string {
  return value.split(/[?#]/)[0]?.replace(/^\/+/, "") ?? value;
}

/**
 * Wait, bounded, for that file to appear, and hand back the document it appeared
 * in — the iframe may swap documents while we wait. `null` means the wait ran out
 * or a newer selection superseded this one, and the caller may then believe the
 * element is gone.
 */
export async function waitForPreviewSourceContent({
  getDocument,
  sourceFile,
  activeCompositionPath,
  stale,
  timeoutMs = 3000,
  intervalMs = 100,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  getDocument: () => Document | null;
  sourceFile: string | undefined;
  activeCompositionPath: string | null;
  stale: () => boolean;
  timeoutMs?: number;
  intervalMs?: number;
  wait?: (ms: number) => Promise<void>;
}): Promise<Document | null> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (stale()) return null;
    const doc = getDocument();
    if (previewHasSourceContent(doc, sourceFile, activeCompositionPath)) return doc;
    await wait(intervalMs);
  }
  return null;
}
