import { parseHTML } from "linkedom";
import { dirname, join, normalize } from "node:path/posix";
import { parseGsapScriptAcorn } from "@hyperframes/parsers/gsap-parser-acorn";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";

/**
 * Ari · review structure (D4 boundaries)
 *
 * Reads ONE frozen version statically: which composition files it contains,
 * where each is placed on the master timeline, and which motions each declares.
 *
 * ## Why the transform lives here
 *
 * `packages/studio/src/ari/sceneTime.ts` owns the master <-> scene-local
 * contract, but it derives its numbers from the clip manifest a RUNNING player
 * publishes. A frozen version is bytes on disk with no player, and
 * `@hyperframes/studio` depends on this package (never the other way), so the
 * same affine recurrence is applied here to the authored attributes instead.
 * The authored `data-start` is already parent-local, so no differencing of
 * absolute starts is needed — this is the same formula with a simpler input:
 *
 *     child anchor  A = A_parent + (start - P_parent) / R_parent
 *     child offset  P = data-playback-start
 *     child rate    R = R_parent * data-playback-rate
 *     local -> master:  m = A + (local - P) / R
 *
 * ## Refusal, never a guess
 *
 * A host whose timing attributes are not constant, whose rate is not positive,
 * or whose nesting cannot be resolved is recorded as a note and excluded. A
 * caller that sees notes must not claim complete coverage.
 */

/** One resolved placement of one composition file on the master timeline. */
export interface ReviewInstance {
  /** `""` for the root composition, otherwise the host id chain (`first>inner`). */
  readonly hostPath: string;
  readonly label: string;
  /** Master time at which this instance's local clock equals `playbackStart`. */
  readonly anchor: number;
  readonly playbackStart: number;
  readonly playbackRate: number;
  readonly visibleStart: number;
  readonly visibleEnd: number;
  /** Clamp ceiling in the instance's own local clock. */
  readonly sceneDuration: number;
}
export interface ReviewComposition {
  readonly file: string;
  readonly duration: number;
  readonly instances: ReviewInstance[];
  readonly motions: readonly GsapAnimation[];
  /** Motion parsing caveats that make static timing unreliable for this file. */
  readonly motionNotes: readonly string[];
}
export interface ReviewStructure {
  readonly compositions: Map<string, ReviewComposition>;
  /** Every refusal encountered while walking, in encounter order. */
  readonly notes: string[];
}
const EPSILON = 1e-9;
const MAX_DEPTH = 8;

function resolveScenePath(hostFile: string, relative: string): string | null {
  if (!relative || relative.startsWith("/") || /[\\?#:%]/.test(relative)) return null;
  const path = normalize(join(dirname(hostFile), relative));
  return path.startsWith("..") || !path.endsWith(".html") ? null : path;
}
function attribute(node: Element, key: string, fallback?: number): number | null {
  const raw = node.getAttribute(key);
  const value = raw === null ? fallback : Number(raw);
  return value === undefined || !Number.isFinite(value) ? null : value;
}
/** The inline timeline script, chosen the same way the file routes choose it. */
function motionsOf(document: Document): { motions: GsapAnimation[]; notes: string[] } {
  const scripts = [...document.querySelectorAll("script:not([src])")]
    .map((script) => script.textContent || "")
    .filter((content) => content.includes("gsap.timeline"));
  const script = scripts[0];
  if (!script) return { motions: [], notes: [] };
  if (scripts.length > 1)
    return { motions: [], notes: ["Tiedostossa on useampi aikajanaskripti."] };
  const parsed = parseGsapScriptAcorn(script);
  const notes: string[] = [];
  if (parsed.multipleTimelines) notes.push("Tiedostossa on useampi aikajana.");
  if (parsed.unsupportedTimelinePattern) notes.push("Aikajanan rakennetta ei voi lukea vakiona.");
  return { motions: parsed.animations, notes };
}
function readComposition(html: string, file: string) {
  const { document } = parseHTML(html);
  const roots = [...document.querySelectorAll("[data-composition-id]")].filter(
    (node) => !node.hasAttribute("data-composition-src"),
  );
  const root = roots[0];
  const duration = root ? attribute(root, "data-duration") : null;
  if (!root || duration === null || duration <= 0)
    return {
      error: `Kooste ${file} ei ilmoita vakiokestoa.`,
      root: null,
      duration: 0,
      motions: [],
      notes: [],
    };
  return { error: null, root, duration, ...motionsOf(document) };
}
/** One host element's own affine level, or the exact reason it cannot be read. */
function childInstance(node: Element, parent: ReviewInstance, hostPath: string, file: string) {
  const timing = {
    start: attribute(node, "data-start", 0),
    duration: attribute(node, "data-duration"),
    playbackStart: attribute(node, "data-playback-start", 0),
    rate: attribute(node, "data-playback-rate", 1),
  };
  const refusal = (reason: string) => ({
    note: `Kohtauksen ${hostPath} ${reason}`,
    instance: null,
  });
  if (Object.values(timing).some((value) => value === null))
    return refusal("ajoitus ei ole vakio.");
  const { start, duration, playbackStart, rate } = timing as Record<keyof typeof timing, number>;
  if (Math.min(duration, rate) <= 0 || Math.min(start, playbackStart) < 0)
    return refusal("ajoitus ei kelpaa.");
  const anchor = parent.anchor + (start - parent.playbackStart) / parent.playbackRate;
  const end = parent.anchor + (start + duration - parent.playbackStart) / parent.playbackRate;
  return {
    note: null,
    instance: {
      hostPath,
      label: node.getAttribute("data-label") || node.id || file,
      anchor,
      playbackStart,
      playbackRate: parent.playbackRate * rate,
      visibleStart: Math.max(parent.visibleStart, anchor),
      visibleEnd: Math.min(parent.visibleEnd, end),
      sceneDuration: 0,
    },
  };
}
/** Where this instance stops: its host window, or its own clamp, whichever is first. */
function place(instance: ReviewInstance, sceneDuration: number): ReviewInstance {
  return {
    ...instance,
    sceneDuration,
    visibleEnd: Math.min(
      instance.visibleEnd,
      instance.anchor + (sceneDuration - instance.playbackStart) / instance.playbackRate,
    ),
  };
}
/** Each placed child of one host, with every refusal appended to `notes`. */
function childrenOf(root: Element, placed: ReviewInstance, file: string, notes: string[]) {
  const children: { source: string; instance: ReviewInstance }[] = [];
  for (const node of root.querySelectorAll("[data-composition-src]")) {
    const source = resolveScenePath(file, node.getAttribute("data-composition-src") ?? "");
    const hostPath = [...(placed.hostPath ? [placed.hostPath] : []), node.id || "?"].join(">");
    if (!source) {
      notes.push(`Kohtauksen ${hostPath} lähde ei ole projektin HTML-tiedosto.`);
      continue;
    }
    const child = childInstance(node, placed, hostPath, source);
    if (child.instance === null) notes.push(child.note);
    else children.push({ source, instance: child.instance });
  }
  return children;
}
/**
 * Every composition reachable from `index.html`, with every placement resolved.
 * Files that are never placed are not part of the timeline and are not read.
 */
export function readReviewStructure(files: Record<string, Buffer>): ReviewStructure {
  const compositions = new Map<string, ReviewComposition>();
  const notes: string[] = [];
  const walk = (file: string, instance: ReviewInstance, depth: number, chain: string[]) => {
    if (depth > MAX_DEPTH || chain.includes(file))
      return notes.push(`Kohtausrakenne ${file} on liian syvä tai kehämäinen.`);
    const html = files[file]?.toString();
    if (html === undefined) return notes.push(`Kooste ${file} puuttuu jäädytetystä versiosta.`);
    const read = readComposition(html, file);
    if (read.root === null) return notes.push(read.error ?? "");
    const placed = place(instance, read.duration);
    const entry = compositions.get(file) ?? {
      file,
      duration: read.duration,
      instances: [],
      motions: read.motions,
      motionNotes: read.notes.map((note) => `${file}: ${note}`),
    };
    entry.instances.push(placed);
    compositions.set(file, entry);
    for (const child of childrenOf(read.root, placed, file, notes))
      walk(child.source, child.instance, depth + 1, [...chain, file]);
  };
  walk(
    "index.html",
    {
      hostPath: "",
      label: "Koko video",
      anchor: 0,
      playbackStart: 0,
      playbackRate: 1,
      visibleStart: 0,
      visibleEnd: Number.POSITIVE_INFINITY,
      sceneDuration: 0,
    },
    0,
    [],
  );
  for (const entry of compositions.values())
    entry.instances.sort((a, b) => a.visibleStart - b.visibleStart);
  return { compositions, notes };
}
/**
 * Local seconds -> master seconds for one instance, or `null` when that local
 * time is never reachable in it (before the playback start, past the scene's
 * own duration, or outside the visible host window).
 */
export function instanceLocalToMaster(instance: ReviewInstance, local: number): number | null {
  if (!Number.isFinite(local) || local < instance.playbackStart - EPSILON) return null;
  if (instance.sceneDuration > 0 && local > instance.sceneDuration + EPSILON) return null;
  const master = instance.anchor + (local - instance.playbackStart) / instance.playbackRate;
  if (master < instance.visibleStart - EPSILON || master > instance.visibleEnd + EPSILON)
    return null;
  return master;
}
