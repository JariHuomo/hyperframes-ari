import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { buildEditHistoryEntry, createEmptyEditHistory, pushEditHistoryEntry } from "./editHistory";
import { createIndexedDbEditHistoryStorage, loadEditHistoryState } from "./editHistoryStorage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("commits nullable snapshots and reloads them through a new IndexedDB adapter", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const state = pushEditHistoryEntry(
    createEmptyEditHistory(),
    buildEditHistoryEntry({
      id: "one",
      projectId: "p",
      label: "Rakenne",
      now: 1,
      files: {
        "new.html": { before: null, after: "" },
        "old.html": { before: "ää\r\n", after: null },
      },
    }),
  );
  await createIndexedDbEditHistoryStorage().set("p", state);
  expect(await loadEditHistoryState(createIndexedDbEditHistoryStorage(), "p")).toEqual(state);
});

it("rejects an aborted IndexedDB transaction and retains the previously committed state", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const storage = createIndexedDbEditHistoryStorage();
  const before = createEmptyEditHistory();
  await storage.set("p", before);
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (value, key) {
    const request = put.call(this, value, key);
    this.transaction.abort();
    return request;
  });
  await expect(storage.set("p", { ...before, updatedAt: 12 })).rejects.toThrow();
  expect(await storage.get("p")).toEqual(before);
});
