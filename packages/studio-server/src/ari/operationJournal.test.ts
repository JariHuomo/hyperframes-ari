import { expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { versionTestProject } from "./versionTestProject";
import {
  prepareSourceOperation,
  reconcileSourceOperations,
  writeSourceOperation,
} from "./operationJournal";
import { projectVersionFiles, sourceRevision } from "./versionFiles";
import { readVersionIndex, saveProjectVersion } from "./versionStore";
import type { VersionHistoryState } from "./versionHistory";

function setup() {
  const root = versionTestProject({ "index.html": "<p>Ennen</p>" });
  const intent = {
    id: "op-one",
    label: "Muokkaa elementtejä",
    kind: "source",
    baseRevision: sourceRevision(projectVersionFiles(root)),
    files: { "index.html": { before: "<p>Ennen</p>", after: "<p>Jälkeen</p>" } },
  };
  const history: VersionHistoryState = {
    version: 1,
    updatedAt: 1,
    undo: [
      {
        id: "edit-one",
        operationId: intent.id,
        projectId: "local",
        label: intent.label,
        kind: "source",
        createdAt: 1,
        files: { "index.html": { ...intent.files["index.html"], beforeHash: "a", afterHash: "b" } },
      },
    ],
    redo: [],
  };
  const results = () =>
    reconcileSourceOperations(root, readVersionIndex(root).index.operations ?? []);
  const publish = (finish?: () => void) =>
    saveProjectVersion(
      root,
      {
        expectedIndex: readVersionIndex(root).token,
        expectedRevision: sourceRevision(projectVersionFiles(root)),
        history,
        beforeFiles: { "index.html": Buffer.from(intent.files["index.html"].before) },
      },
      finish,
    );
  return {
    root,
    intent,
    history,
    results,
    publish,
    write: () => writeSourceOperation(root, intent.id, "index.html"),
  };
}
it("persists intent before writing and never infers success from identical source text", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  expect(t.results()[0]).toMatchObject({
    status: "uncertain",
    retryAllowed: false,
    changedSince: false,
  });
  writeFileSync(join(t.root, "index.html"), t.intent.files["index.html"].after);
  expect(t.results()[0]).toMatchObject({
    status: "uncertain",
    retryAllowed: false,
    changedSince: true,
  });
  expect(() => prepareSourceOperation(t.root, t.intent)).toThrow("jo aloitettu");
});
it("binds the completed receipt to the same history publication and survives a lost response", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  t.write();
  const saved = t.publish(); // Discard the response: fresh readers use only disk.
  expect(t.results()[0]).toMatchObject({
    status: "completed",
    receipt: {
      historyId: "edit-one",
      versionId: saved.version.id,
      resultRevision: saved.version.revision,
    },
  });
  expect(() => prepareSourceOperation(t.root, t.intent)).toThrow("jo aloitettu");
  expect(readFileSync(join(t.root, "index.html"), "utf8")).toBe(t.intent.files["index.html"].after);
});
it("does not publish completion when history publication fails halfway", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  t.write();
  expect(() =>
    t.publish(() => {
      throw new Error("disk full");
    }),
  ).toThrow("disk full");
  expect(readVersionIndex(t.root).index.history).toBeNull();
  expect(t.results()[0]).toMatchObject({ status: "uncertain", receipt: null });
});
it("refuses the same id with different intent and competing requests without changing sources", async () => {
  const t = setup();
  const results = await Promise.allSettled([
    Promise.resolve().then(() => prepareSourceOperation(t.root, t.intent)),
    Promise.resolve().then(() => prepareSourceOperation(t.root, t.intent)),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  expect(() => prepareSourceOperation(t.root, { ...t.intent, label: "Muu" })).toThrow(
    "eri muutokseen",
  );
  expect(readFileSync(join(t.root, "index.html"), "utf8")).toBe(
    t.intent.files["index.html"].before,
  );
});
it("preserves user changes and refuses history whose files do not match the bound intent", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  t.write();
  t.history.undo[0]!.files["index.html"]!.after = "<p>Muu</p>";
  expect(() => t.publish()).toThrow("ei vastaa");
  t.history.undo[0]!.files["index.html"]!.after = t.intent.files["index.html"].after;
  writeFileSync(join(t.root, "other.html"), "user");
  expect(() => t.publish()).toThrow("muu sisältö muuttui");
  expect(readFileSync(join(t.root, "other.html"), "utf8")).toBe("user");
});
it("retains execution evidence across later source changes and automatic version/history cleanup", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  t.write();
  const saved = t.publish();
  for (let i = 0; i < 103; i++) {
    writeFileSync(
      join(t.root, "index.html"),
      i % 2 ? t.intent.files["index.html"].before : t.intent.files["index.html"].after,
    );
    saveProjectVersion(t.root, {
      expectedIndex: readVersionIndex(t.root).token,
      expectedRevision: sourceRevision(projectVersionFiles(t.root)),
      history: { version: 1, updatedAt: i, undo: [], redo: [] },
    });
  }
  expect(readVersionIndex(t.root).index.versions.some((v) => v.id === saved.version.id)).toBe(
    false,
  );
  expect(t.results()[0]).toMatchObject({
    status: "completed",
    receipt: { versionId: saved.version.id },
    retryAllowed: false,
  });
});
it("rejects stale and out-of-project intents before any journal publication", () => {
  const t = setup();
  expect(() => prepareSourceOperation(t.root, { ...t.intent, baseRevision: "stale" })).toThrow(
    "muuttui",
  );
  expect(() => prepareSourceOperation(t.root, { ...t.intent, id: "../outside" })).toThrow();
  expect(t.results()).toEqual([]);
});

it("does not mistake private writer backups for a concurrent source edit", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  t.write();
  mkdirSync(join(t.root, ".hyperframes/backup"), { recursive: true });
  writeFileSync(join(t.root, ".hyperframes/backup/old.html"), "old private bytes");
  t.publish();
  expect(t.results()[0].status).toBe("completed");
});

it("requires operation-specific source-write evidence even when externally written bytes match exactly", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  writeFileSync(join(t.root, "index.html"), t.intent.files["index.html"].after);
  expect(() => t.publish()).toThrow("todiste puuttuu");
  expect(t.results()[0].status).toBe("uncertain");
});
it("conditionally compensates a failed source/evidence publication and preserves foreign edits", () => {
  const t = setup();
  prepareSourceOperation(t.root, t.intent);
  expect(() =>
    writeSourceOperation(t.root, t.intent.id, "index.html", () => {
      throw new Error("write failed");
    }),
  ).toThrow("write failed");
  expect(readFileSync(join(t.root, "index.html"), "utf8")).toBe(
    t.intent.files["index.html"].before,
  );
  expect(() =>
    writeSourceOperation(t.root, t.intent.id, "index.html", () => {
      writeFileSync(join(t.root, "index.html"), "foreign");
      throw new Error("write failed");
    }),
  ).toThrow("palautus jäi kesken");
  expect(readFileSync(join(t.root, "index.html"), "utf8")).toBe("foreign");
  expect(t.results()[0].status).toBe("uncertain");
});
