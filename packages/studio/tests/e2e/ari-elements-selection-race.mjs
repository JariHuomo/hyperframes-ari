/** Headed, offline regression: a saved receipt must not overwrite a newer canvas choice. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";
const evidence = resolve(
  process.env.ARI_SELECTION_RACE_EVIDENCE ?? "screenshots/2026-09-10-a3-audit-fixes",
);
mkdirSync(evidence, { recursive: true });
const origin = "http://127.0.0.1:3084";
const report = {
  ok: false,
  headed: true,
  providerSpendUsd: 0,
  pageErrors: [],
  externalRequests: [],
  checks: [],
};
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: false,
  args: ["--disable-background-networking", "--disable-sync", "--disable-component-update"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().startsWith(origin) || /^(data|blob):/.test(r.url())) void r.continue();
    else {
      report.externalRequests.push(r.url());
      void r.abort();
    }
  });
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  const name = `a3-race-${Date.now()}`;
  const post = (path, input) =>
    fetch(`${origin}/api/ari/projects/${path}`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.json());
  const proposed = await post("propose", { name, template: "blank" });
  assert(proposed.ok);
  const created = await post("create", { name, template: "blank", location: proposed.project.dir });
  assert(created.ok);
  report.project = created;
  await page.goto(`${origin}/#project/${created.project.id}?v=1&t=1&tab=design&rc=0`, {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(() =>
    window.ariStudio?.tools().some((t) => t.name === "studio_elements"),
  );
  const call = (name, input = {}) =>
    page.evaluate(({ name, input }) => window.ariStudio.call(name, input), { name, input });
  const list = () => call("studio_elements", { sourceFile: "index.html" });
  for (const text of ["Ensimmäinen", "Uusin valinta"]) {
    const before = await list();
    const receipt = await call("studio_edit_element", {
      sourceFile: "index.html",
      version: before.version,
      action: "add",
      kind: "text",
      name: text,
      text,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    assert.equal(receipt.affectsInstances, 1);
  }
  const before = await list();
  assert.equal(before.affectsInstances, 1);
  const first = before.elements.find((e) => e.name === "Ensimmäinen");
  const other = before.elements.find((e) => e.name === "Tausta");
  assert(first && other);
  await page.waitForSelector('nav[aria-label="Tasot"]', { visible: true });
  // Delay only this hook's wait; preview rendering and human selection keep running.
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.a3Release = null;
    window.setTimeout = function (callback, delay, ...args) {
      if (delay === 50 && new Error().stack?.includes("useElementReceiptSelection")) {
        window.a3Release = () => original(callback, 0, ...args);
        return 0;
      }
      return original(callback, delay, ...args);
    };
    window.a3RestoreTimer = () => {
      window.setTimeout = original;
    };
  });
  const pending = call("studio_edit_element", {
    sourceFile: "index.html",
    version: before.version,
    action: "rename",
    target: first.target,
    name: "Tallennettu otsikko",
  });
  void pending.catch(() => {});
  await page.waitForFunction(() => typeof window.a3Release === "function");
  let previewReady = false;
  for (let attempt = 0; attempt < 100 && !previewReady; attempt++) {
    for (const frame of page.frames()) {
      previewReady ||= await frame
        .evaluate(
          () =>
            document.readyState === "complete" &&
            Boolean(document.querySelector('[data-label="Tallennettu otsikko"]')),
        )
        .catch(() => false);
    }
    if (!previewReady) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(previewReady, "Saved preview must load before the newer canvas choice");
  await page.waitForFunction(async () => window.__studioTest?.selectByDomId("tausta"));
  await page.screenshot({ path: join(evidence, "delayed-new-selection.png") });
  await page.evaluate(() => {
    window.a3RestoreTimer();
    window.a3Release();
  });
  const receipt = await pending;
  assert(receipt.ok, JSON.stringify(receipt));
  assert.equal(receipt.previewReady, false);
  assert.equal(receipt.affectsInstances, 1);
  const look = await call("studio_look");
  assert(
    look.selection.handle.endsWith(encodeURIComponent(other.target)),
    JSON.stringify(look.selection),
  );
  const after = await list();
  assert.equal(after.version, receipt.version);
  assert(after.elements.some((e) => e.target === first.target && e.name === "Tallennettu otsikko"));
  report.receipt = receipt;
  report.selection = look.selection;
  report.checks.push(
    "newer canvas selection survives delayed receipt; source write and version remain successful",
    "root read and write both report one affected instance",
  );
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Elementit",
    );
    if (!button || !button.getBoundingClientRect().width)
      throw new Error("Visible element control missing");
    button.click();
  });
  await page
    .waitForSelector("[data-testid=element-impact]", { timeout: 5000 })
    .catch(async (error) => {
      await page.screenshot({ path: join(evidence, "dialog-failure.png") });
      throw error;
    });
  report.impactText = await page.$eval("[data-testid=element-impact]", (e) => e.textContent);
  assert(report.impactText.includes("tätä kohtausta"), report.impactText);
  await page.screenshot({ path: join(evidence, "root-impact.png") });
  report.checks.push("root UI impact is singular");
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.externalRequests, []);
  report.ok = true;
} finally {
  writeFileSync(join(evidence, "browser-report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
