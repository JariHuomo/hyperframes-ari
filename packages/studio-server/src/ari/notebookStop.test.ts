import { expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readNotebook } from "./notebook";
import { prepareSourceOperation, writeSourceOperation } from "./operationJournal";
import { projectVersionFiles, sourceRevision } from "./versionFiles";
import { notebookTestProject } from "./notebookTestProject";
import { readRefusals } from "./repairGate";

const source = '<p id="hook">Pieni tauko.</p>';
const after = '<p id="hook">Pieni tauko.</p><i>uusi</i>';
function setup() {
  const { root, save, intent } = notebookTestProject(source);
  const stop = (extra: object = {}) =>
    save({
      action: "stop_work",
      by: "Testiajo",
      byType: "test_data",
      reason: "Odotetaan asiakkaan hintaa",
      ...extra,
    });
  return { root, save, intent, stop };
}
const bytes = (root: string) => readFileSync(join(root, "index.html"), "utf8");

it("refuses the next tracked source write while the work is stopped, and writes nothing", () => {
  const { root, intent, stop } = setup();
  const before = readNotebook(root);
  stop();
  const stopped = readNotebook(root);
  expect(stopped.notebook.stop).toMatchObject({ by: "Testiajo", action: "stop" });
  expect(stopped.repair.stop?.reason).toBe("Odotetaan asiakkaan hintaa");
  // The stop is a notebook fact: it moved no source, version or history.
  expect(stopped.revision).toBe(before.revision);
  expect(() => prepareSourceOperation(root, intent("a", after))).toThrow(
    /Työ on pysäytetty[\s\S]*Odotetaan asiakkaan hintaa[\s\S]*Jatka työtä/,
  );
  expect(existsSync(join(root, ".ari-notebook/operations/a.json"))).toBe(false);
  expect(bytes(root)).toBe(source);
  const refusal = readRefusals(root).at(-1);
  expect(refusal?.reason).toBe("work_stopped");
  expect(refusal?.operationId).toBe("a");
});

it("finishes an operation whose intent was already published, so no save ends half-way", () => {
  const { root, stop, intent } = setup();
  // Past the choke point: the intent is durable and its bytes are the only
  // source the bounded write may use.
  const prepared = prepareSourceOperation(root, intent("live", after));
  expect(prepared.operationId).toBe("live");
  stop();
  writeSourceOperation(root, "live", "index.html");
  // Byte-exactly the after state — never a partial file.
  expect(bytes(root)).toBe(after);
  // The NEXT write is the one that is refused.
  expect(() =>
    prepareSourceOperation(root, {
      ...intent("next", `${after}<b>x</b>`),
      baseRevision: sourceRevision(projectVersionFiles(root)),
      files: { "index.html": { before: after, after: `${after}<b>x</b>` } },
    }),
  ).toThrow(/Työ on pysäytetty/);
});

it("keeps the stop across a fresh read and releases the write path on resume", () => {
  const { root, save, intent, stop } = setup();
  stop();
  // Nothing is cached: the state comes back off the notebook file itself.
  expect(readNotebook(root).notebook.stop?.by).toBe("Testiajo");
  save({ action: "resume_work", by: "Testiajo", byType: "test_data", reason: "Hinta saatu" });
  const resumed = readNotebook(root);
  expect(resumed.notebook.stop).toBe(null);
  expect(resumed.repair.stopHistory.map((entry) => entry.action)).toEqual(["stop", "resume"]);
  expect(prepareSourceOperation(root, intent("b", after)).operationId).toBe("b");
});

it("refuses a second stop, a resume while running, and an unattributed stop", () => {
  const { root, save, stop } = setup();
  // A machine does not decide to stop the work, so there is no technical actor.
  expect(() => stop({ byType: "technical" })).toThrow(/valinta ei kelpaa/);
  stop();
  expect(() => stop()).toThrow(/jo pysäytetty/);
  save({ action: "resume_work", by: "Testiajo", byType: "test_data", reason: "Jatketaan" });
  expect(() =>
    save({ action: "resume_work", by: "Testiajo", byType: "test_data", reason: "Uudestaan" }),
  ).toThrow(/ei ole pysäytetty/);
  expect(() => save({ action: "stop_work", by: "", byType: "human", reason: "x" })).toThrow(
    /pakolliset tiedot/,
  );
  expect(readNotebook(root).notebook.stop).toBe(null);
});

it("lets the notebook, observations and assessments carry on while stopped", () => {
  const { root, save, stop } = setup();
  stop();
  const revision = readNotebook(root).revision;
  save({ action: "brief", goal: "Pysäytetty työ", texts: "Pieni tauko." });
  save({
    action: "observation",
    author: "Testiajo",
    authorType: "human",
    coverage: "Koko video",
    text: "Hinta puuttuu.",
    revision,
  });
  const current = readNotebook(root);
  expect(current.notebook.goal).toBe("Pysäytetty työ");
  expect(current.notebook.observations).toHaveLength(1);
  // Writing them down changed no source revision, so the stop still holds.
  expect(current.revision).toBe(revision);
  expect(current.notebook.stop?.action).toBe("stop");
});
