/** Mechanical animation input validation; source ownership stays in animationTools. */
import { parseEase } from "../easeContract";
import { toolFailure, type ToolFailure } from "../toolResult";
import type { StudioMotionOptions } from "../../utils/studioMotionPreset";
import type { AnimationUpdates, GsapMethod } from "./animationTools";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
export function isRawGsapExpression(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("__raw:");
}
function validTime(value: unknown, key: "position" | "duration"): value is number {
  if (!finiteNumber(value) || value < 0) return false;
  return key !== "duration" || value !== 0;
}
function readPreset(value: unknown, method: GsapMethod) {
  if (value === undefined) return undefined;
  if (method !== "from")
    return toolFailure("invalid", "preset requires from and fade, slide or grow");
  if (value === "fade" || value === "slide" || value === "grow") return value;
  return toolFailure("invalid", "preset requires from and fade, slide or grow");
}
function motionTimes(input: { position?: unknown; duration?: unknown }) {
  const options: StudioMotionOptions = {};
  for (const key of ["position", "duration"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!validTime(value, key))
      return toolFailure("invalid", `${key} must be a valid non-negative time`);
    options[key] = value;
  }
  return options;
}
export function readMotionOptions(
  input: { preset?: unknown; position?: unknown; duration?: unknown; ease?: unknown },
  method: GsapMethod,
): StudioMotionOptions | ToolFailure {
  const preset = readPreset(input.preset, method);
  if (typeof preset === "object") return preset;
  const options = motionTimes(input);
  if ("ok" in options) return options;
  if (preset) options.preset = preset;
  if (input.ease === undefined) return options;
  const parsed = parseEase(input.ease);
  if (!parsed.ok) return toolFailure("invalid", parsed.reason);
  return { ...options, ease: parsed.ease };
}

export function readUpdateFields(input: {
  duration?: unknown;
  ease?: unknown;
  easeEach?: unknown;
  position?: unknown;
}): { updates: AnimationUpdates; ease?: string; easeEachRequested: boolean } | ToolFailure {
  const updates: AnimationUpdates = {};
  if (finiteNumber(input.duration)) {
    if (input.duration < 0) return toolFailure("invalid", "duration must not be negative");
    updates.duration = input.duration;
  }
  if (finiteNumber(input.position)) {
    updates.position = input.position;
  }
  const requested = input.easeEach ?? input.ease;
  const easeEachRequested = input.easeEach !== undefined;
  if (isRawGsapExpression(requested)) {
    return toolFailure("invalid", "raw JavaScript expressions are not accepted");
  }
  if (requested === undefined) {
    if (Object.keys(updates).length === 0) {
      return toolFailure("invalid", "give at least one of duration, ease, easeEach, position");
    }
    return { updates, easeEachRequested };
  }
  // The closed ease contract. A typo like power2.uot must never reach source:
  // it would read back byte-identical and verify, while GSAP played its default.
  const parsed = parseEase(requested);
  if (!parsed.ok) return toolFailure("invalid", parsed.reason);
  return { updates, ease: parsed.ease, easeEachRequested };
}

function authoredNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
export function updateTiming(
  updates: AnimationUpdates,
  inputBasis: unknown,
  owned: { position?: unknown; duration?: unknown },
) {
  return {
    timeBasis: updates.position !== undefined ? inputBasis : undefined,
    position: updates.position ?? authoredNumber(owned.position),
    duration: updates.duration ?? authoredNumber(owned.duration),
  };
}
