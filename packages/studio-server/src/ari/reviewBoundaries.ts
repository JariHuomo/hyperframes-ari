import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import {
  instanceLocalToMaster,
  readReviewStructure,
  type ReviewComposition,
  type ReviewInstance,
} from "./reviewStructure.js";

/**
 * Ari · changed-motion boundaries (D4)
 *
 * Compares two frozen versions statically and says exactly which motion edges a
 * reviewer has to look at, in master time, and from WHICH version's video each
 * sample must be taken. Nothing here renders or reads a video; the package
 * producer turns these times into frames.
 *
 * Rules this module refuses to bend:
 * - A motion that only exists in the previous version is still shown; its
 *   samples come from the previous version's video, never from the current one.
 * - A boundary outside the video, outside its instance's visible window, or
 *   landing on a frame another boundary already claims is MARKED, never dropped.
 * - Any structure that cannot be read as constant timing downgrades coverage to
 *   `changed-motion-boundaries-partial` with the exact reason. Coverage is never
 *   claimed complete on a guess.
 */

export type ReviewCoverage =
  | "whole-video-first-last-only"
  | "first-version"
  | "changed-motion-boundaries"
  | "changed-motion-boundaries-partial";
export type ReviewChange = "added" | "changed" | "removed";
export interface ReviewBoundarySample {
  readonly position: "before" | "at" | "after";
  readonly frame: number;
  readonly time: number;
  /** `reused` marks a frame another sample already captured from the same video. */
  readonly status: "captured" | "reused" | "outside-video";
  readonly path: string | null;
}
export interface ReviewBoundary {
  readonly motionId: string;
  readonly sourceFile: string;
  readonly target: string;
  readonly change: ReviewChange;
  readonly edge: "start" | "end";
  /** The frozen version this boundary is read from and sampled in. */
  readonly versionId: string;
  readonly instance: { hostPath: string; label: string; index: number; count: number };
  readonly localTime: number;
  readonly masterTime: number;
  /** False when the edge is never on screen in this instance; still reported. */
  readonly withinInstance: boolean;
  samples: ReviewBoundarySample[];
}
export interface ReviewBoundaryPlan {
  readonly coverage: ReviewCoverage;
  readonly notes: string[];
  readonly boundaries: ReviewBoundary[];
  /** Version ids whose video the samples need, in render order. */
  readonly sampledVersions: string[];
}
export interface FrozenSide {
  readonly versionId: string;
  readonly files: Record<string, Buffer>;
}
/** Above this the reviewer is not reading boundaries any more; coverage says so. */
const MAX_BOUNDARIES = 60;

function fingerprint(motion: GsapAnimation): string {
  return JSON.stringify([
    motion.targetSelector,
    motion.method,
    motion.position,
    motion.resolvedStart ?? null,
    motion.duration ?? null,
    motion.ease ?? null,
    motion.properties,
    motion.fromProperties ?? null,
    motion.keyframes ?? null,
  ]);
}
function motionStart(motion: GsapAnimation): number | null {
  const value =
    motion.resolvedStart ?? (typeof motion.position === "number" ? motion.position : null);
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}
function byId(composition: ReviewComposition | undefined) {
  return new Map((composition?.motions ?? []).map((motion) => [motion.id, motion]));
}
function edgesOf(motion: GsapAnimation, notes: string[], file: string) {
  const start = motionStart(motion);
  if (start === null) {
    notes.push(`Liikkeen ${file}#${motion.id} alkuaika ei ole vakio.`);
    return [];
  }
  if (motion.hasUnresolvedKeyframes || motion.hasUnresolvedSelector)
    notes.push(`Liike ${file}#${motion.id} sisältää ajonaikaisia arvoja.`);
  const duration = Number.isFinite(motion.duration) ? motion.duration! : 0;
  const edges: { edge: "start" | "end"; local: number }[] = [{ edge: "start", local: start }];
  if (duration > 0) edges.push({ edge: "end", local: start + duration });
  return edges;
}
function boundariesFor(
  motion: GsapAnimation,
  change: ReviewChange,
  composition: ReviewComposition,
  versionId: string,
  notes: string[],
): ReviewBoundary[] {
  const result: ReviewBoundary[] = [];
  const instances = composition.instances;
  if (!instances.length) notes.push(`Koostetta ${composition.file} ei ole sijoitettu aikajanalle.`);
  for (const [index, instance] of instances.entries()) {
    for (const { edge, local } of edgesOf(motion, notes, composition.file)) {
      const master = instanceLocalToMaster(instance, local);
      result.push({
        motionId: motion.id,
        sourceFile: composition.file,
        target: motion.targetSelector,
        change,
        edge,
        versionId,
        instance: {
          hostPath: instance.hostPath,
          label: instance.label,
          index: index + 1,
          count: instances.length,
        },
        localTime: local,
        masterTime: master ?? clampedMaster(instance, local),
        withinInstance: master !== null,
        samples: [],
      });
    }
  }
  return result;
}
/** The unclamped affine image, so an off-window edge still reports a real time. */
function clampedMaster(instance: ReviewInstance, local: number): number {
  return instance.anchor + (local - instance.playbackStart) / instance.playbackRate;
}
/**
 * Frame indices for one boundary. `frame = round(time * fps)`; the sample before
 * and after are that frame minus and plus one. Frames outside `[0, frames)` are
 * reported with `outside-video` and no image.
 */
export function boundaryFrames(
  masterTime: number,
  fps: number,
): { position: ReviewBoundarySample["position"]; frame: number }[] {
  const centre = Math.round(masterTime * fps);
  return (["before", "at", "after"] as const).map((position, offset) => ({
    position,
    frame: centre + offset - 1,
  }));
}
export function isInsideVideo(frame: number, frames: number): boolean {
  return Number.isInteger(frame) && frame >= 0 && frame < frames;
}
/** Every boundary one composition file contributes, from whichever version owns it. */
function diffComposition(
  sides: { now?: ReviewComposition; before?: ReviewComposition },
  versions: { current: string; previous: string },
  notes: string[],
): ReviewBoundary[] {
  const { now, before } = sides;
  notes.push(
    ...(now?.motionNotes ?? []),
    ...(before?.motionNotes ?? []).map((note) => `Edellinen: ${note}`),
  );
  const nowMotions = byId(now);
  const beforeMotions = byId(before);
  const written = now
    ? [...nowMotions.values()].flatMap((motion) => {
        const old = beforeMotions.get(motion.id);
        if (old && fingerprint(old) === fingerprint(motion)) return [];
        return boundariesFor(motion, old ? "changed" : "added", now, versions.current, notes);
      })
    : [];
  const gone = before
    ? [...beforeMotions.values()].flatMap((motion) =>
        nowMotions.has(motion.id)
          ? []
          : boundariesFor(motion, "removed", before, versions.previous, notes),
      )
    : [];
  return [...written, ...gone];
}
function compareOrder(a: ReviewBoundary, b: ReviewBoundary) {
  return (
    a.masterTime - b.masterTime ||
    a.motionId.localeCompare(b.motionId) ||
    a.edge.localeCompare(b.edge)
  );
}
/**
 * Plan every boundary a reviewer must see between `previous` and `current`.
 * Without a previous version the plan is empty and coverage says `first-version`.
 */
export function planReviewBoundaries(
  current: FrozenSide,
  previous: FrozenSide | null,
): ReviewBoundaryPlan {
  const currentStructure = readReviewStructure(current.files);
  const notes = [...currentStructure.notes];
  const partial = (): ReviewCoverage =>
    notes.length ? "changed-motion-boundaries-partial" : "changed-motion-boundaries";
  if (!previous)
    return {
      coverage: notes.length ? "changed-motion-boundaries-partial" : "first-version",
      notes,
      boundaries: [],
      sampledVersions: [current.versionId],
    };
  const previousStructure = readReviewStructure(previous.files);
  notes.push(...previousStructure.notes.map((note) => `Edellinen versio: ${note}`));
  const versions = { current: current.versionId, previous: previous.versionId };
  const files = new Set([
    ...currentStructure.compositions.keys(),
    ...previousStructure.compositions.keys(),
  ]);
  const boundaries = [...files]
    .sort()
    .flatMap((file) =>
      diffComposition(
        {
          now: currentStructure.compositions.get(file),
          before: previousStructure.compositions.get(file),
        },
        versions,
        notes,
      ),
    )
    .sort(compareOrder);
  const kept = boundaries.slice(0, MAX_BOUNDARIES);
  if (boundaries.length > MAX_BOUNDARIES)
    notes.push(
      `Muuttuneita rajoja oli ${boundaries.length}; paketissa on ensimmäiset ${MAX_BOUNDARIES}.`,
    );
  const sampledVersions = [current.versionId];
  if (kept.some((boundary) => boundary.versionId === previous.versionId))
    sampledVersions.push(previous.versionId);
  return { coverage: partial(), notes, boundaries: kept, sampledVersions };
}
