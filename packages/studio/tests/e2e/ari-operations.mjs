import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptanceRun,
  acceptanceCases,
  createAcceptanceProject,
  tool,
  settled,
} from "./ari-acceptance-browser.mjs";
const evidence =
  process.env.ARI_OPERATIONS_EVIDENCE ?? "screenshots/2026-09-10-d-operations/browser";
const prior = process.env.ARI_OPERATIONS_REOPEN;
const run = await acceptanceRun(evidence, {
  hash: "?v=1&t=1&tab=design&rc=0",
  tool: "studio_resume_work",
  isolatedSessions: true,
});
const button = (p, name) => p.locator(`button::-p-text(${name})`);
const field = (p, name) => p.locator(`::-p-aria(${name}[role="textbox"])`);
const source = (p, id) =>
  p.evaluate(async (id) => (await fetch(`/api/ari/projects/${id}/versions/index`)).json(), id);
await run.run(async (bootstrap) => {
  const cases = prior ? JSON.parse(readFileSync(prior)).modes : [...acceptanceCases()];
  for (const entry of cases) {
    const { current, id, p } = await openCase(entry, bootstrap);
    if (!prior) await prepareNewProject(p, id, current);
    await verifyResume(p, id, current, entry);
    current.ok = true;
    await p.close();
  }
});

async function createHeadline(p, mode, current) {
  const before = await tool(p, "studio_elements", { sourceFile: "index.html" });
  if (mode === "mixed") {
    const receipt = await tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: before.version,
      action: "add",
      kind: "text",
      name: "Jatkettava otsikko",
      text: "Yksi tallennus",
    });
    assert(receipt.ok, JSON.stringify(receipt));
    current.receipts.push(receipt);
  } else {
    await button(p, "Elementit").click();
    await settled(p);
    await field(p, "Nimi").fill("Jatkettava otsikko");
    await field(p, "Teksti").fill("Yksi tallennus");
    await button(p, "Lisää elementti").click();
    await p.waitForFunction(
      () =>
        document.querySelector("dialog [role=status]")?.textContent.includes("Tallennettu") ||
        document.querySelector("dialog [role=alert]"),
    );
    assert.equal(await p.$("dialog [role=alert]"), null);
    await button(p, "Sulje").click();
  }
}

async function verifyResume(p, id, current, entry) {
  const { mode, width } = current;
  const beforeResume = await source(p, id);
  const operations = await tool(p, "studio_resume_work");
  assert(operations.ok, JSON.stringify(operations));
  assert.equal(operations.operations.length, 1, JSON.stringify(operations));
  assert.equal(operations.operations[0].status, "completed");
  assert.equal(operations.operations[0].retryAllowed, false);
  current.operations = operations.operations;
  await button(p, "Muistikirja").click();
  await button(p, "Jatka työtä").click();
  await p.waitForFunction(() =>
    document
      .querySelector('section[aria-label="Tallennetut toiminnot"]')
      ?.textContent.includes("Tehty — tallennus vahvistettu"),
  );
  await p.screenshot({ path: join(run.evidence, `${mode}-${width}-resume.png`) });
  await button(p, "Jatka työtä").click();
  assert.deepEqual(await source(p, id), beforeResume);
  const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
  assert.equal(listing.elements.filter((e) => e.name === "Jatkettava otsikko").length, 1);
  current.checks.push(
    "durable operation receipt; resume is read-only; no duplicate source element",
  );
  if (prior) assert.deepEqual(current.operations, entry.operations);
  current.checks.push(
    prior
      ? "fresh server/browser retained exact operation receipt"
      : "visible notebook lists source result separately from manual tasks",
  );
}

async function prepareNewProject(p, id, current) {
  const { mode } = current;
  await createAcceptanceProject(
    p,
    id,
    mode,
    { button, field, select: (p, label, value) => p.select(`::-p-aria(${label})`, value) },
    current.receipts,
  );
  await p.evaluate(() => {
    const original = window.fetch.bind(window);
    let lost = false;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (!lost && String(args[0]).endsWith("/versions/save") && response.ok) {
        lost = true;
        throw new TypeError("Injected lost response after server publication");
      }
      return response;
    };
  });
  await createHeadline(p, mode, current);
  current.checks.push("source operation through assigned UI/tool path");
}

async function openCase(entry, bootstrap) {
  const current = prior ? { ...entry, checks: [], ok: false } : entry;
  run.report.modes.push(current);
  const { mode, width, height } = current;
  const id = prior ? current.projectId : `d-ops-${mode}-${width}-${Date.now()}`;
  current.projectId = id;
  const p = await run.pageFor(prior ? id : bootstrap, width, height);
  return { current, id, p };
}
