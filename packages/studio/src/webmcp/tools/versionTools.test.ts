// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { versionTools } from "./versionTools";
import type { ElementToolDeps } from "./elementTools";
import {
  versionComparison,
  openVersionComparison,
  restoreComparedVersion,
} from "../../ari/versionComparison";
import { projectVersions } from "../../utils/projectVersions";
vi.mock("../../utils/projectVersions", () => ({ projectVersions: vi.fn() }));
vi.mock("../../ari/versionComparison", () => ({
  openVersionComparison: vi.fn(),
  restoreComparedVersion: vi.fn(),
  versionComparison: { getSnapshot: vi.fn(), close: vi.fn(), play: vi.fn(), seek: vi.fn() },
}));
afterEach(() => vi.resetAllMocks());
it("exposes listing, named checkpoint and explicit comparison IDs", async () => {
  const save = vi.fn(async () => ({ ok: true, version: { id: "named" } }));
  vi.mocked(projectVersions).mockReturnValue({
    list: async () => ({ versions: [] }),
    save,
  } as unknown as ReturnType<typeof projectVersions>);
  vi.mocked(openVersionComparison).mockResolvedValue({
    ok: true,
    beforeId: "a",
    afterId: "b",
    duration: 7,
    revision: "r",
  });
  const call = caller();
  expect(await call("studio_versions", {})).toMatchObject({ ok: true, versions: [] });
  expect(await call("studio_save_version", { name: "Nimetty" })).toMatchObject({ ok: true });
  expect(save).toHaveBeenCalledWith("Nimetty");
  expect(await call("studio_compare_versions", { beforeId: "a", afterId: "b" })).toMatchObject({
    ok: true,
  });
  expect(openVersionComparison).toHaveBeenCalledWith("p", "a", "b");
});
it("shares playback/seek/keep and the undoable restore service", async () => {
  vi.mocked(versionComparison.getSnapshot).mockReturnValue({
    projectId: "p",
    time: 2,
  } as unknown as ReturnType<typeof versionComparison.getSnapshot>);
  vi.mocked(restoreComparedVersion).mockResolvedValue({
    ok: true,
    stage: "saved",
    restoredFrom: "a",
    revision: "r",
    paths: [],
    previewReady: true,
  });
  const call = caller();
  for (const action of ["play", "pause", "seek", "keep", "restore"])
    expect(await call("studio_comparison", { action, time: 2 })).toMatchObject({ ok: true });
  expect(vi.mocked(versionComparison.play).mock.calls).toEqual([[true], [false]]);
  expect(versionComparison.seek).toHaveBeenCalledWith(2);
  expect(versionComparison.close).toHaveBeenCalledOnce();
  expect(restoreComparedVersion).toHaveBeenCalledOnce();
});
it("refuses absent project, missing IDs, unknown actions and invalid times", async () => {
  expect(await caller(null)("studio_versions", {})).toMatchObject({ ok: false });
  expect(await caller()("studio_compare_versions", {})).toMatchObject({ ok: false });
  const call = caller();
  expect(await call("studio_comparison", { action: "restore" })).toMatchObject({ ok: false });
  vi.mocked(versionComparison.getSnapshot).mockReturnValue({
    projectId: "p",
  } as unknown as ReturnType<typeof versionComparison.getSnapshot>);
  for (const input of [{ action: "unknown" }, { action: "seek", time: "2" }, {}])
    expect(await call("studio_comparison", input)).toMatchObject({ ok: false });
});
function caller(projectId: string | null = "p") {
  const deps = { getSnapshot: () => ({ projectId }) } as unknown as ElementToolDeps;
  const tools = versionTools(() => deps);
  return (name: string, args: object) =>
    tools
      .find((tool) => tool.name === name)!
      .execute(args, { signal: new AbortController().signal });
}
