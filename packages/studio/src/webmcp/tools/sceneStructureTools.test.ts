// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { sceneStructureTools } from "./sceneStructureTools";
import type { StudioLookSnapshot } from "./lookTools";
import { adTemplate } from "../../../../studio-server/src/ari/projectTemplates";
it("discovers read/prepare/write; binds proposal, returns real version and a successful write even without preview", async () => {
  const snapshot: StudioLookSnapshot = {
    projectId: "local",
    compositionPath: "index.html",
    currentTime: 0,
    duration: 7,
    isPlaying: false,
    elements: [],
    scene: { status: "ready", items: [], drillInItem: null },
    selection: null,
    selectionAnimationCount: 0,
    history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
  };
  const files: Record<string, string | null> = { "index.html": adTemplate("Test", "blank") };
  const recordEdit = vi.fn(async () => {});
  const tools = sceneStructureTools(() => ({
    getSnapshot: () => snapshot,
    getWriteBlockedReason: () => null,
    elementsSaved: async () => false,
    getElementFiles: () => ({
      readFile: async (path) => files[path] ?? null,
      writeFile: async (path, content, expected) => {
        expect(files[path] ?? null).toBe(expected);
        files[path] = content;
      },
      recordEdit,
    }),
  }));
  expect(tools.map((t) => t.name)).toEqual([
    "studio_scenes",
    "studio_prepare_scene",
    "studio_edit_scene",
  ]);
  const call = async (name: string, input: object) =>
    tools.find((t) => t.name === name)!.execute(input, { signal: new AbortController().signal });
  const args = {
    sourceFile: "index.html",
    action: "add",
    name: "Test",
    duration: 2,
    fileName: "test.html",
  };
  expect(await call("studio_scenes", { sourceFile: "index.html" })).toMatchObject({
    ok: true,
    duration: 7,
    rows: [],
  });
  const plan = await call("studio_prepare_scene", args);
  expect(recordEdit).not.toHaveBeenCalled();
  expect(await call("studio_edit_scene", { ...args, reviewVersion: "stale" })).toMatchObject({
    ok: false,
  });
  const version = Reflect.get(Object(plan), "reviewVersion");
  expect(await call("studio_edit_scene", { ...args, reviewVersion: version })).toMatchObject({
    ok: true,
    stage: "saved",
    previewReady: false,
    affectsInstances: 1,
    afterDuration: 9,
  });
  expect(recordEdit).toHaveBeenCalledTimes(1);
  expect(await call("studio_scenes", { sourceFile: "not-open.html" })).toMatchObject({ ok: false });
  expect(await call("studio_edit_scene", { ...args, reviewVersion: version })).toMatchObject({
    ok: false,
  });
});
