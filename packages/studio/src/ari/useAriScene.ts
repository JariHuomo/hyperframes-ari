/**
 * Ari: which scene placement the panel and the timeline are both looking at.
 *
 * `AriMotion` (the form) and `AriTimeline` (the rail) have to agree on one
 * instance, or the master time in the form would name a different placement
 * than the bar being dragged. That agreement lives here: one hook reading the
 * selection, the active composition, the clip manifest and the human's choice
 * from `sceneInstanceChoice` — the same panel-state store `studio_select`
 * writes to.
 *
 * The hook resolves an instance only when it is unambiguous or explicitly
 * chosen. It never picks the first of several: a wrong guess would put a motion
 * in the wrong place in master time while the form claimed otherwise.
 */

import { useSyncExternalStore } from "react";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import { useStudioShellContext } from "../contexts/StudioContext";
import { usePlayerStore } from "../player/store/playerStore";
import {
  describeScene,
  sceneInstanceChoice,
  type SceneUnsupportedSummary,
} from "../webmcp/tools/animationScene";
import { resolveSceneInstances, type SceneInstance } from "./sceneTime";

export interface AriScene {
  /** The selection lives in another file than the composition on the timeline. */
  nested: boolean;
  sourceFile: string | null;
  instances: readonly SceneInstance[];
  unsupported: readonly SceneUnsupportedSummary[];
  /** The single placement, the chosen one, or null. Never a guess. */
  instance: SceneInstance | null;
  /** 1-based position of `instance` in `instances`; 0 when unresolved. */
  index: number;
  selectedId: string | null;
  choose: (hostId: string | null) => void;
}

const NOT_NESTED: AriScene = {
  nested: false,
  sourceFile: null,
  instances: [],
  unsupported: [],
  instance: null,
  index: 0,
  selectedId: null,
  choose: () => {},
};

export function useAriScene(): AriScene {
  const { domEditSelection } = useDomEditSelectionContext();
  const { activeCompPath } = useStudioShellContext();
  const clipManifest = usePlayerStore((state) => state.clipManifest);
  // Subscribed for the re-render; the value is read back through `forSource`,
  // which normalises the path exactly the way the tools do.
  useSyncExternalStore(sceneInstanceChoice.subscribe, sceneInstanceChoice.getSnapshot);

  const sourceFile = domEditSelection?.sourceFile ?? null;
  const nested = Boolean(sourceFile && sourceFile !== (activeCompPath || "index.html"));
  if (!nested || !sourceFile) return NOT_NESTED;

  const { instances } = resolveSceneInstances({ clips: clipManifest ?? [] }, sourceFile);
  const described = describeScene(
    { getClipManifest: () => clipManifest, getCompositionPath: () => activeCompPath },
    sourceFile,
  );
  const selectedId =
    instances.length === 1
      ? (instances[0]?.hostId ?? null)
      : sceneInstanceChoice.forSource(sourceFile);
  const instance = instances.find((one) => one.hostId === selectedId) ?? null;
  return {
    nested: true,
    sourceFile: described?.sourceFile ?? sourceFile,
    instances,
    unsupported: described?.unsupported ?? [],
    instance,
    index: instance ? instances.findIndex((one) => one.hostId === instance.hostId) + 1 : 0,
    selectedId,
    choose: (hostId) => sceneInstanceChoice.choose(sourceFile, hostId),
  };
}
