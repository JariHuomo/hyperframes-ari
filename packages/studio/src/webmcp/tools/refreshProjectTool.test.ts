import { afterEach, expect, it, vi } from "vitest";
import { refreshProjectTool } from "./refreshProjectTool";
import type { ElementToolDeps } from "./elementTools";
const mocks = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn() }));
vi.mock("./elementTools", () => ({ elementTools: () => [{ execute: mocks.read }] }));
vi.mock("../../utils/projectVersions", () => ({ projectVersions: () => ({ list: mocks.list }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function setup() {
  let id: string | null = "demo";
  const controller = new AbortController();
  mocks.read.mockResolvedValue({
    ok: true,
    sourceFile: "index.html",
    version: "source",
    elements: [],
  });
  mocks.list.mockResolvedValue({ revision: "revision", history: { undo: [{}, {}], redo: [] } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true, assets: [] })),
  );
  const refreshProject = vi.fn(async (read: () => Promise<void>) => {
    await read();
  });
  const deps: ElementToolDeps = {
    getSnapshot: () => ({
      projectId: id,
      compositionPath: "index.html",
      currentTime: 0,
      duration: 7,
      isPlaying: false,
      elements: [],
      scene: { status: "ready", items: [], drillInItem: null },
      selection: null,
      selectionAnimationCount: 0,
      history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
    }),
    getWriteBlockedReason: () => null,
    refreshProject,
  };
  return {
    call: () =>
      refreshProjectTool(() => deps).execute(
        { sourceFile: "index.html" },
        { signal: controller.signal },
      ),
    refreshProject,
    controller,
    switchProject: () => {
      id = "other";
    },
  };
}
it("returns the checked source and history receipt only after shared refresh completes", async () => {
  const s = setup();
  expect(await s.call()).toMatchObject({
    ok: true,
    stage: "refreshed",
    version: "source",
    revision: "revision",
    undoCount: 2,
    redoCount: 0,
  });
  expect(s.refreshProject).toHaveBeenCalledOnce();
});
it.each(["source", "shelf", "validation", "project", "abort"])(
  "refuses refresh after %s failure",
  async (failure) => {
    const s = setup();
    if (failure === "source") mocks.read.mockResolvedValue({ ok: false, reason: "gone" });
    if (failure === "shelf")
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ ok: false }, { status: 500 })),
      );
    if (failure === "validation")
      s.refreshProject.mockImplementation(async (read) => {
        await read();
        throw new Error("changed during read");
      });
    if (failure === "project")
      mocks.list.mockImplementation(async () => {
        s.switchProject();
        return {};
      });
    if (failure === "abort") s.controller.abort();
    expect(await s.call()).toMatchObject({ ok: false, kind: "failed", reason: expect.any(String) });
  },
);
