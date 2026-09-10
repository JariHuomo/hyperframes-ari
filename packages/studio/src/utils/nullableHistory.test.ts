import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commitConditionalFiles,
  readOptionalBytes,
} from "../../../studio-server/src/ari/conditionalFiles";
import { fileContentVersion } from "../../../studio-server/src/helpers/fileVersion";
import { createPersistentEditHistoryController } from "../hooks/usePersistentEditHistory";
import {
  createEmptyEditHistory,
  hashEditHistoryContent,
  type EditHistoryState,
} from "./editHistory";
import type { EditHistoryStorageAdapter } from "./editHistoryStorage";
import { saveProjectFilesWithHistory } from "./studioFileHistory";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

async function harness() {
  const root = mkdtempSync(join(tmpdir(), "ari-null-history-"));
  roots.push(root);
  const historyPath = join(root, "history.json");
  let failStorage: (() => void) | undefined;
  const storage: EditHistoryStorageAdapter = {
    async get() {
      const bytes = readOptionalBytes(historyPath);
      return bytes === null ? null : JSON.parse(bytes.toString());
    },
    async set(_id, state) {
      failStorage?.();
      writeFileSync(historyPath, JSON.stringify(state));
    },
    async delete() {
      rmSync(historyPath, { force: true });
    },
  };
  const io = {
    async readFile(path: string) {
      return readOptionalBytes(join(root, path))?.toString() ?? null;
    },
    async writeFile(path: string, content: string | null, expected?: string | null) {
      if (expected === undefined) throw new Error("Missing precondition");
      commitConditionalFiles(root, [
        {
          path,
          content: content === null ? null : Buffer.from(content),
          expectedVersion: expected === null ? null : fileContentVersion(expected),
        },
      ]);
    },
  };
  const open = () =>
    createPersistentEditHistoryController({
      projectId: "test",
      storage,
      onChange: () => {},
    });
  const store = await open();
  return {
    root,
    io,
    store,
    open,
    storage,
    fail(callback: () => void) {
      failStorage = callback;
    },
    save(files: Record<string, string | null>) {
      return saveProjectFilesWithHistory({
        projectId: "test",
        label: "Rakenne",
        kind: "source",
        files,
        ...io,
        recordEdit: store.recordEdit,
      });
    },
  };
}

describe("nullable structural history with real conditional files", () => {
  it("reloads one multi-file entry and restores exact creation/empty/deletion bytes on undo and redo", async () => {
    const h = await harness();
    const original = "<p>ää</p>\r\n";
    writeFileSync(join(h.root, "old.html"), original);
    writeFileSync(join(h.root, "empty.html"), "");
    await h.save({ "new.html": "", "old.html": null, "empty.html": "uusi\n" });
    expect(h.store.snapshot().state.undo).toHaveLength(1);
    const reopened = await h.open();
    const undo = await reopened.undo(h.io);
    expect(undo.ok).toBe(true);
    expect(undo.files?.["new.html"]).toEqual({ previous: "", restored: null });
    expect(await h.io.readFile("new.html")).toBeNull();
    expect(readFileSync(join(h.root, "old.html"))).toEqual(Buffer.from(original));
    expect(readFileSync(join(h.root, "empty.html"))).toEqual(Buffer.alloc(0));
    const again = await h.open();
    expect((await again.redo(h.io)).ok).toBe(true);
    expect(await h.io.readFile("new.html")).toBe("");
    expect(await h.io.readFile("old.html")).toBeNull();
    expect(await h.io.readFile("empty.html")).toBe("uusi\n");
  });

  it.each(["created", "changed", "recreated"])(
    "preserves externally %s files and both stacks",
    async (mode) => {
      const h = await harness();
      if (mode !== "created") writeFileSync(join(h.root, "a.html"), "before");
      await h.save({ "a.html": mode === "recreated" ? null : "after" });
      if (mode === "created") await h.store.undo(h.io);
      writeFileSync(join(h.root, "a.html"), "external");
      const before = h.store.snapshot().state;
      const result = mode === "created" ? await h.store.redo(h.io) : await h.store.undo(h.io);
      expect(result).toMatchObject({ ok: false, reason: "content-mismatch" });
      expect(h.store.snapshot().state).toEqual(before);
      expect(await h.io.readFile("a.html")).toBe("external");
      expect((await h.open()).snapshot().state).toEqual(before);
    },
  );

  it("rolls back creation and deletion when history recording fails", async () => {
    const h = await harness();
    writeFileSync(join(h.root, "old.html"), "old\r\n");
    h.fail(() => {
      throw new Error("history unavailable");
    });
    await expect(h.save({ "new.html": "", "old.html": null })).rejects.toThrow(
      "history unavailable",
    );
    expect(await h.io.readFile("new.html")).toBeNull();
    expect(await h.io.readFile("old.html")).toBe("old\r\n");
    expect(h.store.snapshot().state).toEqual(createEmptyEditHistory());
  });

  it.each(["save", "undo", "redo"] as const)(
    "attempts all compensation after %s persistence failure and preserves foreign bytes",
    async (direction) => {
      const h = await harness();
      writeFileSync(join(h.root, "old.html"), "old");
      if (direction !== "save") await h.save({ "new.html": "", "old.html": null });
      if (direction === "redo") await h.store.undo(h.io);
      const before = h.store.snapshot().state;
      h.fail(() => {
        writeFileSync(join(h.root, "old.html"), "foreign");
        throw new Error("history failed");
      });
      const action =
        direction === "save"
          ? h.save({ "new.html": "", "old.html": null })
          : h.store[direction](h.io);
      await expect(action).rejects.toThrow("rollback did not complete");
      expect(await h.io.readFile("old.html")).toBe("foreign");
      expect(await h.io.readFile("new.html")).toBe(direction === "undo" ? "" : null);
      await expectStoredHistory(h, before);
    },
  );

  it("rolls back an earlier creation when a later conditional write fails", async () => {
    const h = await harness();
    writeFileSync(join(h.root, "old.html"), "old");
    await expect(
      saveProjectFilesWithHistory<string | null>({
        projectId: "test",
        label: "Rakenne",
        kind: "source",
        files: { "new.html": "", "old.html": null },
        readFile: h.io.readFile,
        writeFile: async (path, content, expected) => {
          if (path === "old.html") writeFileSync(join(h.root, path), "foreign");
          await h.io.writeFile(path, content, expected);
        },
        recordEdit: h.store.recordEdit,
      }),
    ).rejects.toThrow("Tiedosto muuttui");
    expect(await h.io.readFile("new.html")).toBeNull();
    expect(await h.io.readFile("old.html")).toBe("foreign");
    expect(h.store.snapshot().canUndo).toBe(false);
  });

  it("uses explicit null diskContent without replacing the historical before baseline", async () => {
    const h = await harness();
    await saveProjectFilesWithHistory<string | null>({
      projectId: "test",
      label: "Rakenne",
      kind: "source",
      files: { "a.html": "after" },
      readFile: async () => "before",
      writeFile: h.io.writeFile,
      diskContent: { "a.html": null },
      recordEdit: h.store.recordEdit,
    });
    expect((await h.store.undo(h.io)).ok).toBe(true);
    expect(await h.io.readFile("a.html")).toBe("before");
  });

  it.each(["undo", "redo"] as const)(
    "restores all bytes and stack state when %s persistence fails",
    async (direction) => {
      const h = await harness();
      writeFileSync(join(h.root, "old.html"), "old");
      await h.save({ "new.html": "", "old.html": null });
      if (direction === "redo") await h.store.undo(h.io);
      const before = h.store.snapshot().state;
      const bytes = [await h.io.readFile("new.html"), await h.io.readFile("old.html")];
      h.fail(() => {
        throw new Error("history failed");
      });
      await expect(h.store[direction](h.io)).rejects.toThrow("history failed");
      expect([await h.io.readFile("new.html"), await h.io.readFile("old.html")]).toEqual(bytes);
      await expectStoredHistory(h, before);
    },
  );

  it("loads legacy version 1 string snapshots with unchanged hashes", async () => {
    const h = await harness();
    const legacy: EditHistoryState = {
      version: 1,
      updatedAt: 1,
      redo: [],
      undo: [
        {
          id: "old",
          projectId: "test",
          label: "Old",
          kind: "source",
          createdAt: 1,
          files: {
            "a.html": { before: "", after: "a", beforeHash: "811c9dc5", afterHash: "e40c292c" },
          },
        },
      ],
    };
    await h.storage.set("test", legacy);
    writeFileSync(join(h.root, "a.html"), "a");
    expect(hashEditHistoryContent(null)).not.toBe(hashEditHistoryContent(""));
    expect((await (await h.open()).undo(h.io)).ok).toBe(true);
    expect(await h.io.readFile("a.html")).toBe("");
  });
});

async function expectStoredHistory(
  h: Awaited<ReturnType<typeof harness>>,
  before: EditHistoryState,
) {
  expect(h.store.snapshot().state).toEqual(before);
  expect((await h.open()).snapshot().state).toEqual(before);
}
