/** Shared visible-notebook plumbing for the D1/D5 acceptance journeys. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptanceRun,
  acceptanceCases,
  assertRoundLimitRefusal,
  textButton,
  tool,
  typeIntoInput,
} from "./ari-acceptance-browser.mjs";

export const button = textButton;
const field = (p, label) => p.locator(`::-p-aria(${label}[role="textbox"])`);
export const select = (p, label, value) => p.select(`::-p-aria(${label}[role="combobox"])`, value);
export const controls = { button, field, select };
export const readNotebook = (p) => tool(p, "studio_notebook");
export const projectState = (p, id) =>
  p.evaluate(async (id) => (await fetch(`/api/ari/projects/${id}/versions/index`)).json(), id);

/** A visible dialog reports in `role=alert`; a tool resolves with `reason`. */
export const refusal = (result) => result.error ?? result.reason ?? "";
const projectSource = (p, id) =>
  p.evaluate(
    async (id) =>
      (await fetch(`/api/ari/projects/${id}/versions/file?path=index.html`).then((r) => r.json()))
        .content,
    id,
  );
/**
 * Proves a refusal wrote nothing. The version index bytes carry the undo
 * history as well, so one deepEqual covers the sources, the source revision,
 * the version index and the history at once.
 */
export async function unchangedAround(p, entry, act) {
  const snapshot = async () => ({
    ...(await projectState(p, entry.projectId)),
    source: await projectSource(p, entry.projectId),
  });
  const before = await snapshot();
  const result = await act();
  const after = await snapshot();
  assert.deepEqual(after, before);
  entry.unchanged = { revision: after.revision, indexToken: after.indexToken };
  return result;
}

/** One case's page closes exactly once, and only after the case is marked done. */
export async function finishCase(p, entry) {
  await p.close();
  entry.ok = true;
}
/** Reopen one recorded case against whichever server is running now. */
export async function reopenedNotebook(run, entry) {
  const p = await run.pageFor(entry.projectId, entry.width, entry.height);
  return { p, current: await readNotebook(p) };
}

export async function fill(p, label, value) {
  await p.bringToFront();
  const element = await p.$(`::-p-aria(${label}[role="textbox"])`);
  assert(element, label);
  await typeIntoInput(p, element, value);
}
export async function openNotebook(p) {
  await button(p, "Muistikirja").click();
  await button(p, "Avaa muistikirja").click();
  await p.waitForFunction(() =>
    document.querySelector("dialog [role=status]")?.textContent.includes("avattu"),
  );
}
export async function notebookSaved(p) {
  await p.waitForFunction(
    () =>
      document
        .querySelector("dialog [role=status]")
        ?.textContent.includes("Muistikirja tallennettu") &&
      !document.querySelector("dialog button")?.disabled,
  );
}
/** One acceptance run configured for the notebook surface. */
export function notebookRun(evidencePath, options = {}) {
  return acceptanceRun(evidencePath, {
    hash: "?v=1&t=1&tab=design&rc=0",
    tool: "studio_notebook",
    isolatedSessions: true,
    ...options,
  });
}
/** Build every case, or replay a prior report's cases against a fresh server. */
export function notebookJourney(run, reopen, { createCase, reopenCase, finish = () => {} }) {
  return run.run(async (bootstrap) => {
    if (reopen) {
      for (const entry of JSON.parse(readFileSync(reopen, "utf8")).modes) await reopenCase(entry);
    } else {
      for (const entry of acceptanceCases()) {
        run.report.modes.push(entry);
        await createCase(bootstrap, entry);
      }
    }
    finish();
  });
}

/** Pick a `<select>` option by the text a human reads, not by its value. */
export async function selectByText(p, label, text) {
  const value = await p.$$eval(
    `::-p-aria(${label}[role="combobox"]) option`,
    (options, text) => options.find((option) => option.textContent.trim() === text)?.value,
    text,
  );
  assert(value, `${label}: ${text}`);
  await select(p, label, value);
  return value;
}

/** One notebook decision through the bounded command, receipt kept as evidence. */
export async function updateNotebook(p, entry, input) {
  const receipt = await tool(p, "studio_update_notebook", {
    expectedToken: (await readNotebook(p)).token,
    ...input,
  });
  assert(receipt.ok, JSON.stringify(receipt));
  entry.receipts.push(receipt);
  return receipt;
}

/**
 * The visible half of the stop control. "Jatka työtä" is also the operation
 * resume, so the resume is selected by its own accessible name.
 */
export async function stopWorkVisibly(p, stop, input) {
  await openNotebook(p);
  await fill(p, stop ? "Pysäytyksen kirjaaja" : "Jatkamisen kirjaaja", input.by);
  await select(p, "Kirjaajan rooli", input.byType);
  await fill(p, "Syy", input.reason);
  await p.locator(`::-p-aria(${stop ? "Pysäytä työ" : "Jatka pysäytettyä työtä"})`).click();
  await notebookSaved(p);
  const shown = await p.$eval('[data-testid="ari-stop-state"]', (node) => node.textContent);
  assert.match(shown, stop ? /Työ on pysäytetty/ : /Työ on käynnissä/);
}

/** The visible half of the local approval, bound to one review package. */
export async function approveVisibly(p, manifest, decision) {
  await openNotebook(p);
  await select(p, "Arvioitu tarkistuspaketti", manifest.id);
  await fill(p, "Päättäjä", decision.approver);
  await select(p, "Päättäjän rooli", decision.approverType);
  await fill(p, "Perustelu", decision.note);
  await button(p, "Hyväksy versio paikallisesti").click();
  await notebookSaved(p);
  const shown = await p.$eval('[data-testid="ari-approval-list"]', (node) => node.textContent);
  assert.match(shown, /Hyväksytty paikallisesti/);
}

/** The four visible notebook decisions a repair-round limit needs. */
export async function prepareRepairVisibly(p, plan) {
  await openNotebook(p);
  await fill(p, "Uusi tehtävä", plan.task);
  await button(p, "Lisää tehtävä").click();
  await notebookSaved(p);
  const taskId = await selectByText(p, "Tehtävän puutteet ja ehdotus", plan.task);
  await fill(p, "Jäljellä oleva puute", plan.gap);
  await fill(p, "Seuraava ehdotus", plan.suggestion);
  await button(p, "Tallenna puute ja ehdotus").click();
  await notebookSaved(p);
  await fill(p, "Lukittavan tekstin nimi", plan.lockLabel);
  await fill(p, "Lukittava teksti", plan.lockText);
  await button(p, "Lukitse hyväksytty teksti").click();
  await notebookSaved(p);
  await select(p, "Korjauskierroksia käyttävä tehtävä", taskId);
  await notebookSaved(p);
  return taskId;
}

/** The same four decisions through the bounded command. */
export async function prepareRepairWithCommand(p, entry, plan) {
  const created = await updateNotebook(p, entry, { action: "task", text: plan.task });
  const taskId = created.notebook.tasks.at(-1).id;
  await updateNotebook(p, entry, {
    action: "repair_plan",
    id: taskId,
    remaining: plan.gap,
    suggestion: plan.suggestion,
  });
  await updateNotebook(p, entry, {
    action: "lock",
    label: plan.lockLabel,
    text: plan.lockText,
  });
  await updateNotebook(p, entry, { action: "active_repair", id: taskId });
  return taskId;
}

/** One write past the budget: refused, and it left no byte behind. */
export async function proveRoundLimitReached(p, entry, write, gap, suggestion) {
  const third = await unchangedAround(p, entry, write);
  assert.equal(third.ok, false, JSON.stringify(third));
  assertRoundLimitRefusal(refusal(third), gap, suggestion);
  entry.limitRefusal = refusal(third);
  return third;
}

/** Replay one recorded case and check the stop history it should still carry. */
export async function reopenedWithStopHistory(run, entry, expected) {
  const { p, current } = await reopenedNotebook(run, entry);
  assert.deepEqual(
    current.repair.stopHistory.map((row) => `${row.action}:${row.by}`),
    expected,
  );
  return { p, current };
}
