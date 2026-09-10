/** Offline browser plumbing shared by the visible A3 acceptance journeys. */
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";
const origin = "http://127.0.0.1:3084";
function launchAcceptanceBrowser() {
  return puppeteer.launch({
    executablePath: resolveChromeExecutable(),
    headless: false,
    args: ["--disable-background-networking", "--disable-sync", "--disable-component-update"],
  });
}
function acceptanceReport() {
  return {
    ok: false,
    headed: true,
    providerSpendUsd: 0,
    modes: [],
    pageErrors: [],
    httpErrors: [],
    workspaceReloads: 0,
    navigations: [],
    externalRequestsBlocked: [],
  };
}
export const tool = (p, name, input = {}) =>
  p.evaluate(({ name, input }) => window.ariStudio.call(name, input), { name, input });
export async function settled(p) {
  await p.waitForFunction(() => !document.querySelector("dialog fieldset:disabled"));
}
async function acceptancePage(browser, report, width, height) {
  const p = await browser.newPage();
  await p.setViewport({ width, height });
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    if (r.url().startsWith(origin) || r.url().startsWith("data:") || r.url().startsWith("blob:"))
      void r.continue();
    else {
      report.externalRequestsBlocked.push(r.url());
      void r.abort();
    }
  });
  p.on("pageerror", (e) => report.pageErrors.push(e.message));
  p.on("response", (response) => {
    if (response.status() >= 400)
      report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  let lastMainUrl;
  p.on("framenavigated", (frame) => {
    if (frame !== p.mainFrame()) return;
    const url = frame.url();
    if (lastMainUrl === url) report.workspaceReloads++;
    report.navigations.push(url);
    lastMainUrl = url;
  });
  return p;
}
async function createBootstrap() {
  const bootstrapId = `a3-bootstrap-${Date.now()}`;
  const proposal = await fetch(`${origin}/api/ari/projects/propose`, {
    method: "POST",
    body: JSON.stringify({ name: bootstrapId, template: "blank" }),
  }).then((r) => r.json());
  assert(proposal.ok);
  const bootstrap = await fetch(`${origin}/api/ari/projects/create`, {
    method: "POST",
    body: JSON.stringify({ name: bootstrapId, template: "blank", location: proposal.project.dir }),
  }).then((r) => r.json());
  assert(bootstrap.ok);
  return bootstrapId;
}
export async function createAcceptanceProject(p, name, mode, controls, receipts) {
  const { button, field, select } = controls;
  if (mode === "ui-only") {
    await button(p, "Uusi mainos / aineisto").click();
    await field(p, "Mainoksen nimi").fill(name);
    await select(p, "Pohja", "blank");
    await button(p, "Tarkista tiedot").click();
    await button(p, "Luo mainos").click();
    await p.waitForFunction((name) => location.hash.startsWith(`#project/${name}`), {}, name);
    await button(p, "Sulje").click();
  } else {
    const proposal = await tool(p, "studio_prepare_project", { name, template: "blank" });
    assert(proposal.ok);
    const created = await tool(p, "studio_create_project", {
      name,
      template: "blank",
      location: proposal.project.dir,
    });
    assert(created.ok, JSON.stringify(created));
    receipts.push(created);
    assert((await tool(p, "studio_open_project", { id: name })).ok);
  }
  await p.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="ari-control-panel"]')
        ?.textContent.includes("Esikatselu latautuu"),
  );
}

/** Shared visible-control locators. One spelling per control across journeys. */
export const textButton = (p, name) => p.locator(`button::-p-text(${name})`);
export const ariaSelect = (p, name, value) => p.select(`::-p-aria(${name})`, value);
export const panelTab = (p, name) => p.locator(`button[role=tab]::-p-text(${name})`).click();

/** Open one acceptance case's page and create its project through the chosen path. */
export async function startAcceptanceCase(run, bootstrap, current, prefix, controls) {
  const { mode, width, height } = current;
  const p = await run.pageFor(bootstrap, width, height);
  const name = `${prefix}-${mode}-${width}-${Date.now()}`;
  await createAcceptanceProject(p, name, mode, controls, current.receipts);
  return { p, name };
}

export async function importSyntheticImage(p, button) {
  await button(p, "Uusi mainos / aineisto").click();
  await button(p, "Aineisto").click();
  const upload = await p.$("input[type=file]");
  await upload.uploadFile(join(import.meta.dirname, "fixtures/ari-authoring/one.png"));
  await p.waitForFunction(() =>
    document.querySelector("dialog [role=status]")?.textContent.includes("1 kuvaa tuotu"),
  );
  await button(p, "Sulje").click();
  const shelf = await tool(p, "studio_images");
  assert(shelf.ok);
  return shelf;
}
/**
 * `expectedHttpError` lets ONE journey declare the refusals it deliberately
 * provokes — a confined route saying no is the behaviour under test there.
 * Without it every non-2xx is still a failure, and the declaring journey is
 * expected to assert how many of its own refusals it caused.
 */
function verifyBrowserReport(report, expectedHttpError = () => false) {
  assert.equal(report.pageErrors.length, 0);
  report.knownCompatibilityProbes = report.httpErrors.filter(
    (e) => e.status === 404 && new URL(e.url).pathname === "/api/environment/ffmpeg",
  );
  report.deliberateRefusals = report.httpErrors.filter(
    (e) => !report.knownCompatibilityProbes.includes(e) && expectedHttpError(e),
  );
  report.unexpectedHttpErrors = report.httpErrors.filter(
    (e) => !report.knownCompatibilityProbes.includes(e) && !report.deliberateRefusals.includes(e),
  );
  assert.equal(report.unexpectedHttpErrors.length, 0);
  assert.equal(report.workspaceReloads, 0);
  assert.equal(report.externalRequestsBlocked.length, 0);
  report.ok = true;
}
async function recordBrowserFailure(browser, report, evidence, error) {
  report.error = error.stack;
  process.exitCode = 1;
  for (const page of await browser.pages()) {
    await page.screenshot({ path: join(evidence, "failure.png") }).catch(() => {});
    report.failureText = await page.evaluate(() => document.body.innerText).catch(() => "");
  }
}
async function finishBrowserReport(browser, report, evidence) {
  writeFileSync(join(evidence, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
export async function waitForSceneCount(p, count) {
  await p.waitForFunction(
    async (count) => {
      const r = await window.ariStudio.call("studio_scenes", { sourceFile: "index.html" });
      return r.rows?.length === count;
    },
    {},
    count,
  );
}

export async function acceptanceRun(evidencePath, options) {
  const root = resolve(import.meta.dirname, "../../../..");
  const evidence = resolve(root, evidencePath);
  mkdirSync(evidence, { recursive: true });
  const browser = await launchAcceptanceBrowser();
  const report = acceptanceReport();
  async function pageFor(id, width, height) {
    const surface = options.isolatedSessions ? await browser.createBrowserContext() : browser;
    const p = await acceptancePage(surface, report, width, height);
    if (options.selectionDebug) {
      await p.evaluateOnNewDocument(() => {
        if (window === window.top) localStorage.setItem("hf-select-debug", "1");
      });
      p.on("console", (message) => {
        if (message.text().startsWith("[hf-select]")) console.log(message.text());
      });
    }
    await p.goto(`${origin}/#project/${id}${options.hash}`, { waitUntil: "networkidle0" });
    if (options.previewButton) await p.locator("button::-p-text(Preview)").click();
    await p.waitForFunction(
      (name) => window.ariStudio?.tools().some((t) => t.name === name),
      {},
      options.tool,
    );
    return p;
  }
  async function run(journey) {
    try {
      await journey(await createBootstrap());
      verifyBrowserReport(report, options.expectedHttpError);
    } catch (error) {
      await recordBrowserFailure(browser, report, evidence, error);
    } finally {
      await finishBrowserReport(browser, report, evidence);
    }
    console.log(JSON.stringify(report, null, 2));
  }
  return { root, evidence, browser, report, pageFor, run };
}
export function* acceptanceCases() {
  for (const mode of ["ui-only", "mixed"])
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
    ])
      yield { mode, width, height, ok: false, checks: [], receipts: [], selections: [] };
}
export async function typeIntoInput(p, input, value) {
  await input.evaluate((e) => {
    e.focus();
    e.select();
  });
  await p.keyboard.press("Backspace");
  await p.keyboard.type(value, { delay: 2 });
  assert.equal(await input.evaluate((e) => e.value), value);
}
export async function fillDefinedFields(extra, fields, fill) {
  for (const [key, label] of Object.entries(fields))
    if (extra[key]) await fill(label, String(extra[key]));
}

export async function fillTextFields(p, field, extra, fields) {
  await fillDefinedFields(extra, fields, (label, value) => field(p, label).fill(value));
}

/** The element dialog reports success in `role=status` and a refusal in `role=alert`. */
export async function elementDialogResult(p) {
  await p.waitForFunction(() => {
    const dialog = document.querySelector("dialog");
    return (
      dialog &&
      (dialog.querySelector("[role=alert]") !== null || dialog.textContent.includes("Tallennettu."))
    );
  });
  const error = await p.$eval("dialog", (d) => d.querySelector("[role=alert]")?.textContent ?? "");
  return error ? { ok: false, error } : { ok: true };
}

/** One scene structure operation through the bounded tools, priced before the write. */
export async function editSceneWithCommand(p, args) {
  const plan = await tool(p, "studio_prepare_scene", args);
  assert(plan.ok, JSON.stringify(plan));
  const receipt = await tool(p, "studio_edit_scene", {
    ...args,
    reviewVersion: plan.reviewVersion,
  });
  assert(receipt.ok, JSON.stringify(receipt));
  return receipt;
}

/** Both frozen replays have finished loading and are showing a picture. */
export function waitComparisonReady(p) {
  return p.waitForFunction(
    () =>
      document.querySelectorAll("dialog figure p").length === 2 &&
      [...document.querySelectorAll("dialog figure p")].every((e) => e.textContent === "Valmis"),
  );
}

/**
 * Delete the frozen `index.html` of the newest version and prove that preparing
 * a package from it fails without publishing anything. The version store shares
 * one blob between identical files, so the doomed version has to be the only
 * one holding those bytes.
 */
export async function breakVersionDependency(p, projectDir) {
  const index = JSON.parse(readFileSync(join(projectDir, ".ari-versions/index.json"), "utf8"));
  const doomed = index.versions.at(-1);
  const blob = join(projectDir, ".ari-versions/objects", doomed.files["index.html"]);
  assert(existsSync(blob));
  rmSync(blob);
  const before = await tool(p, "studio_list_review_packages");
  const failed = await tool(p, "studio_prepare_review_package", { versionId: doomed.id });
  assert.equal(failed.ok, false, JSON.stringify(failed));
  const after = await tool(p, "studio_list_review_packages");
  assert.deepEqual(
    after.packages.map((row) => row.id),
    before.packages.map((row) => row.id),
  );
  return { versionId: doomed.id, reason: failed.reason };
}

/** The refusal a full repair-round budget produces, gap and suggestion included. */
export function assertRoundLimitRefusal(reason, gap, suggestion) {
  assert.match(reason, /Korjauskierrosten raja täyttyi/);
  assert.match(reason, new RegExp(gap));
  assert.match(reason, new RegExp(suggestion));
}

/**
 * Answer the next render POST with a 503 inside the page, click export and
 * prove the panel says so and hides any previous download. The failure never
 * reaches the network, so it is not an HTTP error the report has to excuse.
 */
export async function injectRenderFailure(p) {
  await p.evaluate(() => {
    const original = window.fetch;
    let failed = false;
    const isFirstRender = (input, init) =>
      !failed && String(input).endsWith("/render") && init?.method === "POST";
    const refusal = () =>
      new Response(JSON.stringify({ error: "Testin vientivirhe" }), { status: 503 });
    window.fetch = (input, init) => {
      if (!isFirstRender(input, init)) return original(input, init);
      failed = true;
      return Promise.resolve(refusal());
    };
  });
  await p.locator("button::-p-text(Vie video · MP4)").click();
  await p.waitForFunction(() =>
    document
      .querySelector('[aria-label="Videon vienti"] [role=alert]')
      ?.textContent.includes("Testin vientivirhe"),
  );
  assert.equal(await p.$('[aria-label="Videon vienti"] a[download]'), null);
}
