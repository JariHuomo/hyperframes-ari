/** Visible two-context recovery; configurable viewport and mutation path. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { acceptanceRun, tool, settled, typeIntoInput } from "./ari-acceptance-browser.mjs";
const run = await acceptanceRun(
  process.env.ARI_HISTORY_EVIDENCE ?? "screenshots/2026-09-10-history-recovery/browser",
  { hash: "?v=1&t=1&tab=design&rc=0", tool: "studio_refresh_project", isolatedSessions: true },
);
const { report } = run;
report.checks = [];
report.receipts = [];
const sourceFile = "index.html";
const width = Number(process.env.ARI_HISTORY_WIDTH ?? 1280);
const height = width === 1440 ? 900 : 800;
const mode = process.env.ARI_HISTORY_MODE ?? "mixed";
report.viewport = { width, height };
report.mode = mode;
const button = (page, name) => page.locator(`button::-p-text(${name})`);
const list = (page) => tool(page, "studio_elements", { sourceFile });
const source = (page, id) =>
  page.evaluate(
    async (id) =>
      (await fetch(`/api/ari/projects/${id}/source?path=index.html`).then((r) => r.json())).content,
    id,
  );
async function fill(page, label, value) {
  const field = await page.$(`::-p-aria(${label}[role="textbox"])`);
  assert(field, label);
  await typeIntoInput(page, field, value);
}
async function add(page, name) {
  if (mode === "ui-only") {
    await button(page, "Elementit").click();
    await settled(page);
    await fill(page, "Nimi", name);
    await fill(page, "Teksti", name);
    await button(page, "Lisää elementti").click();
    await page.waitForFunction(() =>
      document.querySelector("dialog [role=status]")?.textContent.includes("Tallennettu."),
    );
    await settled(page);
    report.receipts.push(await page.evaluate(() => window.ariStudio.getSnapshot().result));
    await button(page, "Sulje").click();
    return;
  }
  const before = await list(page);
  const receipt = await tool(page, "studio_edit_element", {
    sourceFile,
    version: before.version,
    action: "add",
    kind: "text",
    name,
    text: name,
  });
  assert(receipt.ok, JSON.stringify(receipt));
  report.receipts.push(receipt);
  return receipt;
}
async function frameContains(frame, text) {
  return frame
    .evaluate(
      (text) => document.readyState === "complete" && document.body?.textContent?.includes(text),
      text,
    )
    .catch(() => false);
}
async function paintedFrameContains(frame, text) {
  if (!(await frameContains(frame, text))) return false;
  // Let the preview swap and paint finish, then reject an obsolete frame.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return !frame.detached && (await frameContains(frame, text));
}
async function previewContains(page, text) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    for (const frame of page.frames().filter((frame) => frame !== page.mainFrame())) {
      if (await paintedFrameContains(frame, text)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Preview did not contain ${text}`);
}
async function historyStep(page, label, expected) {
  await button(page, label).click();
  await page.waitForFunction(
    async (expected) =>
      (await window.ariStudio.call("studio_elements", { sourceFile: "index.html" })).version ===
      expected,
    {},
    expected,
  );
}
await run.run(async (id) => {
  const a = await run.pageFor(id, width, height);
  const b = await run.pageFor(id, width, height);
  assert.notEqual(a.browserContext(), b.browserContext());
  await a.bringToFront();
  await add(a, "Ensimmäisen muokkaajan teksti");
  const versionA = (await list(a)).version;
  const bytesA = await source(a, id);
  await b.bringToFront();
  await button(b, "Elementit").click();
  await settled(b);
  await fill(b, "Nimi", "Toisen muokkaajan luonnos");
  await fill(b, "Teksti", "Tämä luonnos säilyy");
  await button(b, "Lisää elementti").click();
  await b.waitForFunction(() =>
    document.querySelector("dialog [role=alert]")?.textContent.includes("historia muuttui"),
  );
  assert.equal(await source(b, id), bytesA);
  await b.screenshot({ path: join(run.evidence, "conflict.png") });
  report.checks.push("stale history refuses and restores exact source bytes");
  await button(b, "Päivitä tilanne").click();
  await settled(b);
  assert.equal(await b.$("dialog [role=alert]"), null);
  assert.equal(
    await b.$eval('::-p-aria(Nimi[role="textbox"])', (e) => e.value),
    "Toisen muokkaajan luonnos",
  );
  assert.equal(
    await b.$eval('::-p-aria(Teksti[role="textbox"])', (e) => e.value),
    "Tämä luonnos säilyy",
  );
  await button(b, "Lisää elementti").click();
  await b.waitForFunction(() =>
    document.querySelector("dialog [role=status]")?.textContent.includes("Tallennettu."),
  );
  await settled(b);
  const afterB = await list(b);
  assert(afterB.elements.some((e) => e.name === "Ensimmäisen muokkaajan teksti"));
  assert(afterB.elements.some((e) => e.name === "Toisen muokkaajan luonnos"));
  await button(b, "Sulje").click();
  await historyStep(b, "Peru", versionA);
  await historyStep(b, "Tee uudelleen", afterB.version);
  report.checks.push(
    "visible refresh preserves drafts; next save, undo and redo preserve both clients' work",
  );
  await previewContains(b, "Tämä luonnos säilyy");
  await b.screenshot({ path: join(run.evidence, "recovered.png") });
  await a.bringToFront();
  await previewContains(a, "Tämä luonnos säilyy");
  const chosen = (await list(a)).elements.find((e) => e.name === "Ensimmäisen muokkaajan teksti");
  await selectFirstEditor(a, chosen.handle);
  const selectedBefore = (await tool(a, "studio_look")).selection;
  let refreshed;
  if (mode === "ui-only") {
    await button(a, "Elementit").click();
    await settled(a);
    await button(a, "Päivitä tilanne").click();
    await settled(a);
    refreshed = await a.evaluate(() => window.ariStudio.getSnapshot().result);
    await button(a, "Sulje").click();
  } else refreshed = await tool(a, "studio_refresh_project", { sourceFile });
  const selectedAfter = (await tool(a, "studio_look")).selection;
  assert.equal(selectedAfter.handle, selectedBefore.handle);
  report.selection = { before: selectedBefore, after: selectedAfter };
  assert(refreshed.ok, JSON.stringify(refreshed));
  assert.equal(refreshed.undoCount, 2);
  assert.equal(refreshed.version, afterB.version);
  report.receipts.push(refreshed);
  await add(a, "Ensimmäisen jatkomuutos");
  const final = await list(a);
  await historyStep(a, "Peru", afterB.version);
  await historyStep(a, "Tee uudelleen", final.version);
  report.checks.push(
    `${mode} refresh replaces both stacks; first client continues without reopen or reload`,
  );
  report.versions = { versionA, versionB: afterB.version, final: final.version };
  report.finalSource = await source(a, id);
  report.history = await a.evaluate(
    async (id) =>
      (await fetch(`/api/ari/projects/${id}/versions/index`).then((r) => r.json())).history,
    id,
  );
  assert.equal(report.history.undo.length, 3);
  assert.equal(report.history.redo.length, 0);
  await previewContains(a, "Ensimmäisen jatkomuutos");
  await a.screenshot({ path: join(run.evidence, "agent-recovered.png") });
});

async function selectFirstEditor(page, handle) {
  if (mode === "ui-only") {
    await page
      .locator('nav[aria-label="Tasot"] button::-p-text(Ensimmäisen muokkaajan teksti)')
      .click();
    await page.waitForFunction(
      (handle) =>
        window.ariStudio.call("studio_look").then((look) => look.selection?.handle === handle),
      {},
      handle,
    );
  } else assert((await tool(page, "studio_select", { handle })).ok);
}
