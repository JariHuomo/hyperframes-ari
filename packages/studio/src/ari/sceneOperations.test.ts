// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { adTemplate } from "../../../studio-server/src/ari/projectTemplates";
import { commitConditionalFiles } from "../../../studio-server/src/ari/conditionalFiles";
import { fileContentVersion } from "../../../studio-server/src/helpers/fileVersion";
import { createPersistentEditHistoryController } from "../hooks/usePersistentEditHistory";
import { memoryHistoryStorage } from "../utils/historyTestStorage";
import { readSceneStructure, prepareSceneOperation, saveSceneOperation } from "./sceneOperations";
import {
  editSceneHost,
  parseSceneHost,
  resolveScenePath,
  type SceneOperation,
} from "./sceneStructure";
async function setup() {
  const root = mkdtempSync(join(tmpdir(), "ari-scenes-"));
  const original = adTemplate("Paikallinen", "product").replaceAll("\n", "\r\n");
  writeFileSync(join(root, "index.html"), original);
  const storage = memoryHistoryStorage();
  const reopen = () =>
    createPersistentEditHistoryController({ projectId: root, storage, onChange: () => {} });
  const history = await reopen();
  const io = {
    readFile: async (path: string) =>
      existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : null,
    writeFile: async (path: string, content: string | null, expected?: string | null) => {
      if (expected === undefined) throw new Error("baseline missing");
      commitConditionalFiles(root, [
        {
          path,
          content: content === null ? null : Buffer.from(content),
          expectedVersion: expected === null ? null : fileContentVersion(expected),
        },
      ]);
    },
    recordEdit: history.recordEdit,
  };
  const prepare = (operation: SceneOperation) => prepareSceneOperation(io, "index.html", operation);
  const save = async (operation: SceneOperation) =>
    saveSceneOperation({
      projectId: root,
      sourceFile: "index.html",
      operation,
      reviewVersion: (await prepare(operation)).review.reviewVersion,
      io,
      assertActive: () => {},
    });
  return {
    root,
    original,
    history,
    reopen,
    io,
    save,
    prepare,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
const add: SceneOperation = { action: "add", name: "Kortti", duration: 2, fileName: "card.html" };
describe("scene structure real-file transactions", () => {
  it("creates host + source in one entry; reopened undo restores original bytes and absence; redo restores exact source", async () => {
    const s = await setup();
    try {
      const receipt = await s.save(add);
      expect(receipt).toMatchObject({
        stage: "saved",
        beforeDuration: 7,
        afterDuration: 9,
        affectsInstances: 1,
      });
      const saved = await s.io.readFile("index.html"),
        child = await s.io.readFile("scenes/card.html");
      expect(s.history.snapshot().state.undo).toHaveLength(1);
      const reopened = await s.reopen();
      expect((await reopened.undo(s.io)).ok).toBe(true);
      expect(await s.io.readFile("index.html")).toBe(s.original);
      expect(await s.io.readFile("scenes/card.html")).toBeNull();
      expect((await reopened.redo(s.io)).ok).toBe(true);
      expect(await s.io.readFile("index.html")).toBe(saved);
      expect(await s.io.readFile("scenes/card.html")).toBe(child);
    } finally {
      s.cleanup();
    }
  });
  it("renames, shares an unchanged animated/media source, reorders and deletes only the placement", async () => {
    const s = await setup();
    try {
      const first = await s.save(add);
      const child = (await s.io.readFile("scenes/card.html"))!.replace(
        "</div><script>",
        '<img src="../assets/photo.png"></div><script>',
      );
      writeFileSync(join(s.root, "scenes/card.html"), child);
      await s.save({ action: "rename", target: first.target, name: "Avaus" });
      const copy = await s.save({ action: "duplicate", target: first.target });
      expect(copy.affectsInstances).toBe(2);
      expect(copy.target).not.toBe(first.target);
      expect(await s.io.readFile("scenes/card.html")).toBe(child);
      await s.save({ action: "add", name: "Loppu", duration: 3, fileName: "end.html" });
      await s.save({ action: "later", target: first.target });
      let state = await readSceneStructure(s.io, "index.html");
      expect(state.rows.map((r) => r.start)).toEqual([7, 9, 11]);
      expect(state.duration).toBe(14);
      expect(state.rows[1].target).toBe(first.target);
      await s.save({ action: "earlier", target: first.target });
      const before = await s.io.readFile("index.html");
      await s.save({ action: "delete", target: copy.target });
      const after = await s.io.readFile("index.html");
      state = await readSceneStructure(s.io, "index.html");
      expect(state.duration).toBe(12);
      expect(state.rows.map((r) => r.start)).toEqual([7, 9]);
      expect(await s.io.readFile("scenes/card.html")).toBe(child);
      expect((await s.history.undo(s.io)).ok).toBe(true);
      expect(await s.io.readFile("index.html")).toBe(before);
      expect((await s.history.redo(s.io)).ok).toBe(true);
      expect(await s.io.readFile("index.html")).toBe(after);
    } finally {
      s.cleanup();
    }
  });
  it.each(["host", "source", "new-file"])(
    "rejects stale %s without changing other files",
    async (kind) => {
      const s = await setup();
      try {
        await s.save(add);
        const op: SceneOperation = {
          action: "add",
          name: "Next",
          duration: 2,
          fileName: "next.html",
        };
        const plan = await s.prepare(op);
        const path =
          kind === "host"
            ? "index.html"
            : kind === "source"
              ? "scenes/card.html"
              : "scenes/next.html";
        writeFileSync(
          join(s.root, path),
          ((await s.io.readFile(path)) ?? "") + "<!-- external -->",
        );
        const host = await s.io.readFile("index.html"),
          external = await s.io.readFile(path);
        await expect(
          saveSceneOperation({
            projectId: s.root,
            sourceFile: "index.html",
            operation: op,
            reviewVersion: plan.review.reviewVersion,
            io: s.io,
            assertActive: () => {},
          }),
        ).rejects.toThrow();
        expect(await s.io.readFile(path)).toBe(external);
        expect(await s.io.readFile("index.html")).toBe(host);
      } finally {
        s.cleanup();
      }
    },
  );
  it.each(["second-write", "history"])(
    "compensates %s failure including new file deletion",
    async (phase) => {
      const s = await setup();
      try {
        const plan = await s.prepare(add);
        const io = {
          ...s.io,
          writeFile: async (path: string, content: string | null, expected?: string | null) => {
            if (phase === "second-write" && path === "index.html") throw new Error("write failed");
            await s.io.writeFile(path, content, expected);
          },
          recordEdit: async () => {
            throw new Error("history failed");
          },
        };
        await expect(
          saveSceneOperation({
            projectId: s.root,
            sourceFile: "index.html",
            operation: add,
            reviewVersion: plan.review.reviewVersion,
            io,
            assertActive: () => {},
          }),
        ).rejects.toThrow("failed");
        expect(await s.io.readFile("index.html")).toBe(s.original);
        expect(await s.io.readFile("scenes/card.html")).toBeNull();
        expect(s.history.snapshot().state.undo).toHaveLength(0);
      } finally {
        s.cleanup();
      }
    },
  );
  it("preserves external change while compensating other files and reports incomplete rollback", async () => {
    const s = await setup();
    try {
      const plan = await s.prepare(add);
      const io = {
        ...s.io,
        recordEdit: async () => {
          writeFileSync(join(s.root, "index.html"), "external");
          throw new Error("history failed");
        },
      };
      await expect(
        saveSceneOperation({
          projectId: s.root,
          sourceFile: "index.html",
          operation: add,
          reviewVersion: plan.review.reviewVersion,
          io,
          assertActive: () => {},
        }),
      ).rejects.toThrow(/rollback|palaut/i);
      expect(await s.io.readFile("index.html")).toBe("external");
      expect(await s.io.readFile("scenes/card.html")).toBeNull();
    } finally {
      s.cleanup();
    }
  });
  it("undo/redo preserve external newly created or recreated files and history stacks", async () => {
    const s = await setup();
    try {
      await s.save(add);
      expect((await s.history.undo(s.io)).ok).toBe(true);
      mkdirSync(dirname(join(s.root, "scenes/card.html")), { recursive: true });
      writeFileSync(join(s.root, "scenes/card.html"), "");
      expect((await s.history.redo(s.io)).ok).toBe(false);
      expect(await s.io.readFile("scenes/card.html")).toBe("");
      expect(s.history.snapshot().state.redo).toHaveLength(1);
    } finally {
      s.cleanup();
    }
  });
  it("keeps playback start/rate and source bytes when reordering", async () => {
    const s = await setup();
    try {
      await s.save(add);
      await s.save({ action: "add", name: "End", duration: 2, fileName: "end.html" });
      const source = (await s.io.readFile("index.html"))!
        .replace('data-playback-rate="1"', 'data-playback-rate="0.5"')
        .replace('data-playback-start="0"', 'data-playback-start="0.5"');
      writeFileSync(join(s.root, "index.html"), source);
      const row = (await readSceneStructure(s.io, "index.html")).rows[0];
      const result = await s.save({ action: "later", target: row.target });
      expect(result.rows[1]).toMatchObject({
        playbackStart: 0.5,
        playbackRate: 0.5,
        duration: 2,
        start: 9,
      });
    } finally {
      s.cleanup();
    }
  });
});
describe("source contract refusals", () => {
  it.each(["../x.html", "x/abc.html", "ABC.html", "a%2f.html"])(
    "refuses unsafe new name %s",
    (fileName) => {
      expect(() =>
        editSceneHost(adTemplate("Test", "blank"), "index.html", { ...add, fileName }),
      ).toThrow();
    },
  );
  it("refuses removed targets and edge reorder", () => {
    const first = editSceneHost(adTemplate("Test", "blank"), "index.html", add);
    expect(() =>
      editSceneHost(first.after, "index.html", { action: "delete", target: "gone" }),
    ).toThrow("poistettu");
    expect(() =>
      editSceneHost(first.after, "index.html", { action: "earlier", target: first.target }),
    ).toThrow("reunassa");
  });
  it("refuses overlap and host motion before modifying sources", () => {
    const first = editSceneHost(adTemplate("Test", "blank"), "index.html", add);
    expect(() =>
      parseSceneHost(first.after.replace('data-start="7"', 'data-start="6"'), "index.html"),
    ).toThrow();
    expect(() =>
      parseSceneHost(
        first.after.replace(
          "window.__timelines.main = tl;",
          "tl.to('#scene-card',{x:5,duration:1},7); window.__timelines.main = tl;",
        ),
        "index.html",
      ),
    ).toThrow("Isäntään");
  });
  it("resolves local nested paths and rejects escape", () => {
    expect(resolveScenePath("sub/main.html", "scenes/card.html")).toBe("sub/scenes/card.html");
    expect(() => resolveScenePath("index.html", "../x.html")).toThrow();
  });
});

it("uses CSS-safe ids for numeric filenames and avoids hf-only duplicate collisions", () => {
  const first = editSceneHost(adTemplate("Test", "blank"), "index.html", {
    action: "add",
    name: "Numbers",
    duration: 2,
    fileName: "123.html",
  });
  expect(first.target).toBe("scene-123");
  expect(first.created!.content).toContain("#scene-123-background");
  const occupied = first.after.replace(
    "</body>",
    '<div data-hf-id="scene-123-copy-1"></div></body>',
  );
  const copy = editSceneHost(occupied, "index.html", { action: "duplicate", target: first.target });
  expect(copy.target).toBe("scene-123-copy-2");
});

it("rolls back the host if an unchanged referenced source changes during commit", async () => {
  const s = await setup();
  try {
    const first = await s.save(add);
    const before = await s.io.readFile("index.html");
    const operation: SceneOperation = { action: "rename", target: first.target, name: "Changed" };
    const plan = await s.prepare(operation);
    let injected = false;
    const io = {
      ...s.io,
      writeFile: async (path: string, content: string | null, expected?: string | null) => {
        await s.io.writeFile(path, content, expected);
        if (path === "index.html" && !injected) {
          injected = true;
          writeFileSync(join(s.root, "scenes/card.html"), "external source");
        }
      },
    };
    await expect(
      saveSceneOperation({
        projectId: s.root,
        sourceFile: "index.html",
        operation,
        reviewVersion: plan.review.reviewVersion,
        io,
        assertActive: () => {},
      }),
    ).rejects.toThrow("lähde muuttui");
    expect(await s.io.readFile("index.html")).toBe(before);
    expect(await s.io.readFile("scenes/card.html")).toBe("external source");
    expect(s.history.snapshot().state.undo).toHaveLength(1);
  } finally {
    s.cleanup();
  }
});

const ownCopy = (target: string): SceneOperation => ({
  action: "detach",
  target,
  fileName: "own.html",
});
describe("independent scene source", () => {
  it("isolates only the selected placement, keeps timing/media/motion bytes, and reopens exact undo/redo", async () => {
    const s = await setup();
    try {
      const first = await s.save(add);
      const second = await s.save({ action: "duplicate", target: first.target });
      const host = (await s.io.readFile("index.html"))!
        .replaceAll('data-playback-rate="1"', 'data-playback-rate="0.5"')
        .replaceAll('data-playback-start="0"', 'data-playback-start="0.25"');
      writeFileSync(join(s.root, "index.html"), host);
      const originalChild = (await s.io.readFile("scenes/card.html"))!
        .replace(
          "</head>",
          "<style>.photo { background-image:url(../assets/photo.png) }</style></head>",
        )
        .replace("</body>", '<img src="../assets/photo.png"></body>');
      writeFileSync(join(s.root, "scenes/card.html"), originalChild);
      const before = await readSceneStructure(s.io, "index.html");
      const receipt = await s.save(ownCopy(second.target));
      expect(receipt.affectsInstances).toBe(1);
      expect(receipt.rows[0]).toEqual(before.rows[0]);
      expect(receipt.rows[1]).toEqual({ ...before.rows[1], sourceFile: "scenes/own.html" });
      expect(await s.io.readFile("scenes/own.html")).toBe(originalChild);
      const savedHost = await s.io.readFile("index.html");
      const history = await s.reopen();
      expect((await history.undo(s.io)).ok).toBe(true);
      expect(await s.io.readFile("index.html")).toBe(host);
      expect(await s.io.readFile("scenes/own.html")).toBeNull();
      expect((await history.redo(s.io)).ok).toBe(true);
      expect(await s.io.readFile("index.html")).toBe(savedHost);
      expect(await s.io.readFile("scenes/own.html")).toBe(originalChild);
      await s.io.writeFile(
        "scenes/own.html",
        originalChild.replace("Tausta", "Oma tausta"),
        originalChild,
      );
      expect(await s.io.readFile("scenes/card.html")).toBe(originalChild);
    } finally {
      s.cleanup();
    }
  });
  it.each(["host", "source", "collision", "removed", "write", "history"])(
    "refuses or compensates %s without an orphan",
    async (failure) => {
      const s = await setup();
      try {
        const first = await s.save(add);
        const operation = ownCopy(first.target);
        const plan = await s.prepare(operation);
        if (failure === "host" || failure === "source") {
          const path = failure === "host" ? "index.html" : "scenes/card.html";
          writeFileSync(join(s.root, path), (await s.io.readFile(path)) + "<!-- external -->");
        }
        if (failure === "collision") writeFileSync(join(s.root, "scenes/own.html"), "external");
        if (failure === "removed") await s.save({ action: "delete", target: first.target });
        const host = await s.io.readFile("index.html");
        const source = await s.io.readFile("scenes/card.html");
        const undoCount = s.history.snapshot().state.undo.length;
        const io = {
          ...s.io,
          writeFile: async (path: string, content: string | null, expected?: string | null) => {
            if (failure === "write" && path === "index.html") throw new Error("write failed");
            await s.io.writeFile(path, content, expected);
          },
          recordEdit: async (...args: Parameters<typeof s.io.recordEdit>) => {
            if (failure === "history") throw new Error("history failed");
            await s.io.recordEdit(...args);
          },
        };
        await expect(
          saveSceneOperation({
            projectId: s.root,
            sourceFile: "index.html",
            operation,
            reviewVersion: plan.review.reviewVersion,
            io,
            assertActive: () => {},
          }),
        ).rejects.toThrow();
        expect(await s.io.readFile("index.html")).toBe(host);
        expect(await s.io.readFile("scenes/card.html")).toBe(source);
        expect(await s.io.readFile("scenes/own.html")).toBe(
          failure === "collision" ? "external" : null,
        );
        expect(s.history.snapshot().state.undo).toHaveLength(undoCount);
      } finally {
        s.cleanup();
      }
    },
  );
  it("refuses transitive scene dependencies before writing", async () => {
    const s = await setup();
    try {
      const first = await s.save(add);
      const path = join(s.root, "scenes/card.html");
      writeFileSync(
        path,
        (await s.io.readFile("scenes/card.html"))!.replace(
          "</body>",
          '<div data-composition-src="child.html"></div></body>',
        ),
      );
      await expect(s.prepare(ownCopy(first.target))).rejects.toThrow("muita kohtauslähteitä");
      expect(await s.io.readFile("scenes/own.html")).toBeNull();
    } finally {
      s.cleanup();
    }
  });
});

it("gives a new scene a real stacking layer above base elements", () => {
  const result = editSceneHost(adTemplate("Local", "blank"), "index.html", {
    action: "add",
    name: "Scene",
    fileName: "scene.html",
    duration: 2,
  });
  const host = new DOMParser()
    .parseFromString(result.after, "text/html")
    .querySelector("[data-composition-src]") as HTMLElement;
  expect(host.style.zIndex).toBe("10");
  expect(host.getAttribute("data-track-index")).toBe("10");
});
