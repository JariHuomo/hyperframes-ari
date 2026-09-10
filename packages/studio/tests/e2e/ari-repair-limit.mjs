/** D5 · visible repair-round limit and approved-content protection. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  elementDialogResult,
  settled,
  startAcceptanceCase,
  tool,
} from "./ari-acceptance-browser.mjs";
import {
  button,
  controls,
  fill,
  prepareRepairVisibly,
  proveRoundLimitReached,
  prepareRepairWithCommand,
  selectByText,
  notebookJourney,
  notebookRun,
  finishCase,
  openNotebook,
  readNotebook as read,
  refusal,
  reopenedNotebook,
  unchangedAround,
} from "./ari-notebook-helpers.mjs";

const evidence =
  process.env.ARI_REPAIR_EVIDENCE ?? "screenshots/2026-09-10-d5-repair-limit/browser";
const reopen = process.env.ARI_REPAIR_REOPEN;
const LOCKED = "Pieni tauko.";
const GAP = "Hinta puuttuu ruudusta";
const NEXT = "Kysy hinta asiakkaalta";
const PLAN = {
  task: "Korjaa otsikko",
  gap: GAP,
  suggestion: NEXT,
  lockLabel: "Pääviesti",
  lockText: LOCKED,
};
const run = await notebookRun(evidence, {
  // Every refusal under test is a 409 from the confined notebook/versions routes.
  expectedHttpError: (error) =>
    error.status === 409 && /\/(notebook|versions\/operations)$/.test(new URL(error.url).pathname),
});
/** The same four notebook decisions, once through visible controls and once through the tool. */
async function prepareNotebook(p, entry) {
  if (entry.mode === "mixed") return prepareRepairWithCommand(p, entry, PLAN);
  const taskId = await prepareRepairVisibly(p, PLAN);
  await button(p, "Sulje").click();
  return taskId;
}
async function openElements(p) {
  await button(p, "Elementit").click();
  await settled(p);
}
async function addElement(p, entry, name, text) {
  if (entry.mode === "mixed") {
    const elements = await tool(p, "studio_elements", { sourceFile: "index.html" });
    return tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: elements.version,
      action: "add",
      kind: "text",
      name,
      text,
    });
  }
  await openElements(p);
  await fill(p, "Nimi", name);
  await fill(p, "Teksti", text);
  await button(p, "Lisää elementti").click();
  const result = await elementDialogResult(p);
  await button(p, "Sulje").click();
  return result;
}
async function removeLockedElement(p, entry) {
  if (entry.mode === "mixed") {
    const elements = await tool(p, "studio_elements", { sourceFile: "index.html" });
    const row = elements.elements.find((element) => element.name === "Pääviesti");
    assert(row, "Pääviesti");
    return tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: elements.version,
      action: "delete",
      target: row.target,
    });
  }
  await openElements(p);
  await selectByText(p, "Valittu elementti", "Pääviesti");
  await button(p, "Poista").click();
  const error = await p.waitForFunction(
    () => document.querySelector("dialog [role=alert]")?.textContent || false,
  );
  const message = await error.jsonValue();
  await button(p, "Sulje").click();
  return { ok: false, error: message };
}
async function createCase(bootstrap, entry) {
  const { p, name } = await startAcceptanceCase(run, bootstrap, entry, "repair", controls);
  entry.projectId = name;
  // The approved message exists before any lock, so no repair round is spent on it.
  assert((await addElement(p, entry, "Pääviesti", LOCKED)).ok);
  entry.taskId = await prepareNotebook(p, entry);

  const locked = await unchangedAround(p, entry, () => removeLockedElement(p, entry));
  assert.equal(locked.ok, false, JSON.stringify(locked));
  assert.match(refusal(locked), /Hyväksyttyä tekstiä ei muuteta/);
  assert.match(refusal(locked), /Pääviesti/);
  entry.lockedRefusal = refusal(locked);
  entry.checks.push(
    "approved-text change is refused on the shared write path with a Finnish reason",
  );

  for (const round of [1, 2]) {
    const receipt = await addElement(p, entry, `Korjaus ${round}`, `Kierros ${round}`);
    assert(receipt.ok, JSON.stringify(receipt));
  }
  const usedRounds = (await read(p)).repair.tasks.find((task) => task.id === entry.taskId);
  assert.deepEqual(
    { used: usedRounds.used, exhausted: usedRounds.exhausted },
    {
      used: 2,
      exhausted: true,
    },
  );
  entry.checks.push("two repair rounds are consumed by real tracked source writes");

  await proveRoundLimitReached(
    p,
    entry,
    () => addElement(p, entry, "Korjaus 3", "Kierros 3"),
    GAP,
    NEXT,
  );
  entry.checks.push(
    "the third round is refused and names the remaining gap and the next suggestion",
  );

  entry.checks.push("both refusals leave the source revision, version index and history unchanged");

  await openNotebook(p);
  await p.$eval('[aria-label="Torjutut muutokset"]', (e) => e.scrollIntoView({ block: "center" }));
  const receipts = await p.$eval('[aria-label="Torjutut muutokset"]', (e) => e.textContent);
  assert.match(receipts, /Korjauskierrosten raja täyttyi/);
  assert.match(receipts, /Hyväksyttyä tekstiä ei muuteta/);
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-repair.png`) });
  entry.notebook = await read(p);
  entry.checks.push("the notebook shows both refusal receipts and the used rounds after the fact");
  await button(p, "Sulje").click();
  await finishCase(p, entry);
}
async function reopenCase(entry) {
  const { p, current } = await reopenedNotebook(run, entry);
  assert.equal(current.notebook.locks[0].text, LOCKED);
  assert.equal(current.notebook.activeRepairTaskId, entry.taskId);
  const task = current.repair.tasks.find((row) => row.id === entry.taskId);
  assert.deepEqual({ used: task.used, exhausted: task.exhausted }, { used: 2, exhausted: true });
  const refused = await addElement(p, entry, "Korjaus 4", "Kierros 4");
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.match(refusal(refused), /Korjauskierrosten raja täyttyi/);
  await openNotebook(p);
  await p.$eval('[aria-label="Käytetyt korjauskierrokset"]', (e) =>
    e.scrollIntoView({ block: "center" }),
  );
  const rounds = await p.$eval('[aria-label="Käytetyt korjauskierrokset"]', (e) => e.textContent);
  assert.match(rounds, /2\/2 kierrosta — raja täynnä/);
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-reopened.png`) });
  run.report.modes.push({
    ...entry,
    checks: [
      "a new server process and browser session keep the locks, the active task and the used rounds, and refuse again",
    ],
    ok: true,
  });
  await p.close();
}
await notebookJourney(run, reopen, {
  createCase,
  reopenCase,
  finish: () =>
    writeFileSync(join(run.evidence, "cases.json"), JSON.stringify(run.report.modes, null, 2)),
});
// Two provoked refusals per case while building, one per case on reopen.
if (run.report.ok) assert.equal(run.report.deliberateRefusals.length, reopen ? 4 : 8);
