import { expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { versionTestProject } from "./versionTestProject";
import { readNotebook, saveNotebook } from "./notebook";
import { normalizeText, occurrences, REPAIR_LIMIT_DEFAULT } from "./notebookRepair";

function setup() {
  const root = versionTestProject({ "index.html": "<p>Alku</p>" });
  const save = (input: object) =>
    saveNotebook(root, { expectedToken: readNotebook(root).token, ...input });
  return { root, save };
}
it("reads a notebook written before D5 with the product default and no locks", () => {
  const root = versionTestProject({ "index.html": "<p>Alku</p>" });
  mkdirSync(join(root, ".ari-notebook"), { recursive: true });
  writeFileSync(
    join(root, ".ari-notebook/notebook.json"),
    JSON.stringify({
      schema: 1,
      goal: "Vanha",
      texts: "",
      assets: [],
      tasks: [{ id: "t1", text: "Vanha tehtävä", status: "next" }],
      observations: [],
      operations: [],
    }),
  );
  const current = readNotebook(root);
  expect(current.notebook.repairLimit).toBe(REPAIR_LIMIT_DEFAULT);
  expect(current.notebook.locks).toEqual([]);
  expect(current.notebook.tasks[0]).toMatchObject({ remaining: "", suggestion: "" });
  expect(current.repair).toMatchObject({ limit: 2, activeTaskId: "", refusals: [] });
});
it("keeps locks, the limit and the active task across a reopen and refuses an unknown action", () => {
  const { root, save } = setup();
  const task = save({ action: "task", text: "Korjaa" }).notebook.tasks[0]!;
  save({ action: "repair_limit", limit: 1 });
  save({ action: "active_repair", id: task.id });
  save({ action: "lock", label: "Hinta", text: "9,90 €" });
  const reopened = readNotebook(root);
  expect(reopened.notebook.repairLimit).toBe(1);
  expect(reopened.notebook.activeRepairTaskId).toBe(task.id);
  expect(reopened.notebook.locks[0]).toMatchObject({ label: "Hinta", text: "9,90 €", tasks: [] });
  expect(() => save({ action: "tuntematon" })).toThrow(/toimintoa ei tueta/);
});
it("bounds the limit, requires a real task and refuses an empty lock", () => {
  const { save } = setup();
  expect(() => save({ action: "repair_limit", limit: 21 })).toThrow(/0–20/);
  expect(() => save({ action: "repair_limit", limit: 1.5 })).toThrow(/0–20/);
  expect(() => save({ action: "active_repair", id: "puuttuu" })).toThrow(/Tehtävää ei löydy/);
  expect(() => save({ action: "lock", label: "Tyhjä", text: " " })).toThrow(/pakolliset|lyhyt/);
  expect(() => save({ action: "unlock", id: "puuttuu" })).toThrow(/Lukitusta ei löydy/);
});
it("normalises whitespace mechanically and counts every occurrence", () => {
  expect(normalizeText("  Pieni\n\ttauko.  ")).toBe("Pieni tauko.");
  expect(occurrences("a b a b a", "a b")).toBe(2);
  expect(occurrences("mitään", "")).toBe(0);
});
