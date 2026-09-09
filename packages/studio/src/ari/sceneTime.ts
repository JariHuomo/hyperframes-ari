/**
 * Ari · scene time (sprint S1)
 *
 * Pure master-time <-> scene-local-time transforms for nested compositions.
 * No DOM, no React, no bridge: everything is derived from the clip manifest the
 * player already publishes, so the same numbers can be produced in a unit test,
 * in a webmcp tool receipt and in the timeline UI.
 *
 * ## The formula this reproduces
 *
 * `packages/core/src/runtime/init.ts` (`seekStandaloneRegisteredTimelines`,
 * around lines 2846-2865) seeks every registered non-root timeline with:
 *
 *     sourceTime = playbackStart + max(0, master - hostStart) * playbackRate
 *     local      = clamp(sourceTime, 0, timelineDuration)
 *
 * `hostStart` there is `resolveStartForElement(node, 0)`, which is already an
 * ABSOLUTE master-time start: `startResolver.ts` adds every host offset while
 * walking up. That is why chaining through `compositionAncestors` below reduces
 * to exactly the runtime number whenever the ancestors are ordinary
 * (`playbackStart = 0`, `playbackRate = 1`) — the common case. Ancestors only
 * change the result when one of them retimes its child, and the runtime does
 * not multiply those rates itself; the chain here is what the sprint plan asks
 * for ("jokaisen tason playbackRate pitää kertoa ketjussa").
 *
 * ## Chaining
 *
 * Each level i is an affine map from master time m to that level's local clock,
 * valid inside its window:
 *
 *     t_i = P_i + (m - A_i) * R_i
 *
 * with the recurrence (level 0 is master itself: A=0, P=0, R=1)
 *
 *     a_i = start_i - start_(i-1)        // the authored, parent-local start
 *     A_i = A_(i-1) + (a_i - P_(i-1)) / R_(i-1)
 *     P_i = playbackStart_i
 *     R_i = R_(i-1) * playbackRate_i
 *
 * `a_i` is recovered by differencing the manifest's absolute starts because
 * `resolveStartForElement` adds host offsets unscaled, so the difference is the
 * element's own `data-start` value again.
 *
 * ## Refusal is a state, not an error
 *
 * A host whose start, duration, playback start or playback rate is not a finite
 * number is returned in `unsupported`, never silently defaulted to 0 — the UI
 * keeps showing "Avaa kohtaus" for it. One caveat that cannot be fixed here:
 * the runtime itself falls back to 0 for a `data-start` expression it cannot
 * resolve, so such a host reaches the manifest as a numeric 0 and is
 * indistinguishable from an authored 0 at this layer.
 *
 * Also note the manifest does not carry the child timeline's own duration, so
 * `sceneDuration` is the local end of the host's visible window
 * (`playbackStart + duration * playbackRate`). Inside the window that is the
 * same ceiling the runtime applies; outside the window nothing is visible
 * anyway, which is what `localToMaster` refuses on.
 */

/** Why a host cannot be transformed. Every reason is a refusal, not a failure. */
export type SceneTimeUnsupportedReason =
  | "missing-host-id"
  | "unresolved-host-start"
  | "unresolved-host-duration"
  | "unresolved-playback-start"
  | "unresolved-playback-rate";

/** The minimum manifest shape needed; `ClipManifestClip` satisfies it. */
export interface SceneTimeManifestClip {
  readonly id?: string | null;
  readonly label?: string;
  readonly start?: number;
  readonly duration?: number;
  readonly kind?: string;
  readonly compositionId?: string | null;
  readonly parentCompositionId?: string | null;
  readonly compositionSrc?: string | null;
  readonly compositionAncestors?: readonly string[];
  readonly playbackStart?: number;
  readonly playbackRate?: number;
}

/** The minimum manifest shape needed; `ClipManifest` satisfies it. */
export interface SceneTimeManifest {
  readonly clips?: readonly SceneTimeManifestClip[];
}

/** One host level between master time and the scene, outermost first. */
export interface SceneInstanceAncestor {
  readonly compositionId: string;
  readonly hostId: string | null;
  readonly label: string;
  /** Absolute master start as the manifest reports it. */
  readonly start: number;
  /** Window length in the parent's local time base. */
  readonly duration: number;
  readonly playbackStart: number;
  readonly playbackRate: number;
}

/** One resolved placement of one scene source file in the master timeline. */
export interface SceneInstance {
  /** Manifest clip id of the host element — the address S2/S4 pass as `instance`. */
  readonly hostId: string;
  readonly hostLabel: string;
  readonly compositionId: string | null;
  /** Normalised composition source path this instance plays. */
  readonly sourceFile: string;
  /** Master time at which the scene's local clock equals `playbackStart`. */
  readonly start: number;
  /** Visible length in master seconds (every host window intersected). */
  readonly duration: number;
  /** First master second that is actually on screen (`start` unless an ancestor trims it). */
  readonly visibleStart: number;
  /** Last master second that is actually on screen. */
  readonly visibleEnd: number;
  readonly playbackStart: number;
  /** Effective rate: every ancestor's rate multiplied into the host's own. */
  readonly playbackRate: number;
  /** Clamp ceiling in the scene's own local time. */
  readonly sceneDuration: number;
  readonly ancestors: readonly SceneInstanceAncestor[];
}

/** A host that matched the source file but cannot be transformed. */
export interface UnsupportedSceneInstance {
  readonly hostId: string | null;
  readonly hostLabel: string;
  readonly compositionId: string | null;
  readonly sourceFile: string;
  readonly reason: SceneTimeUnsupportedReason;
  /** Which level refused, for the receipt. `null` = the host itself. */
  readonly atCompositionId: string | null;
}

export interface SceneInstanceResolution {
  readonly instances: readonly SceneInstance[];
  readonly unsupported: readonly UnsupportedSceneInstance[];
}

/** Seconds below which two times are the same time. */
const EPSILON = 1e-9;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Reduce a composition source to a comparable path: absolute preview URLs, a
 * leading slash, a query string and the studio preview prefixes all go away.
 */
export function normalizeSceneSourcePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let path = trimmed;
  try {
    path = new URL(trimmed, "http://scene.invalid/").pathname;
  } catch {
    path = trimmed;
  }
  path = path.replace(/[?#].*$/, "").replace(/^\/+/, "");
  for (const marker of ["preview/comp/", "preview/"]) {
    const index = path.indexOf(marker);
    if (index < 0) continue;
    path = path.slice(index + marker.length).replace(/^\/+/, "");
    break;
  }
  return path || null;
}

/**
 * True when two normalised paths name the same file. A bare file name matches a
 * directory-qualified one (`title-card.html` is how a nested scene references a
 * sibling), but only on a whole segment boundary.
 */
function sourcePathsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.endsWith(`/${b}`)) return true;
  if (b.endsWith(`/${a}`)) return true;
  return false;
}

type LevelReading =
  | { readonly ok: true; readonly level: SceneInstanceAncestor }
  | { readonly ok: false; readonly reason: SceneTimeUnsupportedReason };

function positiveTime(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}
function nonnegativeTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function readLevel(clip: SceneTimeManifestClip, compositionId: string): LevelReading {
  if (!isFiniteNumber(clip.start)) return { ok: false, reason: "unresolved-host-start" };
  if (!positiveTime(clip.duration)) {
    return { ok: false, reason: "unresolved-host-duration" };
  }
  const playbackStart = clip.playbackStart ?? 0;
  if (!nonnegativeTime(playbackStart)) {
    return { ok: false, reason: "unresolved-playback-start" };
  }
  const playbackRate = clip.playbackRate ?? 1;
  if (!positiveTime(playbackRate)) {
    return { ok: false, reason: "unresolved-playback-rate" };
  }
  return {
    ok: true,
    level: {
      compositionId,
      hostId: clip.id ?? null,
      label: clip.label ?? compositionId,
      start: clip.start,
      duration: clip.duration,
      playbackStart,
      playbackRate,
    },
  };
}

/**
 * Ancestor host clips for a leaf, outermost first. The outermost composition id
 * is the root document, which has no host clip of its own; any level without a
 * clip row (an inlined inner root, say) is skipped, which is exact because a
 * level the manifest does not describe also has no timeline the runtime seeks.
 */
function collectAncestorClips(
  leaf: SceneTimeManifestClip,
  byCompositionId: ReadonlyMap<string, SceneTimeManifestClip>,
): Array<{ clip: SceneTimeManifestClip; compositionId: string }> {
  const chain: Array<{ clip: SceneTimeManifestClip; compositionId: string }> = [];
  for (const compositionId of leaf.compositionAncestors ?? []) {
    const clip = byCompositionId.get(compositionId);
    if (!clip || clip === leaf) continue;
    chain.push({ clip, compositionId });
  }
  return chain;
}

function sceneIdentity(leaf: SceneTimeManifestClip, sourceFile: string) {
  const compositionId = leaf.compositionId ?? null;
  const hostId = leaf.id ?? compositionId;
  return { hostId, hostLabel: leaf.label ?? hostId ?? sourceFile, compositionId };
}

function buildInstance(
  leaf: SceneTimeManifestClip,
  sourceFile: string,
  byCompositionId: ReadonlyMap<string, SceneTimeManifestClip>,
): SceneInstance | UnsupportedSceneInstance {
  const identity = sceneIdentity(leaf, sourceFile);
  const { hostId, hostLabel, compositionId } = identity;
  const refuse = (
    reason: SceneTimeUnsupportedReason,
    atCompositionId: string | null,
  ): UnsupportedSceneInstance => ({
    hostId,
    hostLabel,
    compositionId,
    sourceFile,
    reason,
    atCompositionId,
  });

  if (!hostId) return refuse("missing-host-id", null);

  const ancestors: SceneInstanceAncestor[] = [];
  for (const entry of collectAncestorClips(leaf, byCompositionId)) {
    const reading = readLevel(entry.clip, entry.compositionId);
    if (!reading.ok) return refuse(reading.reason, entry.compositionId);
    ancestors.push(reading.level);
  }
  const leafReading = readLevel(leaf, compositionId ?? hostId);
  if (!leafReading.ok) return refuse(leafReading.reason, compositionId);

  // Fold master -> level_1 -> ... -> leaf. See the recurrence in the header.
  let anchor = 0;
  let localAtAnchor = 0;
  let rate = 1;
  let previousStart = 0;
  let windowStart = Number.NEGATIVE_INFINITY;
  let windowEnd = Number.POSITIVE_INFINITY;

  for (const level of [...ancestors, leafReading.level]) {
    const authoredStart = level.start - previousStart;
    const levelAnchor = anchor + (authoredStart - localAtAnchor) / rate;
    const levelEnd = levelAnchor + level.duration / rate;
    windowStart = Math.max(windowStart, levelAnchor);
    windowEnd = Math.min(windowEnd, levelEnd);
    anchor = levelAnchor;
    localAtAnchor = level.playbackStart;
    rate = rate * level.playbackRate;
    previousStart = level.start;
  }

  const visibleStart = windowStart;
  const visibleEnd = Math.max(windowStart, windowEnd);
  const sceneDuration = localAtAnchor + Math.max(0, visibleEnd - anchor) * rate;

  return {
    hostId,
    hostLabel,
    compositionId,
    sourceFile,
    start: anchor,
    duration: Math.max(0, visibleEnd - visibleStart),
    visibleStart,
    visibleEnd,
    playbackStart: localAtAnchor,
    playbackRate: rate,
    sceneDuration,
    ancestors,
  };
}

function isUnsupported(
  value: SceneInstance | UnsupportedSceneInstance,
): value is UnsupportedSceneInstance {
  return "reason" in value;
}

/**
 * Every placement of `sourceFile` in the master timeline, plus every host that
 * matched but refused. Sorted by visible master start so "esiintymä 2/2" is a
 * stable label.
 */
export function resolveSceneInstances(
  manifest: SceneTimeManifest | null | undefined,
  sourceFile: string,
): SceneInstanceResolution {
  const wanted = normalizeSceneSourcePath(sourceFile);
  const clips = manifest?.clips ?? [];
  if (!wanted || clips.length === 0) return { instances: [], unsupported: [] };

  const byCompositionId = new Map<string, SceneTimeManifestClip>();
  for (const clip of clips) {
    if (clip.compositionId && !byCompositionId.has(clip.compositionId)) {
      byCompositionId.set(clip.compositionId, clip);
    }
  }

  const instances: SceneInstance[] = [];
  const unsupported: UnsupportedSceneInstance[] = [];
  for (const clip of clips) {
    const candidate = normalizeSceneSourcePath(clip.compositionSrc);
    if (!candidate || !sourcePathsMatch(candidate, wanted)) continue;
    const built = buildInstance(clip, candidate, byCompositionId);
    if (isUnsupported(built)) unsupported.push(built);
    else instances.push(built);
  }

  instances.sort((a, b) => a.visibleStart - b.visibleStart || a.hostId.localeCompare(b.hostId));
  return { instances, unsupported };
}

/**
 * Master time -> the scene's own clock, exactly as the runtime seeks it. Defined
 * for every master time: before the window it returns the scene's first frame,
 * which is what the runtime leaves the child timeline parked on.
 */
export function masterToLocal(instance: SceneInstance, masterSeconds: number): number {
  if (!Number.isFinite(masterSeconds)) return instance.playbackStart;
  const sourceTime =
    instance.playbackStart + Math.max(0, masterSeconds - instance.start) * instance.playbackRate;
  const ceiled =
    instance.sceneDuration > 0 ? Math.min(instance.sceneDuration, sourceTime) : sourceTime;
  return Math.max(0, ceiled);
}

/**
 * The scene's own clock -> master time, or `null` when that local time is never
 * on screen in this instance: before `playbackStart`, past the scene duration,
 * or outside the host window this instance is visible in.
 */
export function localToMaster(instance: SceneInstance, localSeconds: number): number | null {
  if (!Number.isFinite(localSeconds)) return null;
  if (localSeconds < -EPSILON) return null;
  if (localSeconds < instance.playbackStart - EPSILON) return null;
  if (instance.sceneDuration > 0 && localSeconds > instance.sceneDuration + EPSILON) return null;
  if (instance.playbackRate <= 0) return null;

  const master = instance.start + (localSeconds - instance.playbackStart) / instance.playbackRate;
  if (master < instance.visibleStart - EPSILON) return null;
  if (master > instance.visibleEnd + EPSILON) return null;
  return master;
}
