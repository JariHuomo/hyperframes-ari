#!/usr/bin/env node
/** A1–A2 local acceptance. Run against a foreground Ari Studio on ARI_AUTHORING_PORT.
 * ui-only writes exclusively through visible controls; mixed uses discovered tools.
 * No composition-source edits; only disposable selected originals are removed.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";
const root = resolve(import.meta.dirname, "../../../..");
const origin = `http://127.0.0.1:${process.env.ARI_AUTHORING_PORT || 3084}`;
const evidence = join(root, "screenshots/2026-09-09-a1-a2");
const fixtures = join(import.meta.dirname, "fixtures/ari-authoring");
const stamp = Date.now();
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: false,
  args: [
    "--no-first-run",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-component-update",
  ],
});
const report = {
  ok: false,
  providerSpendUsd: 0,
  headed: true,
  modes: [],
  pageErrors: [],
  externalRequestsBlocked: [],
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function pageFor(id = bootstrapId) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:"))
      void request.continue();
    else {
      report.externalRequestsBlocked.push(url);
      void request.abort();
    }
  });
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  await page.goto(`${origin}/#project/${id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() =>
    window.ariStudio?.tools().some((tool) => tool.name === "studio_create_project"),
  );
  return page;
}
const button = (page, name) => page.locator(`button::-p-text(${name})`);
const field = (page, name) => page.locator(`::-p-aria(${name})`);
const tool = (page, name, input = {}) =>
  page.evaluate((args) => window.ariStudio.call(args.name, args.input), { name, input });
async function waitProject(page, id) {
  await page.waitForFunction((id) => location.hash.startsWith(`#project/${id}`), {}, id);
  await page.waitForFunction(() => {
    function find(root) {
      return (
        [...root.querySelectorAll("iframe")].some((frame) =>
          frame.contentDocument?.querySelector('[data-composition-id="main"]'),
        ) ||
        [...root.querySelectorAll("*")].some(
          (element) => element.shadowRoot && find(element.shadowRoot),
        )
      );
    }
    return find(document);
  });
}
async function screenshot(page, filename) {
  await page.screenshot({ path: join(evidence, filename) });
}
async function api(path) {
  const response = await fetch(`${origin}${path}`);
  assert(response.ok);
  return response.json();
}
const bootstrapId = `ari-a1a2-bootstrap-${stamp}`;
const prepareBootstrap = await fetch(`${origin}/api/ari/projects/propose`, {
  method: "POST",
  body: JSON.stringify({ name: bootstrapId, template: "blank" }),
}).then((r) => r.json());
assert(prepareBootstrap.ok);
const bootstrapReceipt = await fetch(`${origin}/api/ari/projects/create`, {
  method: "POST",
  body: JSON.stringify({
    name: bootstrapId,
    template: "blank",
    location: prepareBootstrap.project.dir,
  }),
}).then((r) => r.json());
assert(bootstrapReceipt.ok);
try {
  for (const mode of ["ui-only", "mixed"]) {
    let page = await pageFor();
    const current = { mode, checks: [], projects: [], receipts: [] };
    report.modes.push(current);
    const mark = (name) => current.checks.push({ name, ok: true });
    for (const template of ["blank", "product"]) {
      const name = `ari-a1a2-${mode}-${template}-${stamp}`;
      let receipt;
      if (mode === "ui-only") {
        await button(page, "Uusi mainos / aineisto").click();
        await field(page, "Mainoksen nimi").fill(name);
        const select = await page.$("dialog select");
        await select.select(template);
        await button(page, "Tarkista tiedot").click();
        await page.waitForFunction(
          (name) => document.querySelector("dialog")?.textContent.includes(`/${name}`),
          {},
          name,
        );
        await screenshot(page, `${mode}-${template}-before-create.png`);
        const saved = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/ari/projects/create") &&
            response.request().method() === "POST",
        );
        await button(page, "Luo mainos").click();
        receipt = await (await saved).json();
        assert.equal(receipt.ok, true);
        current.receipts.push(receipt);
        await waitProject(page, name);
        // Browser receipts are observed from actual responses, while all writes above are UI actions.
      } else {
        const proposal = await tool(page, "studio_prepare_project", { name, template });
        assert.equal(proposal.ok, true);
        assert.equal(proposal.project.duration, 7);
        assert.equal(proposal.project.width, 1080);
        receipt = await tool(page, "studio_create_project", {
          name,
          template,
          location: proposal.project.dir,
        });
        assert.equal(receipt.ok, true);
        current.receipts.push(receipt);
        assert(receipt.files.every((file) => file.version.startsWith('"sha256:')));
        assert.equal((await tool(page, "studio_open_project", { id: name })).ok, true);
        await waitProject(page, name);
      }
      const before = readFileSync(join(receipt.project.dir, "index.html"));
      assert(before.toString().includes("window.__timelines.main = tl"));
      assert(before.toString().includes('data-duration="7"'));
      if (template === "blank") {
        const blankFrame = await page.waitForFrame(async (frame) =>
          Boolean(await frame.$('[data-composition-id="main"]')),
        );
        assert.equal(
          await blankFrame.$eval('[data-composition-id="main"]', (element) =>
            element.textContent.trim(),
          ),
          "",
        );
      }
      current.projects.push({
        id: name,
        template,
        dir: receipt.project.dir,
        sourceSha256: sha(before),
      });
      mark(`${template}: created with a local 7 s timeline`);
      if (mode === "ui-only") {
        await field(page, "Mainoksen nimi").fill(name);
        await button(page, "Tarkista tiedot").click();
        await button(page, "Luo mainos").click();
        await page.waitForFunction(() =>
          document.querySelector('dialog [role="alert"]')?.textContent.includes("Samanniminen"),
        );
        await screenshot(page, `${mode}-${template}-collision.png`);
        await button(page, "Sulje").click();
      } else {
        const repeated = await tool(page, "studio_create_project", {
          name,
          template,
          location: receipt.project.dir,
        });
        assert.equal(repeated.ok, false);
        assert(repeated.reason.includes("Samanniminen"));
      }
      assert.equal(sha(readFileSync(join(receipt.project.dir, "index.html"))), sha(before));
      mark(`${template}: collision preserved original bytes`);
    }
    const selected = current.projects.at(-1);
    const originals = mkdtempSync(join(tmpdir(), "ari-selected-images-"));
    const filenames = [
      "one.png",
      "invalid.png",
      "product.jpeg",
      "oversize.png",
      "product.webp",
      "truncated.png",
    ];
    for (const file of filenames) cpSync(join(fixtures, file), join(originals, file));
    if (mode === "ui-only") {
      await button(page, "Uusi mainos / aineisto").click();
      await button(page, "Aineisto").click();
      const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
      void chooserPromise.catch(() => {});
      await button(page, "Valitse kuvat").click();
      const chooser = await chooserPromise;
      await chooser.accept(filenames.map((file) => join(originals, file)));
      await page.waitForFunction(() =>
        document.querySelector('dialog [role="status"]')?.textContent.includes("3 kuvaa tuotu"),
      );
      assert.equal(
        await page.$$eval('[aria-label="Hylätyt kuvat"] li', (items) => items.length),
        3,
      );
    } else {
      const result = await tool(page, "studio_import_images", {
        files: filenames.map((name) => ({
          name,
          base64: readFileSync(join(originals, name)).toString("base64"),
        })),
      });
      current.receipts.push(result);
      assert.equal(result.partial, true);
      assert.equal(result.results.filter((item) => item.ok).length, 3);
      assert.equal(result.results.filter((item) => !item.ok).length, 3);
      await button(page, "Uusi mainos / aineisto").click();
      await button(page, "Aineisto").click();
    }
    mark("PNG/JPEG/WebP copied; three invalid images rejected independently");
    const shelf = await api(`/api/ari/projects/${selected.id}/images`);
    assert.equal(shelf.assets.length, 3);
    current.assets = shelf.assets;
    for (const asset of shelf.assets) {
      const bytes = readFileSync(join(selected.dir, asset.path));
      assert.equal(sha(bytes), asset.checksum);
      assert.equal(sha(readFileSync(join(originals, asset.name))), asset.checksum);
    }
    rmSync(originals, { recursive: true });
    mark("copied bytes match selected originals; disposable originals deleted");
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewport(viewport);
      await button(page, "Päivitä aineistohylly").click();
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll("dialog img")];
        return (
          images.length === 3 && images.every((image) => image.complete && image.naturalWidth > 0)
        );
      });
      await page.waitForFunction(() =>
        [...document.querySelectorAll("dialog fieldset")].every((field) => !field.disabled),
      );
      await screenshot(page, `${mode}-shelf-${viewport.width}x${viewport.height}.png`);
      assert(
        await page.$eval("dialog", (dialog) => {
          const r = dialog.getBoundingClientRect();
          return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        }),
      );
      mark(`visible shelf and bounded dialog at ${viewport.width}x${viewport.height}`);
    }
    await button(page, "Sulje").click();
    await field(page, "Aika sekunteina").fill("1");
    await button(page, "Siirry").click();
    const previewFrame = await page.waitForFrame(async (frame) =>
      Boolean(await frame.$('[id="pääviesti"]')),
    );
    const headline = await previewFrame.waitForSelector('[id="pääviesti"]');
    assert.equal(await headline.evaluate((element) => getComputedStyle(element).opacity), "1");
    mark("master timeline seek reaches the visible headline at one second");
    await screenshot(page, `${mode}-composition.png`);
    await page.close();
    page = await pageFor(selected.id);
    await waitProject(page, selected.id);
    await button(page, "Uusi mainos / aineisto").click();
    await button(page, "Aineisto").click();
    await button(page, "Päivitä aineistohylly").click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("dialog img")].length === 3 &&
        [...document.querySelectorAll("dialog img")].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
    );
    assert.deepEqual((await api(`/api/ari/projects/${selected.id}/images`)).assets, shelf.assets);
    await screenshot(page, `${mode}-reopened.png`);
    assert.equal(sha(readFileSync(join(selected.dir, "index.html"))), selected.sourceSha256);
    mark("new browser page reopens copied media without original files");
    await page.keyboard.press("Escape");
    assert.equal(await page.$("dialog"), null);
    mark("Escape closes the modal");
    await page.close();
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.externalRequestsBlocked, []);
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  throw error;
} finally {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "browser-report.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
