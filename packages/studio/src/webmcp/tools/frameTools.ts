/**
 * `studio_frame`: the eyes.
 *
 * Without this the tool set is a remote control. With it an agent can author a
 * change, look at the instant it affects, judge it, and adjust. That loop is the
 * one thing source alone cannot support, because "what does this look like at
 * 2.4 seconds" is not a question a file can answer.
 *
 * Reuses Studio's existing capture endpoint (`utils/frameCapture`) rather than
 * inventing a second one. The server renders the composition with Puppeteer, so
 * the frame reflects the file on disk, not the live preview DOM.
 *
 * `samples` is the curve-judging form of the same eye. Asking "what does this
 * ease look like" as three separate `studio_frame` calls means computing the
 * tween's 25/50/75 % instants by hand from a `studio_inspect` reply, and it
 * gives three frames that may not even belong to the same revision. Here the
 * timings come from the SAVED source and every frame is required to carry the
 * same revision, so the set is comparable or it is refused.
 */

import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import { buildFrameCaptureUrl } from "../../utils/frameCapture";
import { toolFailure, toolOk, type ToolFailure, type ToolResult } from "../toolResult";
import type { AnimationToolDeps } from "./animationTools";
import type { InspectToolDeps } from "./inspectTools";
import {
  resolveSceneWrite,
  isNestedSource,
  SCENE_INSTANCE_SCHEMA,
  type SceneToolDeps,
} from "./animationScene";

export interface FrameToolDeps extends SceneToolDeps {
  getProjectId: () => string | null;
  getCompositionPath: () => string | null;
  readPlayhead: () => { currentTime: number; duration: number; isPlaying: boolean };
  requestSeek: (time: number) => void;
  /** Confirms the URL renders. Injected so tests need no network. */
  probeFrame: (url: string) => Promise<{ ok: boolean; status: number; sourceRevision?: string }>;
  wait: (ms: number) => Promise<void>;
  /** Only needed for `samples`; identical signatures to the other tool deps so
   * `StudioAgentToolsDeps` can extend both without a property conflict. */
  getCurrentSelection: InspectToolDeps["getCurrentSelection"];
  readAnimationSource?: AnimationToolDeps["readAnimationSource"];
}

/** One captured instant of an animation, as a fraction of its own duration. */
export interface StudioFrameSample {
  url: string;
  time: number;
  /** 0–1 within the animation, exactly as requested. */
  progress: number;
  sourceRevision?: string;
}

export interface StudioFrameResult {
  /** Fetch this to see the frame. A PNG of the composition at `time`. */
  url: string;
  time: number;
  compositionPath: string;
  /** How long the tool waited for a pending write to settle before capturing. */
  settledMs: number;
  sourceRevision?: string;
  /** Present only for a `samples` capture; `url`/`time` mirror the first entry. */
  frames?: StudioFrameSample[];
  animationId?: string;
}

export interface StudioFrameInput {
  /** Seconds. Omit to capture wherever the playhead already is. */
  time?: number;
  /**
   * Milliseconds to wait before capturing, so a just-written edit is visible.
   * See the staleness note in the description.
   */
  settleMs?: number;
  /** Capture inside this animation's own span instead of at a wall-clock time. */
  animationId?: string;
  /** Fractions of that animation's duration, 0–1. Requires `animationId`. */
  samples?: number[];
  instance?: string;
}

/**
 * Long enough to cover the project watcher's 40ms write-stability threshold
 * plus filesystem latency, short enough not to be felt. This is the mitigation
 * for a real, previously-fixed bug: the preview signature is invalidated by a
 * file watcher, and a capture that beats the watcher renders the PRE-edit
 * composition. An agent reading that as "my edit failed" would thrash.
 */
const DEFAULT_SETTLE_MS = 150;
const MAX_SETTLE_MS = 5_000;

export async function studioFrame(
  deps: FrameToolDeps,
  input: StudioFrameInput = {},
): Promise<ToolResult<StudioFrameResult>> {
  const projectId = deps.getProjectId();
  if (!projectId) {
    return toolFailure("blocked", "no project is open");
  }

  if (input.animationId !== undefined || input.samples !== undefined) {
    return studioFrameSamples(deps, input, projectId);
  }

  if (input.time !== undefined) {
    if (typeof input.time !== "number" || !Number.isFinite(input.time) || input.time < 0) {
      return toolFailure("invalid", "time must be a non-negative, finite number of seconds");
    }
    deps.requestSeek(input.time);
  }

  const settledMs = clampSettle(input.settleMs);
  if (settledMs > 0) await deps.wait(settledMs);

  // Capture whatever the playhead now reads, rather than what was requested:
  // the player clamps, so those can differ and the frame belongs to the former.
  const { currentTime } = deps.readPlayhead();
  const compositionPath = deps.getCompositionPath();
  const url = buildFrameCaptureUrl({ projectId, compositionPath, currentTime });

  const probe = await deps.probeFrame(url);
  if (!probe.ok) {
    return toolFailure(
      "failed",
      `the renderer returned ${probe.status} for this frame`,
      "The composition may not build. Try `hyperframes check`.",
    );
  }

  const boundUrl = new URL(url);
  if (probe.sourceRevision) boundUrl.searchParams.set("revision", probe.sourceRevision);

  return toolOk<StudioFrameResult>({
    url: boundUrl.toString(),
    time: currentTime,
    compositionPath: compositionPath ?? "index.html",
    settledMs,
    ...(probe.sourceRevision ? { sourceRevision: probe.sourceRevision } : {}),
  });
}

const MAX_SAMPLES = 8;

/** Capture one instant and bind it to the revision the renderer reports. */
async function captureAt(
  deps: FrameToolDeps,
  projectId: string,
  time: number,
  settledMs: number,
): Promise<{ url: string; time: number; sourceRevision?: string } | ToolFailure> {
  deps.requestSeek(time);
  if (settledMs > 0) await deps.wait(settledMs);
  const { currentTime } = deps.readPlayhead();
  const url = buildFrameCaptureUrl({
    projectId,
    compositionPath: deps.getCompositionPath(),
    currentTime,
  });
  const probe = await deps.probeFrame(url);
  if (!probe.ok) {
    return toolFailure(
      "failed",
      `the renderer returned ${probe.status} for the frame at ${currentTime.toFixed(3)}s`,
      "The composition may not build. Try `hyperframes check`.",
    );
  }
  const bound = new URL(url);
  if (probe.sourceRevision) bound.searchParams.set("revision", probe.sourceRevision);
  return {
    url: bound.toString(),
    time: currentTime,
    ...(probe.sourceRevision ? { sourceRevision: probe.sourceRevision } : {}),
  };
}

function isSampleFraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readSampleRequest(input: StudioFrameInput) {
  const { animationId, samples } = input;
  if (typeof animationId !== "string" || !animationId) {
    return toolFailure("invalid", "samples needs the animationId whose span to sample");
  }
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.length > MAX_SAMPLES ||
    !samples.every(isSampleFraction)
  ) {
    return toolFailure("invalid", `samples must be 1 to ${MAX_SAMPLES} fractions between 0 and 1`);
  }
  return { animationId, samples };
}

async function readSampleSpan(deps: FrameToolDeps, input: StudioFrameInput) {
  const selection = deps.getCurrentSelection();
  if (!selection) {
    return toolFailure("blocked", "nothing is selected", "Call studio_select first.");
  }
  if (!deps.readAnimationSource) {
    return toolFailure("blocked", "this Studio build cannot read animation timings from source");
  }
  // Timings come from the SAVED source, never from the live preview: the frames
  // are rendered from disk, so the instants they claim must be too.
  const snapshot = await deps.readAnimationSource(selection);
  const animation = snapshot.animations.find((candidate) => candidate.id === input.animationId);
  if (!animation) {
    return toolFailure(
      "invalid",
      `animation ${input.animationId} does not belong to the selected target`,
      "Call studio_inspect for the current animation ids.",
    );
  }
  const position = animation.position;
  const duration = animation.duration;
  if (typeof position !== "number" || typeof duration !== "number" || duration <= 0) {
    return toolFailure(
      "invalid",
      `animation ${input.animationId} has no numeric position and duration`,
    );
  }
  return sampleMasterSpan(deps, selection, input.instance, position, duration);
}

function sampleMasterSpan(
  deps: FrameToolDeps,
  selection: DomEditSelection,
  instance: string | undefined,
  position: number,
  duration: number,
) {
  const mapped = resolveSceneWrite(deps, selection, {
    instance,
    position,
    duration,
    compositionDuration: deps.readPlayhead().duration,
  });
  if (!mapped.ok) return mapped;
  if (isNestedSource(deps, selection) && !mapped.scene) {
    return toolFailure("invalid", "Kohtauksen ruutukuvat vaativat ratkaistun esiintymän.");
  }
  const start = mapped.scene?.masterPosition ?? position;
  const span = duration / (mapped.scene?.playbackRate ?? 1);
  return { start, span };
}

async function studioFrameSamples(
  deps: FrameToolDeps,
  input: StudioFrameInput,
  projectId: string,
): Promise<ToolResult<StudioFrameResult>> {
  const requested = readSampleRequest(input);
  if ("ok" in requested) return requested;
  const { animationId, samples } = requested;
  const mapped = await readSampleSpan(deps, input);
  if ("ok" in mapped) return mapped;
  const { start, span } = mapped;
  const settledMs = clampSettle(input.settleMs);
  const frames: StudioFrameSample[] = [];
  for (const progress of samples) {
    const captured = await captureAt(deps, projectId, start + span * progress, settledMs);
    if ("ok" in captured) return captured;
    frames.push({ ...captured, progress });
  }
  // A set whose frames come from different revisions is not a comparison; it is
  // two compositions side by side. Refuse rather than let it be read as one.
  const revisions = new Set(frames.map((frame) => frame.sourceRevision ?? ""));
  if (revisions.size > 1) {
    return toolFailure(
      "failed",
      "the source changed while the frames were captured",
      "Capture them again once the edit has settled.",
    );
  }
  const first = frames[0]!;
  return toolOk<StudioFrameResult>({
    url: first.url,
    time: first.time,
    compositionPath: deps.getCompositionPath() ?? "index.html",
    settledMs,
    animationId,
    frames,
    ...(first.sourceRevision ? { sourceRevision: first.sourceRevision } : {}),
  });
}

function clampSettle(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_SETTLE_MS;
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested < 0) {
    return DEFAULT_SETTLE_MS;
  }
  return Math.min(requested, MAX_SETTLE_MS);
}

export const STUDIO_FRAME_INPUT_SCHEMA = {
  type: "object",
  properties: {
    time: {
      type: "number",
      minimum: 0,
      description: "Seconds. Omit to capture wherever the playhead already is.",
    },
    settleMs: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SETTLE_MS,
      description: `Wait this long before capturing so a just-made edit is included. Default ${DEFAULT_SETTLE_MS}.`,
    },
    animationId: {
      type: "string",
      description:
        "With `samples`: sample inside this animation's own span on the selected target.",
    },
    instance: SCENE_INSTANCE_SCHEMA,
    samples: {
      type: "array",
      minItems: 1,
      maxItems: MAX_SAMPLES,
      items: { type: "number", minimum: 0, maximum: 1 },
      description:
        "Fractions of the animation's duration, e.g. [0.25, 0.5, 0.75]. Returns one revision-bound PNG per fraction in `frames`; every frame must share one source revision or the call fails.",
    },
  },
  additionalProperties: false,
} as const;

export const STUDIO_FRAME_DESCRIPTION = [
  "Render the composition to a PNG at a given time and return its URL, so you can",
  "SEE the result instead of inferring it from source. Use this to judge a change:",
  "edit, capture the instant it affects, look, adjust.",
  "The frame is rendered from the file on disk, not the live preview.",
  "A capture taken immediately after an edit can therefore predate that edit, because",
  "the render cache is cleared by a file watcher. The tool waits briefly to cover that;",
  "raise `settleMs` if a frame still looks stale, rather than concluding the edit failed.",
  "Returns `ok: true` with `url` and the `time` actually captured, or `ok: false`.",
  "Pass `animationId` with `samples` to capture several instants inside one animation's",
  "own span in a single call — the timings are read from saved source, and `frames` carries",
  "one revision-bound URL per fraction.",
].join(" ");
