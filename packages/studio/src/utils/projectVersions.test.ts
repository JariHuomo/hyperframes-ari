// @vitest-environment node
import {
  bindOperationHistory,
  operationRequest,
  UncertainSourceOperation,
} from "./sourceOperations";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbEditHistoryStorage } from "./editHistoryStorage";
import { buildEditHistoryEntry, createEmptyEditHistory, pushEditHistoryEntry } from "./editHistory";
import { afterEach, expect, it, vi } from "vitest";
import { createStudioApi } from "../../../studio-server/src/createStudioApi";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudioApiAdapter } from "../../../studio-server/src/types";
import { createPersistentEditHistoryController } from "../hooks/usePersistentEditHistory";
import {
  createProjectEditHistoryStorage,
  projectVersions,
  restoreProjectVersion,
  versionHistoryFiles,
} from "./projectVersions";
import { nullableProjectFiles } from "./nullableProjectFiles";
import { saveProjectFilesWithHistory } from "./studioFileHistory";
const originalImage = readFileSync(
  new URL("../../tests/e2e/fixtures/ari-authoring/one.png", import.meta.url),
);
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
});
async function harness() {
  const root = mkdtempSync(join(tmpdir(), "ari-project-history-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets/image.png"), originalImage);
  writeFileSync(join(root, "index.html"), '<img src="assets/image.png"><p>before</p>');
  const adapter: StudioApiAdapter = {
    listProjects: () => [{ id: "demo", dir: root }],
    resolveProject: (id) => (id === "demo" ? { id, dir: root } : null),
    bundle: async () => null,
    lint: () => ({ findings: [] }),
    runtimeUrl: "/runtime.js",
    rendersDir: () => root,
    startRender: () => {
      throw new Error("No render");
    },
  };
  let app: ReturnType<typeof createStudioApi>;
  let fault: ((path: string) => void) | undefined;
  let afterResponse: ((path: string) => void) | undefined;
  function restart() {
    app = createStudioApi(adapter);
  }
  restart();
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    fault?.(path);
    const response = await app.request(path.replace(/^\/api/, ""), init);
    afterResponse?.(path);
    return response;
  });
  const open = () =>
    createPersistentEditHistoryController({
      projectId: "demo",
      storage: createProjectEditHistoryStorage(),
      onChange: () => {},
    });
  const io = nullableProjectFiles("demo");
  const binary = versionHistoryFiles("demo");
  const callbacks = {
    readFile: (path: string, encoding?: "base64") =>
      encoding ? binary.readFile(path) : io.readFile(path),
    writeFile: (
      path: string,
      content: string | null,
      expected?: string | null,
      encoding?: "base64",
    ) =>
      encoding ? binary.writeFile(path, content, expected) : io.writeFile(path, content, expected),
  };
  const versions = projectVersions("demo");
  return {
    root,
    restart,
    open,
    io,
    callbacks,
    versions,
    setAfterResponse: (f?: typeof afterResponse) => {
      afterResponse = f;
    },
    setFault: (f?: typeof fault) => {
      fault = f;
    },
  };
}
it("records before/after versions through common saves and survives a fresh service and history controller", async () => {
  const h = await harness(),
    controller = await h.open();
  const before = readFileSync(join(h.root, "index.html"));
  await saveProjectFilesWithHistory({
    projectId: "demo",
    label: "Change",
    kind: "source",
    files: { "index.html": "<p>after</p>", "empty.html": "" },
    ...h.io,
    recordEdit: controller.recordEdit,
  });
  const entry = controller.snapshot().state.undo[0]!;
  expect(entry.beforeVersionId).toBeTruthy();
  expect(entry.afterVersionId).toBeTruthy();
  expect(
    Buffer.from((await h.versions.read(entry.beforeVersionId!)).files["index.html"]!, "base64"),
  ).toEqual(before);
  h.restart();
  const reopened = await h.open();
  expect(reopened.snapshot().state.undo[0]!.afterVersionId).toBe(entry.afterVersionId);
  expect((await reopened.undo(h.callbacks)).ok).toBe(true);
  expect(readFileSync(join(h.root, "index.html"))).toEqual(before);
  expect(await h.io.readFile("empty.html")).toBeNull();
  expect((await reopened.redo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("empty.html")).toBe("");
});
it("restores frozen binary and nullable sources as one undoable edit, then redo survives reopening", async () => {
  const h = await harness(),
    controller = await h.open();
  const checkpoint = await h.versions.save("Before");
  writeFileSync(join(h.root, "assets/image.png"), Buffer.from([7, 8, 9]));
  writeFileSync(join(h.root, "new.html"), "new");
  writeFileSync(join(h.root, "index.html"), "after");
  const prepared = await h.versions.prepareRestore(checkpoint.version.id);
  await restoreProjectVersion("demo", prepared, controller.recordEdit, h.io.writeFile);
  expect(controller.snapshot().state.undo).toHaveLength(1);
  expect(readFileSync(join(h.root, "assets/image.png"))).toEqual(originalImage);
  expect(await h.io.readFile("new.html")).toBeNull();
  expect((await controller.undo(h.callbacks)).ok).toBe(true);
  expect(readFileSync(join(h.root, "assets/image.png"))).toEqual(Buffer.from([7, 8, 9]));
  expect(await h.io.readFile("new.html")).toBe("new");
  h.restart();
  const reopened = await h.open();
  expect((await reopened.redo(h.callbacks)).ok).toBe(true);
  expect(readFileSync(join(h.root, "assets/image.png"))).toEqual(originalImage);
});
it("rolls back a partial restore/history failure, preserves concurrent bytes, and retains the history stacks", async () => {
  const h = await harness(),
    controller = await h.open();
  const version = await h.versions.save("Before");
  writeFileSync(join(h.root, "index.html"), "changed");
  writeFileSync(join(h.root, "extra.html"), "extra");
  let prepared = await h.versions.prepareRestore(version.version.id);
  h.setFault((path) => {
    if (path.endsWith("/versions/save")) throw new Error("storage failure");
  });
  await expect(
    restoreProjectVersion("demo", prepared, controller.recordEdit, h.io.writeFile),
  ).rejects.toThrow("storage failure");
  expect(await h.io.readFile("index.html")).toBe("changed");
  expect(await h.io.readFile("extra.html")).toBe("extra");
  expect(controller.snapshot().state.undo).toHaveLength(0);
  h.setFault();
  prepared = await h.versions.prepareRestore(version.version.id);
  await expect(
    restoreProjectVersion(
      "demo",
      prepared,
      async () => {
        writeFileSync(join(h.root, "index.html"), "external");
        throw new Error("failed finish");
      },
      h.io.writeFile,
    ),
  ).rejects.toThrow("rollback did not complete");
  expect(await h.io.readFile("index.html")).toBe("external");
  expect(await h.io.readFile("extra.html")).toBe("extra");
});
it("rejects stale restore and competing history without overwriting either source or history", async () => {
  const h = await harness();
  const a = await h.open(),
    b = await h.open();
  const checkpoint = await h.versions.save("Named");
  await saveProjectFilesWithHistory({
    projectId: "demo",
    label: "A",
    kind: "source",
    files: { "index.html": "A" },
    ...h.io,
    recordEdit: a.recordEdit,
  });
  await expect(
    saveProjectFilesWithHistory({
      projectId: "demo",
      label: "B",
      kind: "source",
      files: { "index.html": "B" },
      ...h.io,
      recordEdit: b.recordEdit,
    }),
  ).rejects.toThrow("historia muuttui");
  expect(await h.io.readFile("index.html")).toBe("A");
  const restore = await h.versions.prepareRestore(checkpoint.version.id);
  writeFileSync(join(h.root, "index.html"), "external");
  await expect(
    restoreProjectVersion("demo", restore, a.recordEdit, h.io.writeFile),
  ).rejects.toThrow("Projekti muuttui");
  expect(await h.io.readFile("index.html")).toBe("external");
});
it.each(["undo", "redo"] as const)(
  "preserves the %s stack and compensates all other files when history publication fails",
  async (direction) => {
    const h = await harness(),
      controller = await h.open();
    const version = await h.versions.save("Before");
    writeFileSync(join(h.root, "index.html"), "changed");
    writeFileSync(join(h.root, "assets/image.png"), Buffer.from([44, 55]));
    await restoreProjectVersion(
      "demo",
      await h.versions.prepareRestore(version.version.id),
      controller.recordEdit,
      h.io.writeFile,
    );
    if (direction === "redo") await controller.undo(h.callbacks);
    const image = readFileSync(join(h.root, "assets/image.png"));
    const state = structuredClone(controller.snapshot().state);
    h.setFault((path) => {
      if (path.endsWith("/versions/save")) {
        writeFileSync(join(h.root, "index.html"), "external");
        throw new Error("history disk failure");
      }
    });
    await expect(controller[direction](h.callbacks)).rejects.toThrow("rollback did not complete");
    expect(readFileSync(join(h.root, "assets/image.png"))).toEqual(image);
    expect(await h.io.readFile("index.html")).toBe("external");
    expect(controller.snapshot().state).toEqual(state);
  },
);

it("migrates legacy IndexedDB history and keeps redo after IndexedDB is replaced", async () => {
  const h = await harness();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const after = await h.io.readFile("index.html");
  const legacy = pushEditHistoryEntry(
    createEmptyEditHistory(),
    buildEditHistoryEntry({
      id: "legacy",
      projectId: "demo",
      label: "Legacy",
      now: 1,
      files: { "index.html": { before: "<p>Legacy</p>", after } },
    }),
  );
  await createIndexedDbEditHistoryStorage().set("demo", legacy);
  const migrated = await h.open();
  expect(migrated.snapshot().state).toEqual(legacy);
  expect((await migrated.undo(h.callbacks)).ok).toBe(true);
  vi.stubGlobal("indexedDB", new IDBFactory());
  h.restart();
  const reopened = await h.open();
  expect((await reopened.redo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("index.html")).toBe(after);
});

it("can repair missing current media and undo it exactly while refusing playback of the incomplete baseline", async () => {
  const h = await harness(),
    controller = await h.open();
  const checkpoint = await h.versions.save("Healthy");
  rmSync(join(h.root, "assets/image.png"));
  await restoreProjectVersion(
    "demo",
    await h.versions.prepareRestore(checkpoint.version.id),
    controller.recordEdit,
    h.io.writeFile,
  );
  expect(readFileSync(join(h.root, "assets/image.png"))).toEqual(originalImage);
  const baseline = controller.snapshot().state.undo[0]!.beforeVersionId!;
  await expect(h.versions.read(baseline)).rejects.toThrow("puuttuu");
  expect((await controller.undo(h.callbacks)).ok).toBe(true);
  await expect(h.versions.read(baseline)).rejects.toThrow("puuttuu");
  expect((await controller.redo(h.callbacks)).ok).toBe(true);
  expect(readFileSync(join(h.root, "assets/image.png"))).toEqual(originalImage);
});

it("compensates a restore if the active project changes before history publication", async () => {
  const h = await harness(),
    controller = await h.open();
  const checkpoint = await h.versions.save("Palautettava");
  const changed = "<p>Newer active source</p>";
  await h.io.writeFile("index.html", changed, await h.io.readFile("index.html"));
  const prepared = await h.versions.prepareRestore(checkpoint.version.id);
  const record = vi.fn(controller.recordEdit);
  let checks = 0;
  await expect(
    restoreProjectVersion("demo", prepared, record, h.io.writeFile, () => {
      if (++checks === 3) throw new Error("Avoin projekti vaihtui");
    }),
  ).rejects.toThrow("vaihtui");
  expect(await h.io.readFile("index.html")).toBe(changed);
  expect(record).not.toHaveBeenCalled();
  expect(controller.snapshot().state.undo).toHaveLength(0);
});

it("refreshes a second real-file client completely, then preserves both edits through undo and redo", async () => {
  const h = await harness();
  const a = await h.open(),
    b = await h.open();
  bindOperationHistory(a.recordEdit, "demo");
  bindOperationHistory(b.recordEdit, "demo");
  const save = (controller: typeof a, label: string) =>
    saveProjectFilesWithHistory({
      projectId: "demo",
      label,
      kind: "source",
      files: { "index.html": label },
      ...h.io,
      recordEdit: controller.recordEdit,
    });
  await save(a, "A");
  const bytes = readFileSync(join(h.root, "index.html"));
  await expect(save(b, "stale B")).rejects.toThrow("historia muuttui");
  expect(readFileSync(join(h.root, "index.html"))).toEqual(bytes);
  let source: string | null = null;
  await b.refresh(async () => {
    source = await h.io.readFile("index.html");
  });
  expect(source).toBe("A");
  expect(b.snapshot().state).toEqual(a.snapshot().state);
  await save(b, "B");
  await a.refresh();
  expect(a.snapshot().state.undo.map((e) => e.label)).toEqual(["A", "B"]);
  expect((await a.undo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("index.html")).toBe("A");
  expect((await a.redo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("index.html")).toBe("B");
  await b.refresh();
  expect(b.snapshot().state).toEqual(a.snapshot().state);
  expect(
    (await operationRequest("demo", "operations")).operations
      .map((r: { status: string }) => r.status)
      .sort(),
  ).toEqual(["completed", "completed", "uncertain"]);
});

it.each(["read failure", "source race", "history race"])(
  "keeps the old token and complete local stacks after refresh %s",
  async (failure) => {
    const h = await harness();
    const a = await h.open(),
      b = await h.open();
    await saveProjectFilesWithHistory({
      projectId: "demo",
      label: "A",
      kind: "source",
      files: { "index.html": "A" },
      ...h.io,
      recordEdit: a.recordEdit,
    });
    const previous = structuredClone(b.snapshot().state);
    await expect(
      b.refresh(async () => {
        await h.io.readFile("index.html");
        if (failure === "read failure") throw new Error("read failed");
        if (failure === "source race") writeFileSync(join(h.root, "index.html"), "remote");
        else await h.versions.save("Remote checkpoint");
      }),
    ).rejects.toThrow(failure === "read failure" ? "read failed" : "päivityksen aikana");
    expect(b.snapshot().state).toEqual(previous);
    const bytes = readFileSync(join(h.root, "index.html"));
    await expect(
      saveProjectFilesWithHistory({
        projectId: "demo",
        label: "B",
        kind: "source",
        files: { "index.html": "B" },
        ...h.io,
        recordEdit: b.recordEdit,
      }),
    ).rejects.toThrow("historia muuttui");
    expect(readFileSync(join(h.root, "index.html"))).toEqual(bytes);
    await b.refresh();
    expect(b.snapshot().state.undo.map((e) => e.label)).toEqual(["A"]);
  },
);

it("reconciles a lost history response, preserves real undo/redo and never repeats the completed source operation", async () => {
  const h = await harness(),
    controller = await h.open();
  bindOperationHistory(controller.recordEdit, "demo");
  const before = await h.io.readFile("index.html");
  h.setAfterResponse((path) => {
    if (path.endsWith("/versions/save")) {
      h.setAfterResponse();
      throw new Error("response lost");
    }
  });
  await saveProjectFilesWithHistory({
    projectId: "demo",
    label: "Create",
    kind: "source",
    files: { "index.html": "<p>After</p>", "new.html": "" },
    ...h.io,
    recordEdit: controller.recordEdit,
  });
  const evidence = await operationRequest("demo", "operations");
  expect(evidence.operations).toHaveLength(1);
  expect(evidence.operations[0]).toMatchObject({ status: "completed", retryAllowed: false });
  h.restart();
  const reopened = await h.open();
  expect((await reopened.undo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("index.html")).toBe(before);
  expect(await h.io.readFile("new.html")).toBeNull();
  expect((await reopened.redo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("new.html")).toBe("");
  expect((await operationRequest("demo", "operations")).operations).toHaveLength(1);
});
it("leaves an unresolvable publication intact instead of rolling back a possibly committed history", async () => {
  const h = await harness(),
    controller = await h.open();
  bindOperationHistory(controller.recordEdit, "demo");
  h.setAfterResponse((path) => {
    if (path.endsWith("/versions/save")) {
      h.setFault(() => {
        throw new Error("offline");
      });
      throw new Error("response lost");
    }
  });
  await expect(
    saveProjectFilesWithHistory({
      projectId: "demo",
      label: "Create",
      kind: "source",
      files: { "index.html": "<p>After</p>" },
      ...h.io,
      recordEdit: controller.recordEdit,
    }),
  ).rejects.toBeInstanceOf(UncertainSourceOperation);
  expect(readFileSync(join(h.root, "index.html"), "utf8")).toBe("<p>After</p>");
  h.setFault();
  h.setAfterResponse();
  h.restart();
  expect((await operationRequest("demo", "operations")).operations[0].status).toBe("completed");
  expect((await h.open()).snapshot().state.undo).toHaveLength(1);
});

it.each(["before-write", "before-history"])(
  "reconciles %s interruption without inferring execution from source bytes",
  async (phase) => {
    const h = await harness(),
      controller = await h.open();
    bindOperationHistory(controller.recordEdit, "demo");
    const before = await h.io.readFile("index.html");
    h.setFault((path) => {
      const target = phase === "before-write" ? "/operations/write" : "/versions/save";
      if (path.endsWith(target)) throw new Error("connection closed");
    });
    await expect(
      saveProjectFilesWithHistory({
        projectId: "demo",
        label: "Interrupted",
        kind: "source",
        files: { "index.html": "<p>Candidate</p>" },
        ...h.io,
        recordEdit: controller.recordEdit,
      }),
    ).rejects.toBeInstanceOf(UncertainSourceOperation);
    h.setFault();
    expect(await h.io.readFile("index.html")).toBe(
      phase === "before-write" ? before : "<p>Candidate</p>",
    );
    const result = await operationRequest("demo", "operations");
    expect(result.operations[0]).toMatchObject({ status: "uncertain", retryAllowed: false });
    writeFileSync(join(h.root, "index.html"), "<p>User intervened</p>");
    h.restart();
    expect((await operationRequest("demo", "operations")).operations[0]).toMatchObject({
      status: "uncertain",
      changedSince: true,
    });
    expect(await h.io.readFile("index.html")).toBe("<p>User intervened</p>");
    expect((await h.open()).snapshot().state.undo).toHaveLength(0);
  },
);

it("records nested motion metadata and deletion through operation-bound source writes", async () => {
  const { openComposition } = await import("@hyperframes/sdk");
  const { persistTrackedGsapEdit } = await import("./trackedGsapEdit");
  const h = await harness();
  mkdirSync(join(h.root, "scenes"));
  const path = "scenes/title.html";
  const original =
    '<div data-composition-id="scene" data-duration="7"><p id="title">Hi</p></div><script>const tl=gsap.timeline({paused:true});tl.to("#title",{x:100,duration:1},0);window.__timelines={scene:tl};</script>';
  writeFileSync(join(h.root, path), original);
  const controller = await h.open();
  bindOperationHistory(controller.recordEdit, "demo");
  const composition = await openComposition(original, { history: false });
  const id = [...composition.getAllAnimationIds()][0]!;
  composition.dispose();
  const deps = {
    editHistory: controller,
    readProjectFile: async (p: string) => (await h.io.readFile(p))!,
    writeProjectFile: h.io.writeFile,
    reloadPreview: () => {},
    domEditSaveTimestampRef: { current: 0 },
  };
  expect(await persistTrackedGsapEdit(path, id, { duration: 2, ease: "power2.out" }, deps)).toBe(
    true,
  );
  const after = await h.io.readFile(path);
  expect(after).toContain("power2.out");
  expect(await persistTrackedGsapEdit(path, id, null, deps)).toBe(true);
  expect(
    (await operationRequest("demo", "operations")).operations.every(
      (o: { status: string }) => o.status === "completed",
    ),
  ).toBe(true);
  expect((await controller.undo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile(path)).toBe(after);
  expect((await controller.undo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile(path)).toBe(original);
});

it("binds ordinary text and inline-style edits to durable operations and exact undo", async () => {
  const { persistTrackedDomEdit } = await import("./trackedDomEdit");
  const h = await harness();
  const before =
    '<div data-composition-id="main" data-duration="7"><p data-hf-id="title">Original</p></div>';
  writeFileSync(join(h.root, "index.html"), before);
  const controller = await h.open();
  bindOperationHistory(controller.recordEdit, "demo");
  const result = await persistTrackedDomEdit({
    projectId: "demo",
    sourceFile: "index.html",
    hfId: "title",
    before,
    operations: [
      { type: "text-content", property: "textContent", value: "Changed" },
      { type: "inline-style", property: "color", value: "red" },
    ],
    label: "Edit text",
    recordEdit: controller.recordEdit,
    writeFile: h.io.writeFile,
  });
  expect(result?.changed).toBe(true);
  expect((await operationRequest("demo", "operations")).operations[0].status).toBe("completed");
  expect(await h.io.readFile("index.html")).toContain("Changed");
  expect((await controller.undo(h.callbacks)).ok).toBe(true);
  expect(await h.io.readFile("index.html")).toBe(before);
});
