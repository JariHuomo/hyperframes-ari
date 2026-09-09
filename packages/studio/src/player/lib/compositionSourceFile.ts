/**
 * Put the scene's SOURCE FILE back on the clip manifest.
 *
 * The compiler inlines every sub-composition before the preview runs, and while
 * doing so it renames the host's `data-composition-src` to
 * `data-composition-file` (`core/src/compiler/inlineSubCompositions.ts:435`).
 * The runtime's manifest builder only reads `data-composition-src`
 * (`core/src/runtime/timeline.ts:411`), so in the studio preview every host's
 * `compositionSrc` arrives as `null` — the attribute it is derived from no
 * longer exists by then.
 *
 * That silently disabled everything keyed on the scene file: the S2 instance
 * list, the S3 dual times, the S4 `timeBasis`/`instance` conversion and the S5
 * fit check all resolve a scene BY its source path, so they found zero
 * placements for a project whose scenes were plainly on screen. Unit tests hand
 * their own manifests in, which is why the gap only showed in a real browser.
 *
 * The repair reads the surviving attribute off the preview document and fills
 * the field in, without touching the core runtime or the render path. It is
 * additive: a clip that already carries a `compositionSrc` is returned as-is.
 */

import type { ClipManifestClip } from "./playbackTypes";

/** The attribute the runtime reads, then the one the inliner leaves behind. */
const SOURCE_ATTRIBUTES = ["data-composition-src", "data-composition-file"] as const;

function readSource(element: Element | null): string | null {
  for (const attribute of SOURCE_ATTRIBUTES) {
    const value = element?.getAttribute(attribute)?.trim();
    if (value) return value;
  }
  return null;
}

function findHost(doc: Document, clip: ClipManifestClip): Element | null {
  // `data-hf-id` first: it is the id the manifest reports and the address every
  // Ari tool passes as `instance`. The composition id is the fallback for a
  // host whose stable id came from somewhere else.
  const candidates = [clip.id, clip.compositionId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const value of candidates) {
    const byHfId = doc.querySelector(`[data-hf-id="${CSS.escape(value)}"]`);
    if (byHfId) return byHfId;
  }
  for (const value of candidates) {
    const byCompositionId = doc.querySelector(`[data-composition-id="${CSS.escape(value)}"]`);
    if (byCompositionId) return byCompositionId;
  }
  return null;
}

/**
 * Every clip, with `compositionSrc` filled in from the preview DOM where the
 * runtime could not supply it. Returns the input array untouched when there is
 * nothing to add, so an unchanged manifest keeps its identity.
 */
export function withCompositionSourceFiles(
  clips: readonly ClipManifestClip[],
  doc: Document | null,
): ClipManifestClip[] {
  if (!doc) return [...clips];
  let changed = false;
  const filled = clips.map((clip) => {
    if (clip.compositionSrc) return clip;
    const source = readSource(findHost(doc, clip));
    if (!source) return clip;
    changed = true;
    return { ...clip, compositionSrc: source };
  });
  return changed ? filled : [...clips];
}
