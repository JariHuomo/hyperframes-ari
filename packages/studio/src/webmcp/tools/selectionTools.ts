import { findElementForSelection } from "../../components/editor/domEditingElement";
/**
 * `studio_select` and `studio_seek`: pointing the human and the agent at the
 * same thing.
 *
 * Selection is shared human-visible state. Element writes do not infer their
 * target from it: they resolve an explicit source-safe handle per call. Keeping
 * these contracts separate means a human click cannot redirect an agent write.
 */

import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import { elementHandleMatchesProject, resolveLiveHandleSelection } from "../handles";
import { toolFailure, toolOk, type ToolFailure, type ToolResult } from "../toolResult";
import {
  describeScene,
  isNestedSource,
  resolveSceneSeek,
  sceneInstanceChoice,
  sceneSeekReceipt,
  sceneSourceFile,
  SCENE_INSTANCE_SCHEMA,
  SCENE_TIME_BASIS_SCHEMA,
  type SceneDescription,
  type SceneToolDeps,
} from "./animationScene";

export interface SelectionToolDeps extends SceneToolDeps {
  /** The preview iframe's document, or null before it mounts. */
  getPreviewDocument: () => Document | null;
  getCompositionPath: () => string | null;
  getProjectId: () => string | null;
  buildSelection: (element: HTMLElement) => Promise<DomEditSelection | null>;
  applySelection: (selection: DomEditSelection) => void;
  /** Out-of-loop seek. `requestSeek`, not `setCurrentTime`. */
  requestSeek: (time: number) => void;
  readPlayhead: () => { currentTime: number; duration: number; isPlaying: boolean };
}

export interface StudioSelectResult {
  handle: string;
  label: string;
  tagName: string;
  box: { x: number; y: number; width: number; height: number };
  /** Present when the selected element lives in a nested scene file. */
  scene?: SceneDescription & { instance: string | null };
}

export async function studioSelect(
  deps: SelectionToolDeps,
  handle: string,
  instance?: unknown,
): Promise<ToolResult<StudioSelectResult>> {
  if (typeof handle !== "string" || !handle.trim()) {
    return toolFailure("invalid", "handle must be a non-empty string", "Call studio_look first.");
  }
  if (!elementHandleMatchesProject(handle, deps.getProjectId())) {
    return toolFailure(
      "invalid",
      "the handle belongs to a different project",
      "Call studio_look in the active project.",
    );
  }

  // Three distinct failures, deliberately not collapsed: "the preview is not up
  // yet" is a wait, "no such element" is a stale handle, and "could not build a
  // selection" is an element Studio cannot drive. The agent's next move differs
  // for each.
  const resolved = await resolveLiveHandleSelection(
    deps.getPreviewDocument,
    handle,
    deps.buildSelection,
  );
  if (resolved.status === "preview-unavailable") {
    return toolFailure(
      "blocked",
      "the preview is not mounted yet",
      "Wait for the composition to load, then retry.",
    );
  }
  if (resolved.status === "not-found") {
    return toolFailure(
      "invalid",
      `no element matches handle ${handle}`,
      "The composition may have changed. Call studio_look for current handles.",
    );
  }
  if (resolved.status === "unsupported") {
    return toolFailure(
      "blocked",
      `${handle} resolved to an element Studio cannot select`,
      "Try a parent or child element from studio_look.",
    );
  }
  if (resolved.status === "changed") {
    return toolFailure(
      "invalid",
      "the target changed while it was resolving",
      "Call studio_look again.",
    );
  }

  let { selection } = resolved;
  const scene = resolveSelectedInstance(deps, selection, instance);
  if (scene && "ok" in scene) return scene;
  if (scene?.instance) {
    const placed = await selectPlacedElement(deps, selection, scene.instance);
    if ("ok" in placed) return placed;
    selection = placed;
  }
  deps.applySelection(selection);
  return toolOk<StudioSelectResult>({
    handle,
    label: selection.label,
    tagName: selection.tagName,
    box: selection.boundingBox,
    ...(scene ? { scene } : {}),
  });
}

async function selectPlacedElement(
  deps: SelectionToolDeps,
  selection: DomEditSelection,
  instance: string,
): Promise<DomEditSelection | ToolFailure> {
  const doc = deps.getPreviewDocument();
  const element =
    doc &&
    findElementForSelection(doc, { ...selection, instanceId: instance }, deps.getCompositionPath());
  if (!element)
    return toolFailure("blocked", "Valitun esiintymän kuva ei ole vielä käytettävissä.");
  const placed = await deps.buildSelection(element);
  if (!placed || deps.getPreviewDocument() !== doc || !element.isConnected)
    return toolFailure("blocked", "Esikatselu vaihtui valinnan aikana.");
  return { ...placed, instanceId: instance };
}

/**
 * S2: record which placement of a nested scene the human and the agent are
 * looking at. The instance is validated against the manifest — an id that is
 * not a placement of THIS scene is refused rather than remembered — and the
 * choice is panel state only, so it can never redirect a write on its own.
 */
function explicitInstance(
  described: SceneDescription,
  sourceFile: string,
  instance: unknown,
): string | ToolFailure {
  if (typeof instance !== "string" || !instance.trim()) {
    return toolFailure("invalid", "instance on oltava kohtauksen esiintymän hfId");
  }
  if (!described.instances.some((candidate) => candidate.hostId === instance)) {
    return toolFailure(
      "invalid",
      `kohtauksella ${sourceFile} ei ole esiintymää ${instance}`,
      `Esiintymät: ${described.instances.map((candidate) => candidate.hostId).join(", ") || "ei yhtään"}.`,
    );
  }
  return instance;
}

function resolveSelectedInstance(
  deps: SelectionToolDeps,
  selection: DomEditSelection,
  instance: unknown,
): (SceneDescription & { instance: string | null }) | ToolFailure | null {
  if (!isNestedSource(deps, selection)) {
    if (instance === undefined || instance === null) return null;
    return toolFailure("invalid", "instance koskee vain sisäkkäistä kohtausta");
  }
  const sourceFile = sceneSourceFile(deps, selection);
  const described = describeScene(deps, sourceFile);
  if (!described) return null;
  const chosen = selectedSceneInstance(described, sourceFile, instance);
  if (chosen !== null && typeof chosen !== "string") return chosen;
  sceneInstanceChoice.choose(sourceFile, chosen);
  return { ...described, instance: chosen };
}

export interface StudioSeekResult {
  /** Where the playhead ACTUALLY landed, which may differ from the request. */
  playhead: number;
  duration: number;
  isPlaying: boolean;
  moved: boolean;
  /**
   * Both clocks for the landed playhead, when an instance was named. Frame
   * rounding happens in MASTER time, so the scene time is re-derived from where
   * the playhead landed rather than echoed back.
   */
  scene?: {
    sourceFile: string;
    instance: string;
    localPosition: number;
    masterPosition: number;
  };
}

export interface StudioSeekInput {
  time: number;
  timeBasis?: unknown;
  instance?: unknown;
}

export function studioSeek(
  deps: SelectionToolDeps,
  request: number | StudioSeekInput,
): ToolResult<StudioSeekResult> {
  const input: StudioSeekInput = typeof request === "number" ? { time: request } : request;
  const time = input.time;
  if (typeof time !== "number" || !Number.isFinite(time)) {
    return toolFailure("invalid", "time must be a finite number of seconds");
  }
  // S4: the player only understands master time, so a scene time is converted
  // before the seek and both numbers are reported after it.
  const resolvedSeek = resolveSceneSeek(deps, { ...input, time });
  if (!resolvedSeek.ok) return resolvedSeek;
  const masterTime = resolvedSeek.masterTime;
  const instance = resolvedSeek.instance;

  const before = deps.readPlayhead();
  // Deliberately NOT clamped here. `seek()` already clamps against the
  // adapter's duration, which can differ from the store's, and a second clamp
  // would give that invariant two owners that can disagree. Report where it
  // landed instead.
  deps.requestSeek(masterTime);
  const after = deps.readPlayhead();

  // `requestSeek` is fire-and-forget: it cannot report that no adapter was
  // mounted to receive it. Reading back is the only way to avoid claiming a
  // seek that never happened.
  const moved = after.currentTime !== before.currentTime;
  if (!moved && before.currentTime !== masterTime) {
    return toolFailure(
      "blocked",
      `the playhead did not move; it is still at ${after.currentTime}`,
      "The preview may not be ready. Check studio_look, then retry.",
    );
  }

  return toolOk<StudioSeekResult>({
    playhead: after.currentTime,
    duration: after.duration,
    isPlaying: after.isPlaying,
    moved,
    ...(instance ? { scene: sceneSeekReceipt(instance, after.currentTime) } : {}),
  });
}

export const STUDIO_SELECT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    handle: { type: "string", description: "An element handle from studio_look." },
    instance: SCENE_INSTANCE_SCHEMA,
  },
  required: ["handle"],
  additionalProperties: false,
} as const;

export const STUDIO_SELECT_DESCRIPTION = [
  "Select an element in HyperFrames Studio, exactly as clicking it would:",
  "the human sees the same selection box and inspector.",
  "Call this before the first write to a target so the human sees the agent's intent.",
  "Takes a handle from studio_look. Selection is visual context for the human;",
  "element writes take their own explicit handle and do not require this tool first.",
  "For an element inside a nested scene the result lists every placement of that scene;",
  "pass instance to choose one when there is more than one. One placement chooses itself.",
  "Returns `ok: true` with the resulting selection, or `ok: false` with `kind`, `reason` and a `hint`.",
].join(" ");

export const STUDIO_SEEK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    time: {
      type: "number",
      minimum: 0,
      description: "Playhead position in seconds, in timeBasis.",
    },
    timeBasis: SCENE_TIME_BASIS_SCHEMA,
    instance: SCENE_INSTANCE_SCHEMA,
  },
  required: ["time"],
  additionalProperties: false,
} as const;

export const STUDIO_SEEK_DESCRIPTION = [
  "Move the playhead to a time in seconds. Pauses playback.",
  "With timeBasis scene and an instance, the time is that scene's own clock and is",
  "converted to master time before the seek; the result reports both.",
  "Out-of-range times are clamped by the player, so check the returned `playhead`",
  "for where it actually landed rather than assuming it matched your request.",
  "Returns `ok: true`, or `ok: false` with `kind`, `reason` and a `hint`.",
].join(" ");

function selectedSceneInstance(described: SceneDescription, sourceFile: string, instance: unknown) {
  let chosen = sceneInstanceChoice.forSource(sourceFile);
  if (chosen && !described.instances.some((candidate) => candidate.hostId === chosen))
    chosen = null;
  if (instance !== undefined && instance !== null) {
    const validated = explicitInstance(described, sourceFile, instance);
    if (typeof validated !== "string") return validated;
    chosen = validated;
  } else if (!chosen && described.instances.length === 1) {
    // One placement is unambiguous, so it selects itself. Several never do.
    chosen = described.instances[0]!.hostId;
  }

  return chosen;
}
