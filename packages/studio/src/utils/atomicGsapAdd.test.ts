import { describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { persistAtomicGsapAdd } from "./atomicGsapAdd";
import { createPersistentEditHistoryStore } from "../hooks/usePersistentEditHistory";
import { createEmptyEditHistory } from "./editHistory";
import { createMemoryEditHistoryStorage } from "./editHistoryStorage";
import type { CutoverDeps } from "./sdkEditTransaction";

const original = `<!doctype html>\r\n<html><body>
<div data-composition-id="scene" data-duration="7"><h1 data-hf-id="title">Moi</h1></div>
<script>const tl = gsap.timeline({paused:true}); window.__timelines = {scene:tl};</script>
</body></html>\r\n`;
const selection = { hfId: "title", sourceFile: "scenes/title.html" } as DomEditSelection;
const spec = {
  method: "from",
  position: 0.3,
  duration: 0.6,
  ease: "power2.out",
  properties: { y: 80 },
} as const;
const path = "scenes/title.html";

function harness() {
  let disk = original;
  const history = createPersistentEditHistoryStore({
    projectId: "test",
    storage: createMemoryEditHistoryStorage(),
    initialState: createEmptyEditHistory(),
    onChange: () => {},
  });
  const read = vi.fn(async () => disk);
  const write = vi.fn(async (_path: string, content: string, expected?: string) => {
    if (disk !== expected) throw new Error("conflict");
    disk = content;
  });
  const deps: CutoverDeps = {
    editHistory: history,
    writeProjectFile: write,
    readProjectFile: read,
    reloadPreview: vi.fn(),
    domEditSaveTimestampRef: { current: 0 },
  };
  return {
    history,
    deps,
    read,
    write,
    disk: () => disk,
    setDisk: (value: string) => {
      disk = value;
    },
  };
}

describe("atomic first motion", () => {
  it("records id and first nested tween once; undo and redo restore exact bytes", async () => {
    const h = harness();
    await persistAtomicGsapAdd(selection, "headline", spec, path, h.deps);
    const after = h.disk();
    expect(after).toContain('id="headline"');
    expect(after).toContain('tl.from("[data-hf-id=\\"title\\"]"');
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.history.snapshot().state.undo).toHaveLength(1);
    expect(h.history.snapshot().state.undo[0].files[path].before).toBe(original);
    const callbacks = { readFile: h.read, writeFile: h.write };
    expect((await h.history.undo(callbacks)).ok).toBe(true);
    expect(new TextEncoder().encode(h.disk())).toEqual(new TextEncoder().encode(original));
    expect((await h.history.redo(callbacks)).ok).toBe(true);
    expect(h.disk()).toBe(after);
  });

  it("does not write even the id when the tween cannot be built", async () => {
    const h = harness();
    h.setDisk(original.replace(/<script>.*<\/script>/, ""));
    const before = h.disk();
    await expect(persistAtomicGsapAdd(selection, "headline", spec, path, h.deps)).rejects.toThrow();
    expect(h.disk()).toBe(before);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.history.snapshot().canUndo).toBe(false);
  });

  it("rolls back both stages when history recording fails", async () => {
    const h = harness();
    h.deps.editHistory = {
      recordEdit: async () => {
        throw new Error("history unavailable");
      },
    };
    await expect(persistAtomicGsapAdd(selection, "headline", spec, path, h.deps)).rejects.toThrow(
      "history unavailable",
    );
    expect(h.disk()).toBe(original);
    expect(h.write).toHaveBeenCalledTimes(2);
  });

  it("refuses a deleted target without writing", async () => {
    const h = harness();
    h.setDisk(original.replace('<h1 data-hf-id="title">Moi</h1>', ""));
    const before = h.disk();
    await expect(persistAtomicGsapAdd(selection, "headline", spec, path, h.deps)).rejects.toThrow(
      "poistettu",
    );
    expect(h.disk()).toBe(before);
    expect(h.write).not.toHaveBeenCalled();
  });

  it("refuses a source changed while waiting for the write queue", async () => {
    const h = harness();
    h.read.mockResolvedValueOnce(original).mockResolvedValueOnce(original + "<!--new-->");
    await expect(persistAtomicGsapAdd(selection, "headline", spec, path, h.deps)).rejects.toThrow(
      "Lähde muuttui",
    );
    expect(h.write).not.toHaveBeenCalled();
  });

  it("does not overwrite an external write after candidate construction", async () => {
    const h = harness();
    const external = original + "<!--external-->";
    h.write.mockImplementationOnce(async () => {
      h.setDisk(external);
      throw new Error("conflict");
    });
    await expect(persistAtomicGsapAdd(selection, "headline", spec, path, h.deps)).rejects.toThrow(
      "conflict",
    );
    expect(h.disk()).toBe(external);
    expect(h.history.snapshot().canUndo).toBe(false);
  });

  it("undo refuses a read/write race and keeps its stack", async () => {
    const h = harness();
    await persistAtomicGsapAdd(selection, "headline", spec, path, h.deps);
    const external = h.disk() + "<!--external-->";
    const checkedWrite = h.deps.writeProjectFile;
    await expect(
      h.history.undo({
        readFile: h.read,
        writeFile: async (p, c, expected) => {
          h.setDisk(external);
          await checkedWrite(p, c, expected);
        },
      }),
    ).rejects.toThrow("conflict");
    expect(h.disk()).toBe(external);
    expect(h.history.snapshot().canUndo).toBe(true);
    expect(h.history.snapshot().canRedo).toBe(false);
  });
});
