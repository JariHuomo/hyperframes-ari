import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  settled,
  importSyntheticImage,
  startAcceptanceCase,
  tool,
} from "./ari-acceptance-browser.mjs";
import {
  button,
  controls,
  fill,
  notebookJourney,
  notebookRun,
  notebookSaved as saved,
  openNotebook as open,
  projectState as state,
  readNotebook as read,
  select,
} from "./ari-notebook-helpers.mjs";
const evidence = process.env.ARI_NOTEBOOK_EVIDENCE ?? "screenshots/2026-09-10-d-notebook/browser";
const reopen = process.env.ARI_NOTEBOOK_REOPEN;
const run = await notebookRun(evidence);
async function update(p, input, result) {
  const current = await read(p);
  const receipt = await tool(p, "studio_update_notebook", {
    expectedToken: current.token,
    ...input,
  });
  assert(receipt.ok, JSON.stringify(receipt));
  result.receipts.push(receipt);
  return receipt;
}
async function populate(p, entry, shelf) {
  if (entry.mode === "mixed") {
    await update(
      p,
      { action: "brief", goal: "Näytä synteettinen tuote", texts: "Pieni tauko." },
      entry,
    );
    await update(
      p,
      { action: "assets", assets: shelf.assets.map(({ path, checksum }) => ({ path, checksum })) },
      entry,
    );
    const task = await update(p, { action: "task", text: "Tarkista kuva" }, entry);
    await update(
      p,
      { action: "task_status", id: task.notebook.tasks[0].id, status: "done" },
      entry,
    );
    await update(
      p,
      {
        action: "observation",
        author: "Ulkoinen testaaja",
        authorType: "external_agent",
        revision: task.revision,
        coverage: "Ensimmäinen ruutu",
        text: "Tekninen harjoitus, ei laatuhyväksyntää.",
      },
      entry,
    );
  } else {
    await open(p);
    await fill(p, "Tavoite", "Näytä synteettinen tuote");
    await fill(p, "Sovitut tekstit", "Pieni tauko.");
    await button(p, "Tallenna tavoite ja tekstit").click();
    await saved(p);
    await p.locator("dialog input[type=checkbox]").click();
    await button(p, "Tallenna aineistovalinta").click();
    await saved(p);
    await fill(p, "Uusi tehtävä", "Tarkista kuva");
    await button(p, "Lisää tehtävä").click();
    await saved(p);
    await select(p, "Tehtävän tila: Tarkista kuva", "done");
    await saved(p);
    await fill(p, "Havainnon tekijä", "Ihmisen kirjaama harjoitus");
    await fill(p, "Katsottu kattavuus", "Ensimmäinen ruutu");
    await fill(p, "Havainto", "Tekninen harjoitus, ei laatuhyväksyntää.");
    await button(p, "Kirjaa havainto").click();
    await saved(p);
    await button(p, "Sulje").click();
  }
}
async function conflict(p, b, entry) {
  await open(p);
  await open(b);
  await fill(b, "Tavoite", "Säilyvä luonnos");
  await fill(p, "Tavoite", "Toisen onnistunut muutos");
  await button(p, "Tallenna tavoite ja tekstit").click();
  await saved(p);
  const before = await read(p);
  await button(b, "Tallenna tavoite ja tekstit").click();
  await b.waitForFunction(() =>
    document.querySelector("dialog [role=status]")?.textContent.includes("Muistikirja muuttui"),
  );
  assert.equal((await read(b)).token, before.token);
  await b.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-conflict.png`) });
  await button(b, "Päivitä tilanne").click();
  await b.waitForFunction(
    () =>
      document
        .querySelector("dialog [role=status]")
        ?.textContent.includes("luonnoksesi".toLowerCase()) ||
      document.querySelector("dialog [role=status]")?.textContent.includes("Luonnoksesi"),
  );
  assert.equal(
    await b.$eval('::-p-aria(Tavoite[role="textbox"])', (e) => e.value),
    "Säilyvä luonnos",
  );
  await button(b, "Tallenna tavoite ja tekstit").click();
  await saved(b);
  const after = await read(b);
  assert.equal(after.notebook.goal, "Säilyvä luonnos");
  assert.deepEqual(after.notebook.tasks, before.notebook.tasks);
  assert.deepEqual(after.notebook.observations, before.notebook.observations);
  entry.receipts.push(before, after);
  await button(p, "Sulje").click();
  await button(b, "Sulje").click();
  entry.checks.push(
    "two independent contexts reject stale token, retain draft and preserve prior tasks/observations after refresh",
  );
}
async function markObservationStale(p, b, entry) {
  if (entry.mode === "ui-only") {
    await button(p, "Elementit").click();
    await settled(p);
    await fill(p, "Nimi", "Uusi sisältö");
    await fill(p, "Teksti", "Tarkista uusi versio");
    await button(p, "Lisää elementti").click();
    await p.waitForFunction(() =>
      document.querySelector("dialog [role=status]")?.textContent.includes("Tallennettu."),
    );
    await button(p, "Sulje").click();
  } else {
    const elements = await tool(p, "studio_elements", { sourceFile: "index.html" });
    const receipt = await tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: elements.version,
      action: "add",
      kind: "text",
      name: "Uusi sisältö",
      text: "Tarkista uusi versio",
    });
    assert(receipt.ok, JSON.stringify(receipt));
    entry.receipts.push(receipt);
  }
  await open(b);
  const changed = await read(b);
  assert.equal(changed.staleObservationIds.length, 1);
  await b.$eval("dialog article", (e) => e.scrollIntoView({ block: "center" }));
  assert(
    (await b.$eval("dialog article", (e) => e.textContent)).includes("Aiemman version havainto"),
  );
  await b.screenshot({
    path: join(run.evidence, `${entry.mode}-${entry.width}-stale-observation.png`),
  });
  entry.checks.push("real UI/agent source edit marks the preserved attributed observation stale");
}
async function createCase(bootstrap, entry) {
  const { p, name } = await startAcceptanceCase(run, bootstrap, entry, "notebook", controls);
  entry.projectId = name;
  await p.evaluate(() => {
    window.notebookFocus = [];
    document.addEventListener("focusin", (e) =>
      window.notebookFocus.push({
        type: "focus",
        tag: e.target.tagName,
        label: e.target.closest("label")?.textContent,
      }),
    );
    document.addEventListener(
      "keydown",
      (e) => window.notebookFocus.push({ type: "key", key: e.key, tag: e.target.tagName }),
      true,
    );
  });
  p.on("close", () => {});
  const shelf = await importSyntheticImage(p, button);
  const before = await state(p, entry.projectId);
  await populate(p, entry, shelf);
  const book = await read(p);
  assert.equal(book.notebook.assets[0].checksum, shelf.assets[0].checksum);
  assert.equal(book.notebook.tasks[0].status, "done");
  assert.equal(book.notebook.operations.length, 0);
  entry.checks.push(
    "brief, verified image, manual done task and attributed version-bound observation persist",
  );
  const b = await run.pageFor(entry.projectId, entry.width, entry.height);
  await conflict(p, b, entry);
  entry.sourceAndHistoryBefore = before;
  entry.sourceAndHistoryAfter = await state(p, entry.projectId);
  assert.deepEqual(entry.sourceAndHistoryAfter, before);
  entry.checks.push(
    "notebook writes leave source revision, frozen version index and history unchanged",
  );
  await markObservationStale(p, b, entry);
  await b.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-notebook.png`) });
  entry.notebook = await read(b);
  await button(b, "Sulje").click();
  await p.close();
  await b.close();
  entry.ok = true;
}
async function reopenCase(entry) {
  const p = await run.pageFor(entry.projectId, entry.width, entry.height);
  await open(p);
  const current = await read(p);
  assert.deepEqual(current, entry.notebook);
  assert.equal(
    await p.$eval('::-p-aria(Tavoite[role="textbox"])', (e) => e.value),
    "Säilyvä luonnos",
  );
  const out = {
    ...entry,
    checks: [
      "new server and independent browser session read identical notebook, token, source version and observations",
    ],
    ok: true,
  };
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-reopened.png`) });
  run.report.modes.push(out);
  await p.close();
}
await notebookJourney(run, reopen, { createCase, reopenCase, finish: recordExpectedConflicts });

function recordExpectedConflicts() {
  run.report.expectedConflicts = run.report.httpErrors.filter(
    (e) => e.status === 409 && e.url.endsWith("/notebook"),
  );
  run.report.httpErrors = run.report.httpErrors.filter(
    (e) => !run.report.expectedConflicts.includes(e),
  );
  assert.equal(run.report.expectedConflicts.length, reopen ? 0 : 4);
  writeFileSync(join(run.evidence, "cases.json"), JSON.stringify(run.report.modes, null, 2));
}
