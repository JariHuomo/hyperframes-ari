import { expect, it } from "vitest";
import { readFileSync, writeFileSync, symlinkSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { versionTestProject } from "./versionTestProject";
import { readNotebook, saveNotebook } from "./notebook";
import { projectVersionFiles, sourceRevision, versionDigest } from "./versionFiles";
import { readVersionIndex, saveProjectVersion } from "./versionStore";
const notebookPath = ".ari-notebook/notebook.json";
function setup() {
  const root = versionTestProject({
    "index.html": "<p>Alku</p>",
    "assets/test.png": Buffer.from([0, 1, 2]),
  });
  const save = (input: object, finish?: () => void) =>
    saveNotebook(root, { expectedToken: readNotebook(root).token, ...input }, finish);
  return { root, save };
}
it("persists brief, manual tasks, verified assets and attributed observations independently of sources and history", () => {
  const { root, save } = setup();
  const revision = sourceRevision(projectVersionFiles(root));
  saveProjectVersion(root, { expectedRevision: revision, expectedIndex: null, name: "Ennen" });
  const index = readVersionIndex(root);
  save({ action: "brief", goal: "Näytä tuote", texts: "Pieni tauko." });
  save({
    action: "assets",
    assets: [{ path: "assets/test.png", checksum: versionDigest(Buffer.from([0, 1, 2])) }],
  });
  const task = save({ action: "task", text: "Tarkista teksti" }).notebook.tasks[0]!;
  save({ action: "task_status", id: task.id, status: "done" });
  save({
    action: "observation",
    author: "Tarkistaja",
    authorType: "external_agent",
    revision,
    coverage: "Ensimmäinen ruutu",
    text: "Teksti näkyy.",
  });
  const reopened = readNotebook(root);
  expect(reopened.notebook.goal).toBe("Näytä tuote");
  expect(reopened.notebook.tasks[0]?.status).toBe("done");
  expect(reopened.notebook.operations).toEqual([]);
  expect(reopened.notebook.observations[0]).toMatchObject({
    authorType: "external_agent",
    revision,
  });
  expect(reopened.staleObservationIds).toEqual([]);
  expect(reopened.revision).toBe(revision);
  expect(readVersionIndex(root)).toEqual(index);
  expect(projectVersionFiles(root)[notebookPath]).toBeUndefined();
});
it("preserves old observations and marks them stale after a real source edit", () => {
  const { root, save } = setup();
  const revision = readNotebook(root).revision;
  const saved = save({
    action: "observation",
    revision,
    author: "Ihminen",
    authorType: "human",
    coverage: "Koko video",
    text: "Kirjattu arvio",
  });
  writeFileSync(join(root, "index.html"), "<p>Muutos</p>");
  expect(readNotebook(root).staleObservationIds).toEqual([saved.notebook.observations[0]!.id]);
  expect(() =>
    save({
      action: "observation",
      revision,
      author: "Tekninen",
      authorType: "technical",
      coverage: "Tiedosto",
      text: "vanha",
    }),
  ).toThrow("Mainos muuttui");
  expect(readNotebook(root).notebook.observations).toEqual(saved.notebook.observations);
});
it("refuses stale clients without losing either client's successful changes", () => {
  const { root } = setup();
  const first = readNotebook(root),
    second = readNotebook(root);
  saveNotebook(root, { expectedToken: first.token, action: "brief", goal: "A", texts: "A" });
  const bytes = readFileSync(join(root, notebookPath));
  expect(() =>
    saveNotebook(root, { expectedToken: second.token, action: "task", text: "B" }),
  ).toThrow("Muistikirja muuttui");
  expect(readFileSync(join(root, notebookPath))).toEqual(bytes);
  const refreshed = readNotebook(root);
  saveNotebook(root, { expectedToken: refreshed.token, action: "task", text: "B" });
  expect(readNotebook(root).notebook).toMatchObject({ goal: "A", tasks: [{ text: "B" }] });
});
it("restores exact previous bytes on failed publication completion", () => {
  const { root, save } = setup();
  save({ action: "brief", goal: "Alku", texts: "" });
  const bytes = readFileSync(join(root, notebookPath));
  expect(() =>
    save({ action: "brief", goal: "Uusi", texts: "" }, () => {
      throw new Error("levyvirhe");
    }),
  ).toThrow("levyvirhe");
  expect(readFileSync(join(root, notebookPath))).toEqual(bytes);
});
it("preserves a concurrent modification when compensation conflicts", () => {
  const { root, save } = setup();
  save({ action: "brief", goal: "Alku", texts: "" });
  const external = readFileSync(join(root, notebookPath)).toString().replace("Alku", "Ulkoinen");
  expect(() =>
    save({ action: "brief", goal: "Uusi", texts: "" }, () => {
      writeFileSync(join(root, notebookPath), external);
      throw new Error("vika");
    }),
  ).toThrow("palautus jäi kesken");
  expect(readFileSync(join(root, notebookPath), "utf8")).toBe(external);
});
it("refuses corrupted data and symlinked notebook directories without replacing them", () => {
  const { root, save } = setup();
  mkdirSync(join(root, ".ari-notebook"));
  writeFileSync(join(root, notebookPath), "{broken");
  expect(() => save({ action: "brief", goal: "x", texts: "" })).toThrow("vioittunut");
  expect(readFileSync(join(root, notebookPath), "utf8")).toBe("{broken");
  const other = setup();
  symlinkSync(join(root, ".ari-notebook"), join(other.root, ".ari-notebook"));
  expect(() => readNotebook(other.root)).toThrow("Linkitettyyn");
});
it("refuses asset traversal, symlinks and mismatched hashes", () => {
  const { root, save } = setup();
  symlinkSync(join(root, "index.html"), join(root, "assets/link.png"));
  for (const path of ["assets/../index.html", "assets/link.png", "assets/test.png"]) {
    expect(() => save({ action: "assets", assets: [{ path, checksum: "wrong" }] })).toThrow();
  }
  unlinkSync(join(root, "assets/link.png"));
  expect(readNotebook(root).token).toBeNull();
});
it("does not allow source operation receipts or observation authors to be fabricated as an action", () => {
  const { save } = setup();
  expect(() => save({ action: "operation", id: "fake" })).toThrow("ei tueta");
  expect(() => save({ action: "observation", authorType: "model" })).toThrow();
});
it("compensates a failed first save back to absence and never treats an empty file as absent", () => {
  const { root, save } = setup();
  expect(() =>
    save({ action: "task", text: "Ei valmistunut" }, () => {
      throw new Error("publication failed");
    }),
  ).toThrow("publication failed");
  expect(readNotebook(root).token).toBeNull();
  mkdirSync(join(root, ".ari-notebook"), { recursive: true });
  writeFileSync(join(root, notebookPath), "");
  expect(() => save({ action: "brief", goal: "Ei", texts: "" })).toThrow("vioittunut");
  expect(readFileSync(join(root, notebookPath))).toEqual(Buffer.alloc(0));
});
it("keeps declared technical, human and external-agent observations distinct without granting approval", () => {
  const { root, save } = setup();
  const revision = readNotebook(root).revision;
  for (const authorType of ["technical", "human", "external_agent"]) {
    save({
      action: "observation",
      revision,
      authorType,
      author: "Nimetty tarkistaja",
      coverage: "Yksi ruutu",
      text: "Kirjattu havainto",
    });
  }
  const observations = readNotebook(root).notebook.observations;
  expect(observations.map((item) => item.authorType)).toEqual([
    "technical",
    "human",
    "external_agent",
  ]);
  expect(
    observations.every(
      (item) => item.author === "Nimetty tarkistaja" && item.revision === revision,
    ),
  ).toBe(true);
  expect(observations.some((item) => "approved" in item || "accepted" in item)).toBe(false);
});
