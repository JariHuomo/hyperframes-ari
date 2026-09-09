/**
 * Ari · scene instances and the two time bases (sprint S2, S4, S5).
 *
 * `sceneTime.ts` is the pure arithmetic; this module is the tool-facing layer
 * on top of it: it decides WHICH placement of a scene a call means, converts
 * between master time and the scene's own clock before anything is written,
 * validates that the motion is actually on screen, and formats the Finnish
 * refusals. It lives beside the animation tools rather than inside them so
 * `animationTools.ts` stays under the 600-line cap.
 *
 * Three rules this module exists to keep:
 *
 * 1. **Never guess an instance.** One placement auto-selects; several require an
 *    explicit `instance` (the host clip's hfId). The refusal lists them with
 *    their master windows so the next call can be exact.
 * 2. **Convert before the write, not after.** `deps.addAnimation` writes into the
 *    scene's own source file, so a master-time `position` has to become a local
 *    one first. The receipt then carries both numbers, because they differ.
 * 3. **Refusal is a state.** A host whose start is not a resolved number is
 *    unsupported, not broken: the UI keeps offering "Avaa kohtaus".
 *
 * Every number here comes from the clip manifest or the sceneTime formula.
 * Nothing is parsed out of prose.
 */

import {
  localToMaster,
  masterToLocal,
  normalizeSceneSourcePath,
  resolveSceneInstances,
  type SceneInstance,
  type SceneTimeManifestClip,
  type SceneTimeUnsupportedReason,
} from "../../ari/sceneTime";
import { toolFailure, type ToolFailure } from "../toolResult";

/** Which clock a `position` or `time` argument is expressed in. */
export type SceneTimeBasis = "master" | "scene";

const TIME_BASES: readonly SceneTimeBasis[] = ["master", "scene"];

/** Seconds below which two times are the same time. Matches `sceneTime`. */
const EPSILON = 1e-9;

/** Manifest and active-composition access. Both optional so existing callers compile. */
export interface SceneToolDeps {
  /** The player store's `clipManifest`, or null before the preview publishes one. */
  getClipManifest?: () => readonly SceneTimeManifestClip[] | null;
  getCompositionPath: () => string | null;
}

/** Only the field this module needs from a selection. */
export interface SceneSelectionLike {
  sourceFile?: string | null;
}

export interface SceneInstanceSummary {
  /** Pass this back as `instance`. */
  hostId: string;
  label: string;
  /** First master second this placement is on screen. */
  masterStart: number;
  /** Last master second this placement is on screen. */
  masterEnd: number;
  playbackStart: number;
  /** Every ancestor's rate multiplied into the host's own. */
  playbackRate: number;
  /** Clamp ceiling in the scene's own clock. */
  sceneDuration: number;
}

export interface SceneUnsupportedSummary {
  hostId: string | null;
  label: string;
  reason: SceneTimeUnsupportedReason;
  /** The same reason in Finnish, ready to show. */
  detail: string;
}

export interface SceneDescription {
  sourceFile: string;
  instances: SceneInstanceSummary[];
  unsupported: SceneUnsupportedSummary[];
  /** How many placements one edit to this file changes. */
  affectsInstances: number;
}

/** What a write receipt says about the scene it landed in. */
export interface SceneReceipt {
  sourceFile: string;
  /** The chosen host clip id. */
  instance: string;
  instanceLabel: string;
  /** 1-based, ordered by master start: "esiintymä 2/2". */
  instanceIndex: number;
  instanceCount: number;
  /** A shared scene source is edited once and plays everywhere. */
  affectsInstances: number;
  timeBasis: SceneTimeBasis;
  /** What was written into the scene's own source file. */
  localPosition: number;
  /** Where that lands on the master timeline. */
  masterPosition: number;
  playbackRate: number;
}

const UNSUPPORTED_DETAIL: Record<SceneTimeUnsupportedReason, string> = {
  "missing-host-id": "kohtauksen esiintymällä ei ole tunnistetta",
  "unresolved-host-start": "kohtauksen alkuaika ei ratkea numerona",
  "unresolved-host-duration": "kohtauksen kesto ei ratkea numerona",
  "unresolved-playback-start": "kohtauksen toiston aloituskohta ei ratkea numerona",
  "unresolved-playback-rate": "kohtauksen toistonopeus ei ratkea numerona",
};

const OPEN_SCENE_HINT = "Avaa kohtaus omalle aikajanalleen.";

/** Finnish seconds: two decimals, decimal comma. */
export function formatSceneSeconds(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Kill float noise so a receipt reads `1`, not `0.9999999999999998`. */
function roundSeconds(value: number): number {
  return Number(value.toFixed(6));
}

function summarize(instance: SceneInstance): SceneInstanceSummary {
  return {
    hostId: instance.hostId,
    label: instance.hostLabel,
    masterStart: roundSeconds(instance.visibleStart),
    masterEnd: roundSeconds(instance.visibleEnd),
    playbackStart: instance.playbackStart,
    playbackRate: instance.playbackRate,
    sceneDuration: roundSeconds(instance.sceneDuration),
  };
}

function manifestOf(deps: SceneToolDeps): { clips: readonly SceneTimeManifestClip[] } {
  return { clips: deps.getClipManifest?.() ?? [] };
}

/** Human label for one placement: `title-host-b (pääajassa 4,00–8,00 s)`. */
function describeInstance(instance: SceneInstance): string {
  return `${instance.hostId} (pääajassa ${formatSceneSeconds(instance.visibleStart)}–${formatSceneSeconds(instance.visibleEnd)} s)`;
}

/** Every placement of one scene source file, plus every host that refused. */
export function describeScene(deps: SceneToolDeps, sourceFile: string): SceneDescription | null {
  const normalized = normalizeSceneSourcePath(sourceFile);
  if (!normalized) return null;
  const { instances, unsupported } = resolveSceneInstances(manifestOf(deps), sourceFile);
  return {
    sourceFile: normalized,
    instances: instances.map(summarize),
    unsupported: unsupported.map((entry) => ({
      hostId: entry.hostId,
      label: entry.hostLabel,
      reason: entry.reason,
      detail: UNSUPPORTED_DETAIL[entry.reason],
    })),
    affectsInstances: instances.length,
  };
}

/**
 * True when a selection's source file is a scene rather than the composition
 * currently open on the timeline. That is the whole nested/root discriminant:
 * it is a path comparison, never an inference about the element.
 */
export function isNestedSource(deps: SceneToolDeps, selection: SceneSelectionLike): boolean {
  const active = normalizeSceneSourcePath(deps.getCompositionPath() ?? "index.html");
  const source = normalizeSceneSourcePath(selection.sourceFile ?? "") ?? active;
  return Boolean(source && active && source !== active);
}

export function sceneSourceFile(deps: SceneToolDeps, selection: SceneSelectionLike): string {
  return (
    normalizeSceneSourcePath(selection.sourceFile ?? "") ??
    normalizeSceneSourcePath(deps.getCompositionPath() ?? "index.html") ??
    "index.html"
  );
}

function readTimeBasis(value: unknown): SceneTimeBasis | ToolFailure | undefined {
  if (value === undefined) return undefined;
  const found = TIME_BASES.find((candidate) => candidate === value);
  return found ?? toolFailure("invalid", `timeBasis on oltava ${TIME_BASES.join(" tai ")}`);
}

function readInstanceId(value: unknown): string | null | ToolFailure {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    return toolFailure("invalid", "instance on oltava kohtauksen esiintymän hfId");
  }
  return value;
}

function isFailure(value: unknown): value is ToolFailure {
  return typeof value === "object" && value !== null && (value as ToolFailure).ok === false;
}

/** The instance the caller named, or the only one, or a refusal that lists them. */
function chooseInstance(
  sourceFile: string,
  instances: readonly SceneInstance[],
  instanceId: string | null,
): SceneInstance | ToolFailure {
  const list = instances.map(describeInstance).join(", ");
  if (instanceId) {
    const found = instances.find((instance) => instance.hostId === instanceId);
    return (
      found ??
      toolFailure(
        "invalid",
        `kohtauksella ${sourceFile} ei ole esiintymää ${instanceId}`,
        `Esiintymät: ${list}.`,
      )
    );
  }
  if (instances.length === 1) return instances[0]!;
  return toolFailure(
    "invalid",
    `kohtauksella ${sourceFile} on ${instances.length} esiintymää, joten valitse instance`,
    `Esiintymät: ${list}.`,
  );
}

/**
 * S5: the motion has to fit the scene's own clock AND stay inside the host's
 * visible window — `playbackStart` and the effective rate included. A tween that
 * ends after the host stops showing the scene is authored but never seen.
 */
export function validateSceneFit(
  instance: SceneInstance,
  localPosition: number,
  duration: number,
): ToolFailure | null {
  if (localPosition < instance.playbackStart - EPSILON) {
    return toolFailure(
      "invalid",
      `liike alkaa ennen kohtauksen näkyvää alkua (kohtaus alkaa ${formatSceneSeconds(instance.playbackStart)} s)`,
    );
  }
  const localEnd = localPosition + Math.max(0, duration);
  const tooLate =
    (instance.sceneDuration > 0 && localEnd > instance.sceneDuration + EPSILON) ||
    localToMaster(instance, localEnd) === null;
  if (tooLate) {
    return toolFailure(
      "invalid",
      `liike ei näy pääajassa (kohtaus loppuu ${formatSceneSeconds(instance.sceneDuration)} s)`,
    );
  }
  return null;
}

export interface SceneWriteRequest {
  timeBasis?: unknown;
  instance?: unknown;
  /** The position as supplied, in the requested basis. */
  position: number;
  /** Motion length in the scene's clock; 0 for `set`. */
  duration: number;
  /** Master duration, used only for the root-composition fit check. */
  compositionDuration: number;
}

export interface SceneWriteOk {
  ok: true;
  /** Null for a root-composition target: there is nothing to convert. */
  scene: SceneReceipt | null;
  /** The position to write, when it differs from what the caller supplied. */
  localPosition: number | null;
}

export type SceneWriteResolution = SceneWriteOk | ToolFailure;

const ROOT_ONLY_BASIS = toolFailure("invalid", "timeBasis scene koskee vain sisäkkäistä kohtausta");

/**
 * Decide the instance and the time base for one animation write, BEFORE the
 * provider is called. Returns the local position to write plus the receipt, or
 * a Finnish refusal.
 */
function resolveRootWrite(
  request: SceneWriteRequest,
  basis: SceneTimeBasis | undefined,
  instanceId: string | null,
): SceneWriteResolution {
  if (instanceId) {
    return toolFailure("invalid", "instance koskee vain sisäkkäistä kohtausta");
  }
  if (basis === "scene") return ROOT_ONLY_BASIS;
  if (request.position + request.duration > request.compositionDuration) {
    return toolFailure("invalid", "motion must fit within the composition");
  }
  return { ok: true, scene: null, localPosition: null };
}

export function resolveSceneWrite(
  deps: SceneToolDeps,
  selection: SceneSelectionLike,
  request: SceneWriteRequest,
): SceneWriteResolution {
  const basis = readTimeBasis(request.timeBasis);
  if (isFailure(basis)) return basis;
  const instanceId = readInstanceId(request.instance);
  if (isFailure(instanceId)) return instanceId;

  const sourceFile = sceneSourceFile(deps, selection);
  if (!isNestedSource(deps, selection)) return resolveRootWrite(request, basis, instanceId);

  const effectiveBasis: SceneTimeBasis = basis ?? "scene";
  const { instances, unsupported } = resolveSceneInstances(manifestOf(deps), sourceFile);
  if (instances.length === 0) {
    if (unsupported.length > 0) {
      return toolFailure(
        "invalid",
        `kohtauksen ${sourceFile} aikaa ei voi muuntaa: ${UNSUPPORTED_DETAIL[unsupported[0]!.reason]}`,
        OPEN_SCENE_HINT,
      );
    }
    // No manifest row at all: the scene's own clock is still writable exactly as
    // before this sprint, but nothing can be expressed in master time.
    if (effectiveBasis === "master" || instanceId) {
      return toolFailure(
        "invalid",
        `kohtaukselle ${sourceFile} ei löydy esiintymää aikajanalta`,
        OPEN_SCENE_HINT,
      );
    }
    return { ok: true, scene: null, localPosition: null };
  }

  const chosen = chooseInstance(sourceFile, instances, instanceId);
  if (isFailure(chosen)) return chosen;

  const localPosition = writeLocalPosition(chosen, effectiveBasis, request.position);
  if (isFailure(localPosition)) return localPosition;

  const fit = validateSceneFit(chosen, localPosition, request.duration);
  if (fit) return fit;

  const master = localToMaster(chosen, localPosition);
  if (master === null) {
    return toolFailure(
      "invalid",
      `liike ei näy pääajassa (kohtaus loppuu ${formatSceneSeconds(chosen.sceneDuration)} s)`,
    );
  }
  const index = instances.findIndex((instance) => instance.hostId === chosen.hostId);
  return {
    ok: true,
    localPosition,
    scene: {
      sourceFile,
      instance: chosen.hostId,
      instanceLabel: chosen.hostLabel,
      instanceIndex: index + 1,
      instanceCount: instances.length,
      affectsInstances: instances.length,
      timeBasis: effectiveBasis,
      localPosition,
      masterPosition: roundSeconds(master),
      playbackRate: chosen.playbackRate,
    },
  };
}

/** Every placement in the manifest, whatever its source file. */
function allInstances(deps: SceneToolDeps): SceneInstance[] {
  const manifest = manifestOf(deps);
  const seen = new Set<string>();
  const found: SceneInstance[] = [];
  for (const clip of manifest.clips) {
    const source = normalizeSceneSourcePath(clip.compositionSrc);
    if (!source || seen.has(source)) continue;
    seen.add(source);
    found.push(...resolveSceneInstances(manifest, source).instances);
  }
  return found;
}

/** Look one placement up by the host id an agent passed as `instance`. */
export function findSceneInstance(deps: SceneToolDeps, hostId: string): SceneInstance | null {
  return allInstances(deps).find((instance) => instance.hostId === hostId) ?? null;
}

export interface SceneSeekOk {
  ok: true;
  /** Where the playhead should go, always in master time. */
  masterTime: number;
  instance: SceneInstance | null;
}

/**
 * S4 for `studio_seek`. The player only understands master time, so a scene time
 * is converted here; frame rounding then happens in master time, which is why
 * the receipt reports both numbers rather than echoing the request.
 */
export function resolveSceneSeek(
  deps: SceneToolDeps,
  input: { time: number; timeBasis?: unknown; instance?: unknown },
): SceneSeekOk | ToolFailure {
  const basis = readTimeBasis(input.timeBasis);
  if (isFailure(basis)) return basis;
  const instanceId = readInstanceId(input.instance);
  if (isFailure(instanceId)) return instanceId;
  if (!instanceId) {
    if (basis === "scene") {
      return toolFailure(
        "invalid",
        "timeBasis scene vaatii instance-kentän",
        "studio_look listaa kohtauksen esiintymät.",
      );
    }
    return { ok: true, masterTime: input.time, instance: null };
  }
  const instance = findSceneInstance(deps, instanceId);
  if (!instance) {
    return toolFailure(
      "invalid",
      `esiintymää ${instanceId} ei löydy aikajanalta`,
      "studio_look listaa kohtauksen esiintymät.",
    );
  }
  if (basis !== "scene") return { ok: true, masterTime: input.time, instance };
  const master = localToMaster(instance, input.time);
  if (master === null) {
    return toolFailure(
      "invalid",
      `kohtauksen aika ${formatSceneSeconds(input.time)} s ei näy esiintymässä ${instanceId} (kohtaus loppuu ${formatSceneSeconds(instance.sceneDuration)} s)`,
    );
  }
  return { ok: true, masterTime: roundSeconds(master), instance };
}

/** Both times for a landed playhead, re-derived rather than echoed. */
export function sceneSeekReceipt(
  instance: SceneInstance,
  masterTime: number,
): { sourceFile: string; instance: string; localPosition: number; masterPosition: number } {
  return {
    sourceFile: instance.sourceFile,
    instance: instance.hostId,
    localPosition: roundSeconds(masterToLocal(instance, masterTime)),
    masterPosition: roundSeconds(masterTime),
  };
}

/**
 * Which instance the human picked in the Ari panel, per scene source file.
 *
 * Panel state only: the tools never read it, so a human's click can never
 * silently redirect an agent's write. `studio_select` writes here so the panel
 * and the agent agree on what is being looked at.
 */
class SceneInstanceChoice {
  private chosen: Readonly<Record<string, string>> = {};
  private listeners = new Set<() => void>();

  getSnapshot = (): Readonly<Record<string, string>> => this.chosen;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  forSource = (sourceFile: string | null | undefined): string | null => {
    const key = normalizeSceneSourcePath(sourceFile ?? "");
    return key ? (this.chosen[key] ?? null) : null;
  };

  choose(sourceFile: string, hostId: string | null): void {
    const key = normalizeSceneSourcePath(sourceFile);
    if (!key) return;
    const next = { ...this.chosen };
    if (hostId) next[key] = hostId;
    else delete next[key];
    this.chosen = next;
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.chosen = {};
    for (const listener of this.listeners) listener();
  }
}

export const sceneInstanceChoice = new SceneInstanceChoice();

export const SCENE_TIME_BASIS_SCHEMA = {
  type: "string",
  enum: TIME_BASES,
  description:
    "Which clock position is in: master (the whole composition) or scene (the nested scene's own clock). Defaults to scene for a nested target and master for a root one.",
} as const;

export const SCENE_INSTANCE_SCHEMA = {
  type: "string",
  description:
    "The host hfId of one placement of a nested scene, from studio_look scenes[]. Required when the scene appears more than once; never guessed.",
} as const;

function writeLocalPosition(
  chosen: SceneInstance,
  basis: SceneTimeBasis,
  position: number,
): number | ToolFailure {
  let localPosition: number;
  if (basis === "master") {
    if (position < chosen.visibleStart - EPSILON || position > chosen.visibleEnd + EPSILON) {
      return toolFailure(
        "invalid",
        `pääajan kohta ${formatSceneSeconds(position)} s ei osu esiintymään ${chosen.hostId} (näkyy ${formatSceneSeconds(chosen.visibleStart)}–${formatSceneSeconds(chosen.visibleEnd)} s)`,
      );
    }
    localPosition = roundSeconds(masterToLocal(chosen, position));
  } else {
    localPosition = roundSeconds(position);
  }

  return localPosition;
}
