// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { useGsapAnimationOps } from "./useGsapAnimationOps";
import type { SceneTimeManifestClip } from "../ari/sceneTime";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookApi = ReturnType<typeof useGsapAnimationOps>;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const selection = { id: "box", selector: "#box" } as DomEditSelection;

function renderOps(
  commitMutationSafely: (...args: unknown[]) => Promise<void>,
  commitMutation: (...args: unknown[]) => Promise<void> = vi.fn(async () => undefined),
  getClipManifest?: () => readonly SceneTimeManifestClip[] | null,
): HookApi {
  const captured: { api: HookApi | null } = { api: null };
  function Probe() {
    captured.api = useGsapAnimationOps({
      projectIdRef: { current: "project" },
      activeCompPath: "index.html",
      getClipManifest,
      commitMutation,
      commitMutationSafely,
      showToast: vi.fn(),
      sdkSession: null,
      sdkDeps: null,
    });
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  cleanup = () => act(() => root.unmount());
  if (!captured.api) throw new Error("hook did not initialize");
  return captured.api;
}

function deferredCommit() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { commitMutationSafely: vi.fn(() => promise), release };
}

describe("useGsapAnimationOps settlement", () => {
  it("inserts a root animation at the requested playhead rather than the clip start", async () => {
    const commit = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commit,
    );
    await api.addGsapAnimation(
      { ...selection, sourceFile: "index.html", dataAttributes: { start: "1" } },
      "from",
      3.25,
    );
    expect(commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ position: 3.25 }),
      expect.anything(),
    );
  });

  it("refuses an ambiguous master-to-scene clock before saving", async () => {
    const commit = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commit,
    );
    await expect(
      api.addGsapAnimation({ ...selection, sourceFile: "scene.html" }, "from", 3.25),
    ).rejects.toThrow("Avaa kohtaus");
    expect(commit).not.toHaveBeenCalled();
  });

  /** Sprint S4: the refusal narrows to the genuinely ambiguous case. */
  const sceneClip = (overrides: Partial<SceneTimeManifestClip>): SceneTimeManifestClip => ({
    id: "host",
    label: "Kohtaus",
    start: 0,
    duration: 4,
    kind: "composition",
    compositionId: "scene",
    parentCompositionId: null,
    compositionSrc: "scene.html",
    compositionAncestors: ["root"],
    playbackStart: 0,
    playbackRate: 1,
    ...overrides,
  });

  async function addToSecondScene(api: ReturnType<typeof renderOps>) {
    await api.addGsapAnimation(
      { ...selection, sourceFile: "scene.html" },
      "from",
      5,
      undefined,
      "host-b",
    );
  }

  function repeatedSceneOps() {
    const commit = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commit,
      () => [
        sceneClip({ id: "host-a", compositionId: "a", start: 0 }),
        sceneClip({ id: "host-b", compositionId: "b", start: 4 }),
      ],
    );
    return { api, commit };
  }

  it("still refuses when the scene plays twice and no instance was named", async () => {
    const { api, commit } = repeatedSceneOps();

    await expect(
      api.addGsapAnimation({ ...selection, sourceFile: "scene.html" }, "from", 5),
    ).rejects.toThrow("Avaa kohtaus");
    expect(commit).not.toHaveBeenCalled();
  });

  it("converts the master playhead when the only placement is unambiguous", async () => {
    const commit = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commit,
      () => [sceneClip({ id: "host-b", start: 4 })],
    );

    await api.addGsapAnimation({ ...selection, sourceFile: "scene.html" }, "from", 5);

    // 5 s master on a scene hosted at 4 s is 1 s in the scene's own clock.
    expect(commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ position: 1 }),
      expect.anything(),
    );
  });

  it("converts for the named placement when the scene plays twice", async () => {
    const { api, commit } = repeatedSceneOps();

    await addToSecondScene(api);

    expect(commit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ position: 1 }),
      expect.anything(),
    );
  });
  /** The add-writer edits the SCENE's own file, never the master's script. */
  it("commits a nested add against the scene source file", async () => {
    const { api, commit } = repeatedSceneOps();

    await addToSecondScene(api);

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFile: "scene.html" }),
      expect.objectContaining({ type: "add", targetSelector: "#box" }),
      expect.anything(),
    );
  });

  /** The tool converts master->local in preflight and hands the local start
   * over; re-deciding the placement here would refuse a write that is already
   * unambiguous, which is what left nested adds failing. */
  it("accepts an already-local position on an ambiguous scene without an instance", async () => {
    const { api, commit } = repeatedSceneOps();

    await api.addGsapAnimation({ ...selection, sourceFile: "scene.html" }, "from", 5, {
      position: 0.3,
    });

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFile: "scene.html" }),
      expect.objectContaining({ position: 0.3 }),
      expect.anything(),
    );
  });

  it.each([
    ["update", (api: HookApi) => api.updateGsapMeta(selection, "anim-1", { duration: 2 })],
    ["delete", (api: HookApi) => api.deleteGsapAnimation(selection, "anim-1")],
  ])("keeps %s pending until the shared preview synchronizer settles", async (_name, run) => {
    const deferred = deferredCommit();
    const api = renderOps(deferred.commitMutationSafely);
    let settled = false;

    const resultPromise = run(api).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    deferred.release();
    await resultPromise;
    expect(settled).toBe(true);
  });

  it("soft-reloads the preview when adding an animation", async () => {
    const commitMutation = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commitMutation,
    );

    await api.addGsapAnimation(selection, "from");

    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "add" }),
      expect.objectContaining({ softReload: true }),
    );
  });

  it("soft-reloads the preview when deleting an animation", async () => {
    const commitMutationSafely = vi.fn(async () => undefined);
    const api = renderOps(commitMutationSafely);

    await api.deleteGsapAnimation(selection, "anim-1");

    expect(commitMutationSafely).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "delete" }),
      expect.objectContaining({ softReload: true }),
    );
  });
});
