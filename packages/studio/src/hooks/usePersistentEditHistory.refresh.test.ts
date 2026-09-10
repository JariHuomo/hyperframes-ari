import { describe, expect, it } from "vitest";
import { createMemoryEditHistoryStorage } from "../utils/editHistoryStorage";
import { createPersistentEditHistoryController } from "./usePersistentEditHistory";

describe("history refresh foundation", () => {
  it("replaces both stacks from another session and preserves subsequent undo/redo", async () => {
    const storage = createMemoryEditHistoryStorage();
    const open = () =>
      createPersistentEditHistoryController({
        projectId: "shared",
        storage,
        onChange: () => {},
      });
    const first = await open();
    const second = await open();
    await first.recordEdit({
      label: "First",
      kind: "source",
      files: {
        "index.html": { before: "a", after: "b" },
      },
    });
    await second.refresh();
    expect(second.snapshot().state).toEqual(first.snapshot().state);
    await second.recordEdit({
      label: "Second",
      kind: "source",
      files: {
        "index.html": { before: "b", after: "c" },
      },
    });
    let content: string | null = "c";
    const io = {
      readFile: async () => content,
      writeFile: async (_path: string, value: string | null) => {
        content = value;
      },
    };
    expect((await second.undo(io)).ok).toBe(true);
    expect(content).toBe("b");
    await first.refresh();
    expect(first.snapshot().redoLabel).toBe("Second");
    expect(first.snapshot().undoLabel).toBe("First");
    expect((await first.redo(io)).ok).toBe(true);
    expect(content).toBe("c");
  });

  it("keeps the current stacks when reloading fails", async () => {
    const memory = createMemoryEditHistoryStorage();
    let fail = false;
    const controller = await createPersistentEditHistoryController({
      projectId: "shared",
      onChange: () => {},
      storage: {
        ...memory,
        get: async (id) => {
          if (fail) throw new Error("read failed");
          return memory.get(id);
        },
      },
    });
    await controller.recordEdit({
      label: "Saved",
      kind: "source",
      files: {
        "index.html": { before: "a", after: "b" },
      },
    });
    const before = controller.snapshot().state;
    fail = true;
    await expect(controller.refresh()).rejects.toThrow("read failed");
    expect(controller.snapshot().state).toBe(before);
    fail = false;
    await controller.refresh();
    expect(controller.snapshot().undoLabel).toBe("Saved");
  });
});
