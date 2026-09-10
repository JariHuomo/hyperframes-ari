// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { elementTools } from "./elementTools";
import type { StudioLookSnapshot } from "./lookTools";
import { studioFileContentVersion } from "../../utils/studioFileVersion";

const initial =
  '<html><body><div data-composition-id="main" data-duration="7" data-width="1080" data-height="1920"></div><script>const tl=gsap.timeline({paused:true});window.__timelines={main:tl};</script></body></html>';
function setup(sourceFile: string, count: number) {
  let source = initial;
  const snapshot: StudioLookSnapshot = {
    projectId: "test",
    compositionPath: "index.html",
    currentTime: 0,
    duration: 7,
    isPlaying: false,
    elements: [],
    scene: { status: "ready", items: [], drillInItem: null },
    selection: null,
    selectionAnimationCount: 0,
    history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },
    clipManifest: Array.from({ length: count }, (_, i) => ({
      id: `host-${i}`,
      label: `Host ${i}`,
      start: i * 3,
      duration: 3,
      kind: "composition",
      compositionId: "scene",
      parentCompositionId: null,
      compositionSrc: sourceFile,
      compositionAncestors: ["root"],
      playbackStart: 0,
      playbackRate: 1,
    })),
  };
  const recordEdit = vi.fn(async () => {});
  const writeFile = vi.fn(async (_path: string, content: string | null) => {
    source = content ?? "";
  });
  const tools = elementTools(() => ({
    getSnapshot: () => snapshot,
    getWriteBlockedReason: () => null,
    elementsSaved: async () => false,
    getElementFiles: () => ({ readFile: async () => source, writeFile, recordEdit }),
  }));
  const call = (name: string, input: object) =>
    tools.find((t) => t.name === name)!.execute(input, { signal: new AbortController().signal });
  return { call, writeFile, recordEdit, source: () => source };
}
describe("element tool impact and saved receipt", () => {
  for (const [sourceFile, count, expected] of [
    ["index.html", 0, 1],
    ["scenes/card.html", 2, 2],
  ] as const) {
    it(`returns ${expected} for read and committed write of ${sourceFile}`, async () => {
      const s = setup(sourceFile, count);
      expect(await s.call("studio_elements", { sourceFile })).toMatchObject({
        ok: true,
        affectsInstances: expected,
      });
      const receipt = await s.call("studio_edit_element", {
        sourceFile,
        version: await studioFileContentVersion(initial),
        action: "add",
        kind: "text",
        name: "Otsikko",
        text: "Hei",
      });
      expect(receipt).toMatchObject({
        ok: true,
        sourceFile,
        affectsInstances: expected,
        previewReady: false,
        version: await studioFileContentVersion(s.source()),
      });
      expect(s.recordEdit).toHaveBeenCalledOnce();
      expect(s.writeFile).toHaveBeenCalledOnce();
      // A superseded preview selection does not turn a committed source write into a failure.
      expect(s.source()).toContain("Hei");
    });
  }
  it("refuses unresolved scenes on both read and write before touching history", async () => {
    const s = setup("scenes/missing.html", 0);
    for (const name of ["studio_elements", "studio_edit_element"])
      expect(await s.call(name, { sourceFile: "scenes/missing.html" })).toMatchObject({
        ok: false,
      });
    expect(s.writeFile).not.toHaveBeenCalled();
    expect(s.recordEdit).not.toHaveBeenCalled();
  });
});
