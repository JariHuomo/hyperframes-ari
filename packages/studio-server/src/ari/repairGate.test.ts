import { expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readNotebook } from "./notebook";
import { prepareSourceOperation } from "./operationJournal";
import { notebookTestProject } from "./notebookTestProject";
import { readRefusals, repairRounds } from "./repairGate";

const source = '<p id="hook">Pieni tauko.</p><p id="extra">Muuta</p>';
function setup() {
  const project = notebookTestProject(source);
  const task = project.save({ action: "task", text: "Korjaa otsikko" }).notebook.tasks[0]!;
  return { ...project, task };
}
const bytes = (root: string) => readFileSync(join(root, "index.html"), "utf8");

it("allows the product default of two repair rounds per task and refuses the third before writing", () => {
  const { root, save, intent, task } = setup();
  save({ action: "active_repair", id: task.id });
  save({
    action: "repair_plan",
    id: task.id,
    remaining: "Hinta puuttuu",
    suggestion: "Kysy asiakkaalta",
  });
  expect(prepareSourceOperation(root, intent("r1", `${source}<i>1</i>`)).repairTaskId).toBe(
    task.id,
  );
  expect(prepareSourceOperation(root, intent("r2", `${source}<i>2</i>`)).repairTaskId).toBe(
    task.id,
  );
  expect(repairRounds(root)[task.id]).toBe(2);
  expect(() => prepareSourceOperation(root, intent("r3", `${source}<i>3</i>`))).toThrow(
    /raja täyttyi[\s\S]*2\/2[\s\S]*Hinta puuttuu[\s\S]*Kysy asiakkaalta/,
  );
  // A refused round leaves no intent, no source change and no consumed round.
  expect(existsSync(join(root, ".ari-notebook/operations/r3.json"))).toBe(false);
  expect(bytes(root)).toBe(source);
  expect(repairRounds(root)[task.id]).toBe(2);
  const refusal = readRefusals(root).at(-1);
  expect(refusal?.reason).toBe("repair_limit");
  expect(refusal?.operationId).toBe("r3");
});
it("reads the used rounds back from disk, so a new server process meets the same limit", () => {
  const { root, save, intent, task } = setup();
  save({ action: "repair_limit", limit: 1 });
  save({ action: "active_repair", id: task.id });
  prepareSourceOperation(root, intent("r1", `${source}<i>1</i>`));
  // Nothing is cached in this module: the count is one file per consumed round.
  expect(readNotebook(root).repair.tasks[0]).toMatchObject({ used: 1, exhausted: true });
  expect(() => prepareSourceOperation(root, intent("r2", `${source}<i>2</i>`))).toThrow(
    /raja täyttyi/,
  );
});
it("counts no repair round while no task claims them, and still protects locked text", () => {
  const { root, save, intent } = setup();
  save({ action: "lock", label: "Pääviesti", text: "Pieni  tauko." });
  expect(prepareSourceOperation(root, intent("keep", `${source}<i>1</i>`)).repairTaskId).toBe(null);
  expect(repairRounds(root)).toEqual({});
  expect(() =>
    prepareSourceOperation(
      root,
      intent("drop", '<p id="hook">Iso tauko.</p><p id="extra">Muuta</p>'),
    ),
  ).toThrow(/Hyväksyttyä tekstiä ei muuteta[\s\S]*Pääviesti/);
  expect(bytes(root)).toBe(source);
  expect(readRefusals(root).at(-1)?.reason).toBe("locked_text");
});
it("lets an explicit mandate over that exact lock through and keeps every other lock closed", () => {
  const { root, save, intent, task } = setup();
  const locked = save({ action: "lock", label: "Pääviesti", text: "Pieni tauko." }).notebook
    .locks[0]!;
  save({ action: "lock", label: "Tarjous", text: "Muuta" });
  save({ action: "active_repair", id: task.id });
  save({ action: "authority", id: locked.id, taskId: task.id, granted: true });
  const changed = '<p id="hook">Iso tauko.</p><p id="extra">Muuta</p>';
  expect(prepareSourceOperation(root, intent("ok", changed)).repairTaskId).toBe(task.id);
  // The second lock has no mandate, so dropping its text is still refused.
  expect(() => prepareSourceOperation(root, intent("no", '<p id="hook">Pieni tauko.</p>'))).toThrow(
    /Tarjous/,
  );
});
it("refuses a locked change from a task whose mandate was revoked", () => {
  const { root, save, intent, task } = setup();
  const locked = save({ action: "lock", label: "Pääviesti", text: "Pieni tauko." }).notebook
    .locks[0]!;
  save({ action: "active_repair", id: task.id });
  save({ action: "authority", id: locked.id, taskId: task.id, granted: true });
  save({ action: "authority", id: locked.id, taskId: task.id, granted: false });
  expect(() =>
    prepareSourceOperation(
      root,
      intent("no", '<p id="hook">Iso tauko.</p><p id="extra">Muuta</p>'),
    ),
  ).toThrow(/Pääviesti/);
  expect(repairRounds(root)).toEqual({});
});
