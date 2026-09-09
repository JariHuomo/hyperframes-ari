/** Ari: await shared motion writes, then verify saved source and return its current id.
 * Preview pixels and creative quality still need an explicit visual check. */

import { motionPresetProperties, type StudioMotionOptions } from "../../utils/studioMotionPreset";
import {
  readMotionOptions,
  readUpdateFields,
  isRawGsapExpression,
  updateTiming,
} from "./animationInputs";
import {
  resolveSceneWrite,
  SCENE_INSTANCE_SCHEMA,
  SCENE_TIME_BASIS_SCHEMA,
  type SceneReceipt,
  type SceneToolDeps,
} from "./animationScene";
import { settleAnimationWrite, type AnimationSourceSnapshot } from "./animationReadback";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import { toolFailure, type ToolFailure } from "../toolResult";
import {
  runTargetedWrite,
  type StudioWriteResult,
  type TargetedWriteDeps,
  WRITE_RECEIPT_DESCRIPTION,
} from "../writeCoordinator";

export type GsapMethod = "to" | "from" | "set" | "fromTo";

const METHODS: readonly GsapMethod[] = ["to", "from", "set", "fromTo"];

export interface AnimationToolDeps extends TargetedWriteDeps, SceneToolDeps {
  getAnimationsForSelection: (
    selection: DomEditSelection,
  ) => Promise<
    readonly { id: string; keyframes?: unknown; position?: unknown; duration?: unknown }[]
  >;
  readPlayhead: () => { currentTime: number; duration: number; isPlaying: boolean };
  readAnimationSource?: (selection: DomEditSelection) => Promise<AnimationSourceSnapshot>;
  addAnimation: (
    selection: DomEditSelection,
    method: GsapMethod,
    options?: StudioMotionOptions,
    /** The placement whose clock `options.position` was already resolved against.
     * Without it the writer cannot tell a chosen instance from an ambiguous one
     * and refuses a nested add outright. */
    instance?: string | null,
  ) => Promise<boolean>;
  updateAnimation: (
    selection: DomEditSelection,
    animationId: string,
    updates: { duration?: number; ease?: string; easeEach?: string; position?: number },
  ) => Promise<boolean>;
  addKeyframe: (
    selection: DomEditSelection,
    animationId: string,
    percent: number,
    properties: Record<string, number | string>,
  ) => Promise<void>;
  deleteAnimation: (selection: DomEditSelection, animationId: string) => Promise<boolean>;
}

const INSPECT_HINT = "Call studio_inspect to see the result.";

async function findOwnedAnimation(
  deps: AnimationToolDeps,
  selection: DomEditSelection,
  animationId: string,
): Promise<
  { id: string; keyframes?: unknown; position?: unknown; duration?: unknown } | ToolFailure
> {
  const animations = await deps.getAnimationsForSelection(selection);
  return (
    animations.find((animation) => animation.id === animationId) ??
    toolFailure(
      "invalid",
      `animation ${animationId} does not belong to the target handle`,
      "Select the target, then call studio_inspect for its current animation ids.",
    )
  );
}

async function animationBelongsToTarget(
  deps: AnimationToolDeps,
  selection: DomEditSelection,
  animationId: string,
): Promise<ToolFailure | null> {
  const found = await findOwnedAnimation(deps, selection, animationId);
  return "ok" in found ? found : null;
}

function readAnimationId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export interface StudioAddAnimationResult {
  method: GsapMethod;
  /**
   * Where it was inserted, in the SCENE's own clock — which is what was written
   * to source. `scene.masterPosition` is the same moment in master time.
   */
  insertedAtSeconds: number;
  /** Present only for a nested target: both times and the chosen instance. */
  scene?: SceneReceipt;
  /** How many placements of a shared scene source this one edit changes. */
  affectsInstances?: number;
  dispatched?: true;
}

export async function studioAddAnimation(
  deps: AnimationToolDeps,
  input: {
    handle?: unknown;
    method?: unknown;
    preset?: unknown;
    position?: unknown;
    duration?: unknown;
    ease?: unknown;
    timeBasis?: unknown;
    instance?: unknown;
  },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioAddAnimationResult>> {
  const method = METHODS.find((candidate) => candidate === input.method);
  if (!method) {
    return preDispatchFailure(
      "add-animation",
      toolFailure("invalid", `method must be one of ${METHODS.join(", ")}`),
    );
  }
  const options = readMotionOptions(input, method);
  if ("ok" in options) return preDispatchFailure("add-animation", options);
  // The fit check and the master->scene conversion both need the target's
  // source file, which only exists once the handle resolves — so they run in
  // preflight, still before anything is dispatched.
  let scene: SceneReceipt | null = null;
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "add-animation",
    signal,
    preflight: (selection) => {
      const clock = deps.readPlayhead();
      const resolved = resolveSceneWrite(deps, selection, {
        timeBasis: input.timeBasis,
        instance: input.instance,
        position: options.position ?? clock.currentTime,
        duration: options.duration ?? 0,
        compositionDuration: clock.duration,
      });
      if (!resolved.ok) return resolved;
      scene = resolved.scene;
      if (resolved.localPosition !== null) options.position = resolved.localPosition;
      return null;
    },
    write: async (selection) => {
      const { currentTime } = deps.readPlayhead();
      const before = await deps.readAnimationSource?.(selection);
      const landed = await deps.addAnimation(
        selection,
        method,
        Object.keys(options).length ? options : undefined,
        scene?.instance ?? null,
      );
      if (!landed) {
        return toolFailure(
          "failed",
          "the animation did not land",
          "The target may be stale. Call studio_look and try again with its current handle.",
        );
      }
      const value = {
        method,
        insertedAtSeconds: options.position ?? currentTime,
        ...(scene ? { scene, affectsInstances: scene.affectsInstances } : {}),
        dispatched: true as const,
      };
      return settleAnimationWrite(deps, selection, before, value, {
        kind: "add",
        position: value.insertedAtSeconds,
        method,
        duration: options.duration,
        ease: options.ease,
        ...(options.preset ? { properties: motionPresetProperties(options.preset) } : {}),
      });
    },
  });
}

export interface AnimationUpdates {
  duration?: number;
  ease?: string;
  easeEach?: string;
  position?: number;
}

export interface StudioUpdateAnimationResult {
  animationId: string;
  /** `position` here is always the scene-local value written to source. */
  updated: AnimationUpdates;
  scene?: SceneReceipt;
  affectsInstances?: number;
}

/** Timing and the requested curve, checked before anything is dispatched. */
export async function studioUpdateAnimation(
  deps: AnimationToolDeps,
  input: {
    handle?: unknown;
    animationId?: unknown;
    duration?: unknown;
    ease?: unknown;
    easeEach?: unknown;
    position?: unknown;
    timeBasis?: unknown;
    instance?: unknown;
  },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioUpdateAnimationResult>> {
  const animationId = readAnimationId(input.animationId);
  if (!animationId) {
    return preDispatchFailure(
      "update-animation",
      toolFailure("invalid", "animationId must be a non-empty string", INSPECT_HINT),
    );
  }
  const fields = readUpdateFields(input);
  if ("ok" in fields) return preDispatchFailure("update-animation", fields);
  // A keyframe tween's feel lives in `keyframes.easeEach`, not `ease` — the same
  // choice `AnimationCard` makes. Writing `ease` there changes nothing visible.
  let updates: AnimationUpdates = fields.updates;
  let scene: SceneReceipt | null = null;
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "update-animation",
    signal,
    preflight: async (selection) => {
      const found = await findOwnedAnimation(deps, selection, animationId);
      if ("ok" in found) return found;
      {
        const clock = deps.readPlayhead();
        const resolved = resolveSceneWrite(deps, selection, {
          ...updateTiming(updates, input.timeBasis, found),
          instance: input.instance,
          compositionDuration: clock.duration,
        });
        if (!resolved.ok) return resolved;
        scene = resolved.scene;
        if (resolved.localPosition !== null && updates.position !== undefined) {
          updates = { ...updates, position: resolved.localPosition };
        }
      }
      if (fields.ease === undefined) return null;
      const hasKeyframes = Boolean(found.keyframes);
      if (fields.easeEachRequested && !hasKeyframes) {
        return toolFailure(
          "invalid",
          `animation ${animationId} has no keyframes, so easeEach would not apply`,
          "Send ease instead, or add keyframes first.",
        );
      }
      updates = { ...updates, [hasKeyframes ? "easeEach" : "ease"]: fields.ease };
      return null;
    },
    write: async (selection) => {
      const before = await deps.readAnimationSource?.(selection);
      const landed = await deps.updateAnimation(selection, animationId, updates);
      if (!landed) {
        return toolFailure(
          "failed",
          `the update to ${animationId} did not land`,
          "The animation id may be stale. studio_inspect lists the current ones.",
        );
      }
      return settleAnimationWrite(
        deps,
        selection,
        before,
        {
          animationId,
          updated: updates,
          ...(scene ? { scene, affectsInstances: scene.affectsInstances } : {}),
        },
        { kind: "update", animationId, updates },
      );
    },
  });
}

export interface StudioAddKeyframeResult {
  animationId: string;
  percent: number;
  properties: Record<string, number | string>;
  dispatched?: true;
}

export async function studioAddKeyframe(
  deps: AnimationToolDeps,
  input: { handle?: unknown; animationId?: unknown; percent?: unknown; properties?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioAddKeyframeResult>> {
  const animationId = readAnimationId(input.animationId);
  if (!animationId) {
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "animationId must be a non-empty string", INSPECT_HINT),
    );
  }
  const percent = input.percent;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    // Validated here because nothing in the platform checks input against the
    // schema; the tool receives whatever the agent sent.
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "percent must be a number between 0 and 100"),
    );
  }
  const raw = input.properties;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "properties must be an object of GSAP property to value"),
    );
  }
  const properties: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isRawGsapExpression(value)) {
      return preDispatchFailure(
        "add-keyframe",
        toolFailure("invalid", "raw JavaScript expressions are not accepted"),
      );
    }
    if (typeof value === "number" || typeof value === "string") properties[key] = value;
  }
  if (Object.keys(properties).length === 0) {
    return preDispatchFailure(
      "add-keyframe",
      toolFailure("invalid", "properties must contain at least one number or string value"),
    );
  }
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "add-keyframe",
    signal,
    preflight: (selection) => animationBelongsToTarget(deps, selection, animationId),
    write: async (selection) => {
      const before = await deps.readAnimationSource?.(selection);
      await deps.addKeyframe(selection, animationId, percent, properties);
      return settleAnimationWrite(
        deps,
        selection,
        before,
        { animationId, percent, properties, dispatched: true as const },
        { kind: "keyframe", animationId, percent, properties },
      );
    },
  });
}

export interface StudioDeleteAnimationResult {
  animationId: string;
  dispatched?: true;
}

export async function studioDeleteAnimation(
  deps: AnimationToolDeps,
  input: { handle?: unknown; animationId?: unknown },
  signal: AbortSignal = new AbortController().signal,
): Promise<StudioWriteResult<StudioDeleteAnimationResult>> {
  const animationId = readAnimationId(input.animationId);
  if (!animationId) {
    return preDispatchFailure(
      "delete-animation",
      toolFailure("invalid", "animationId must be a non-empty string", INSPECT_HINT),
    );
  }
  return runTargetedWrite(deps, {
    handle: input.handle,
    operation: "delete-animation",
    signal,
    preflight: (selection) => animationBelongsToTarget(deps, selection, animationId),
    write: async (selection) => {
      const before = await deps.readAnimationSource?.(selection);
      const landed = await deps.deleteAnimation(selection, animationId);
      if (!landed) {
        return toolFailure(
          "failed",
          `the delete of ${animationId} did not land`,
          "The animation id may be stale. studio_inspect lists the current ones.",
        );
      }
      return settleAnimationWrite(
        deps,
        selection,
        before,
        { animationId, dispatched: true as const },
        { kind: "delete", animationId },
      );
    },
  });
}

const SETTLEMENT_NOTE =
  "Success means persistence and live-preview synchronization have finished. Inspect afterward when exact authored values matter.";
const KEYFRAME_DISPATCH_CAVEAT = `Ari verifies the saved keyframe properties against fresh source. ${INSPECT_HINT}`;

export const STUDIO_ADD_ANIMATION_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    method: { type: "string", enum: METHODS, description: "The GSAP method to add." },
    preset: {
      type: "string",
      enum: ["fade", "slide", "grow"],
      description: "Version 1 entrance preset; method must be from. One atomic write.",
    },
    position: {
      type: "number",
      minimum: 0,
      description: "Start seconds in timeBasis; defaults to the playhead.",
    },
    duration: { type: "number", exclusiveMinimum: 0 },
    timeBasis: SCENE_TIME_BASIS_SCHEMA,
    instance: SCENE_INSTANCE_SCHEMA,
    ease: {
      type: "string",
      description:
        "A Studio ease name (power2.out, back.out(1.7), bounce.out, …), custom(M0,0 C x1,y1 x2,y2 1,1) with X in 0–1, spring(b), wiggle(n,type[,amplitude]) or hold. Anything else is refused before the write.",
    },
  },
  required: ["handle", "method"],
  additionalProperties: false,
} as const;

export const STUDIO_ADD_ANIMATION_DESCRIPTION = [
  "Add a GSAP animation to one element using its source-safe handle from studio_look.",
  "Defaults to the playhead; supply position, duration and a preset for one atomic entrance.",
  "An ease outside the closed vocabulary is refused before anything is written.",
  "For a nested scene, position is in the scene's own clock unless timeBasis is master;",
  "a scene placed more than once needs instance, and the receipt carries scene with both times.",
  "to choose when it starts. The result reports where the playhead actually was.",
  SETTLEMENT_NOTE,
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_UPDATE_ANIMATION_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    animationId: { type: "string", description: "An animation id from studio_inspect." },
    duration: { type: "number", minimum: 0, description: "Duration in seconds." },
    ease: {
      type: "string",
      description:
        "A Studio ease name (power2.out, back.out(1.7), bounce.out, …), custom(M0,0 C x1,y1 x2,y2 1,1) with X in 0–1, spring(b), wiggle(n,type[,amplitude]) or hold. Anything else is refused before the write.",
    },
    easeEach: {
      type: "string",
      description:
        "Same vocabulary as ease, for a keyframe animation. Usually unnecessary: ease alone routes to easeEach when the animation has keyframes.",
    },
    position: { type: "number", description: "Start position in seconds, in timeBasis." },
    timeBasis: SCENE_TIME_BASIS_SCHEMA,
    instance: SCENE_INSTANCE_SCHEMA,
  },
  required: ["handle", "animationId"],
  additionalProperties: false,
} as const;

export const STUDIO_UPDATE_ANIMATION_DESCRIPTION = [
  "Change an existing animation's duration, ease or position.",
  "The ease vocabulary is closed and validated before the write; an unknown curve is refused.",
  "A keyframe animation's feel is written to easeEach, which the tool picks for you.",
  "position follows timeBasis; a master time is converted to the scene's clock before the write.",
  "The receipt and studio_inspect both carry easeCurve with the curve's numbers.",
  "It waits for persistence and live-preview synchronization before reporting success.",
  "Get current ids from studio_inspect.",
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_ADD_KEYFRAME_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    animationId: { type: "string", description: "An animation id from studio_inspect." },
    percent: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Where in the tween, 0 to 100.",
    },
    properties: {
      type: "object",
      description: 'GSAP property to value, for example {"y": -50, "opacity": 0}.',
    },
  },
  required: ["handle", "animationId", "percent", "properties"],
  additionalProperties: false,
} as const;

export const STUDIO_ADD_KEYFRAME_DESCRIPTION = [
  "Add a keyframe to an existing animation at a percentage through it.",
  "All the properties land in one commit, so they are one undo entry.",
  KEYFRAME_DISPATCH_CAVEAT,
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

export const STUDIO_DELETE_ANIMATION_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "A source-safe element handle from studio_look." },
    animationId: { type: "string", description: "An animation id from studio_inspect." },
  },
  required: ["handle", "animationId"],
  additionalProperties: false,
} as const;

export const STUDIO_DELETE_ANIMATION_DESCRIPTION = [
  "Remove an animation from the element named by handle. Undo reverses it.",
  SETTLEMENT_NOTE,
  WRITE_RECEIPT_DESCRIPTION,
].join(" ");

function preDispatchFailure<T extends object>(
  operation: "add-animation" | "update-animation" | "add-keyframe" | "delete-animation",
  failure: ToolFailure,
): StudioWriteResult<T> {
  return { ...failure, stage: "refused", operation };
}
