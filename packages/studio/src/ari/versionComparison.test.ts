// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import {
  openVersionComparison,
  restoreComparedVersion,
  versionComparison,
} from "./versionComparison";
import { projectVersions, restoreProjectVersion } from "../utils/projectVersions";
import type { ElementToolDeps } from "../webmcp/tools/elementTools";
vi.mock("../utils/projectVersions", () => ({
  projectVersions: vi.fn(),
  restoreProjectVersion: vi.fn(),
}));
afterEach(() => {
  versionComparison.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const prepareRestore = vi.fn(async () => ({
    expectedRevision: "live",
    version: { id: "before" },
    files: {},
  }));
  vi.mocked(projectVersions).mockReturnValue({
    list: vi.fn(async () => ({ revision: "live" })),
    prepareRestore,
  } as unknown as ReturnType<typeof projectVersions>);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        ok: true,
        version: { id: url.split("/").at(-1) },
        width: 1080,
        height: 1920,
        duration: url.endsWith("before") ? 4 : 7,
        html: "<html></html>",
      }),
    })),
  );
  vi.mocked(restoreProjectVersion).mockResolvedValue({
    restoredFrom: "before",
    revision: "restored",
    paths: ["index.html"],
  });
  const elementsSaved = vi.fn(async () => true);
  const deps = {
    getSnapshot: () => ({ projectId: "p", compositionPath: "index.html", selection: null }),
    getWriteBlockedReason: () => null,
    getSelectionRevision: () => 7,
    getElementFiles: () => ({
      recordEdit: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(async () => null),
    }),
    elementsSaved,
  } as unknown as ElementToolDeps;
  return { deps, elementsSaved, prepareRestore };
}
it("uses the intersection of durations and one shared seek without writing", async () => {
  setup();
  const receipt = await openVersionComparison("p", "before", "after");
  expect(receipt.duration).toBe(4);
  versionComparison.seek(2);
  expect(versionComparison.getSnapshot()?.time).toBe(2);
  expect(() => versionComparison.seek(5)).toThrow();
  versionComparison.close();
  expect(restoreProjectVersion).not.toHaveBeenCalled();
});
it("refuses missing versions without retaining a previous playable comparison", async () => {
  setup();
  await openVersionComparison("p", "before", "after");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, json: async () => ({ error: "Version aineisto puuttuu" }) })),
  );
  await expect(openVersionComparison("p", "before", "missing")).rejects.toThrow("puuttuu");
  expect(versionComparison.getSnapshot()).toBeNull();
});
it("rejects stale restore before source writes", async () => {
  const s = setup();
  await openVersionComparison("p", "before", "after");
  s.prepareRestore.mockResolvedValue({
    expectedRevision: "changed",
    version: { id: "before" },
    files: {},
  });
  await expect(restoreComparedVersion(s.deps)).rejects.toThrow("muuttui");
  expect(restoreProjectVersion).not.toHaveBeenCalled();
});
it("reports saved restore independently of preview failure and passes the selection revision", async () => {
  const s = setup();
  await openVersionComparison("p", "before", "after");
  s.elementsSaved.mockRejectedValue(new Error("preview failed"));
  expect(await restoreComparedVersion(s.deps)).toMatchObject({
    ok: true,
    stage: "saved",
    previewReady: false,
    restoredFrom: "before",
  });
  expect(s.elementsSaved).toHaveBeenCalledWith(expect.objectContaining({ selectionRevision: 7 }));
});
it("refuses identical IDs and unequal aspect ratios", async () => {
  setup();
  await expect(openVersionComparison("p", "same", "same")).rejects.toThrow("eri");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        ok: true,
        width: url.endsWith("before") ? 1080 : 1920,
        height: 1920,
        duration: 7,
        version: { id: url },
      }),
    })),
  );
  await expect(openVersionComparison("p", "before", "after")).rejects.toThrow("kuvasuhteet");
});

it("pauses shared seek and ignores a pending playback frame before resuming", async () => {
  setup();
  await openVersionComparison("p", "before", "after");
  versionComparison.play(true);
  versionComparison.advance(1);
  versionComparison.seek(2);
  versionComparison.advance(1.1);
  expect(versionComparison.getSnapshot()).toMatchObject({ time: 2, playing: false });
  versionComparison.play(true);
  versionComparison.advance(2.1);
  expect(versionComparison.getSnapshot()).toMatchObject({ time: 2.1, playing: true });
  expect(restoreProjectVersion).not.toHaveBeenCalled();
});
