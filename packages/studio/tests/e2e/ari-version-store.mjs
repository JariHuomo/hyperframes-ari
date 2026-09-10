/** Run create/reopen on separate foreground servers; each run opens a fresh browser. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { acceptanceRun } from "./ari-acceptance-browser.mjs";
const origin = "http://127.0.0.1:3084";
const base = resolve(
  process.env.ARI_VERSION_EVIDENCE ?? "screenshots/2026-09-10-b-version-store/browser",
);
const phase = process.argv[2] ?? "create";
const previous =
  phase === "create" ? {} : JSON.parse(readFileSync(join(base, "create/report.json")));
const run = await acceptanceRun(join(base, phase), {
  hash: "?v=1&t=1&tab=design&rc=0",
  tool: "studio_elements",
});
const { report } = run;
report.checks = [];
await run.run(async (bootstrap) => {
  const id = phase === "create" ? bootstrap : previous.project.id;
  const p = await run.pageFor(id, 1280, 800);
  report.project =
    phase === "create"
      ? { id, dir: join(run.root, "packages/studio/data/projects", id) }
      : previous.project;
  await p.screenshot({ path: join(run.evidence, `${phase}-opened.png`) });
  const outcome = await p.evaluate(browserJourney, {
    phase,
    projectId: report.project.id,
    previous: previous.created,
    modules: {
      versions: new URL("/src/utils/projectVersions.ts", origin).href,
      history: new URL("/src/hooks/usePersistentEditHistory.ts", origin).href,
      files: new URL("/src/utils/nullableProjectFiles.ts", origin).href,
    },
  });
  recordPhase(outcome);
  const directory = join(report.project.dir, ".ari-versions");
  const objects = readdirSync(join(directory, "objects"));
  report.storage = {
    objects: objects.length,
    objectBytes: objects.reduce(
      (sum, name) => sum + statSync(join(directory, "objects", name)).size,
      0,
    ),
    indexBytes: statSync(join(directory, "index.json")).size,
  };
});

async function browserJourney({ phase, projectId, previous, modules }) {
  const {
    projectVersions,
    restoreProjectVersion,
    createProjectEditHistoryStorage,
    versionHistoryFiles,
  } = await import(modules.versions);
  const { createPersistentEditHistoryController } = await import(modules.history);
  const { nullableProjectFiles } = await import(modules.files);
  const versions = projectVersions(projectId);
  const call = (name, input) => window.ariStudio.call(name, input);
  if (phase === "create") {
    const checkpoint = await versions.save("Ennen muutosta");
    const list = await call("studio_elements", { sourceFile: "index.html" });
    const receipt = await call("studio_edit_element", {
      sourceFile: "index.html",
      version: list.version,
      action: "add",
      kind: "text",
      name: "Säilyvä teksti",
      text: "Tämä muutos säilyy",
    });
    if (!receipt.ok) throw new Error(JSON.stringify(receipt));
    const saved = await versions.list();
    return { checkpoint, receipt, saved, frozen: await versions.read(checkpoint.version.id) };
  }
  const saved = await versions.list();
  const frozen = await versions.read(previous.checkpoint.version.id);
  const io = nullableProjectFiles(projectId),
    binary = versionHistoryFiles(projectId);
  const controller = await createPersistentEditHistoryController({
    projectId,
    storage: createProjectEditHistoryStorage(),
    onChange: () => {},
  });
  const beforeRestore = await io.readFile("index.html");
  const prepared = await versions.prepareRestore(previous.checkpoint.version.id);
  await restoreProjectVersion(projectId, prepared, controller.recordEdit, io.writeFile);
  const restored = await io.readFile("index.html");
  const callbacks = {
    readFile: (path, encoding) => (encoding ? binary.readFile(path) : io.readFile(path)),
    writeFile: (path, content, expected, encoding) =>
      encoding ? binary.writeFile(path, content, expected) : io.writeFile(path, content, expected),
  };
  const undo = await controller.undo(callbacks),
    undone = await io.readFile("index.html");
  const redo = await controller.redo(callbacks),
    redone = await io.readFile("index.html");
  return {
    saved,
    frozen,
    beforeRestore,
    restored,
    undone,
    redone,
    undo,
    redo,
    state: controller.snapshot().state,
  };
}
function recordPhase(outcome) {
  if (phase === "create") {
    assert.equal(outcome.saved.history.undo.length, 1);
    assert(outcome.saved.history.undo[0].afterVersionId);
    report.created = outcome;
    report.checks.push(
      "App edit publishes disk-backed before/after versions",
      "Named version freezes all local dependencies",
    );
  } else {
    assert.deepEqual(outcome.frozen, previous.created.frozen);
    assert.deepEqual(outcome.saved.history, previous.created.saved.history);
    assert(outcome.undo.ok && outcome.redo.ok);
    assert.equal(outcome.beforeRestore, outcome.undone);
    assert.equal(outcome.restored, outcome.redone);
    assert.notEqual(outcome.beforeRestore, outcome.restored);
    report.reopened = outcome;
    report.checks.push(
      "New server and browser recover exact history and frozen assets",
      "Restore is one distinct history edit",
      "Undo and redo recover exact source bytes",
    );
    report.ok = true;
  }
}
