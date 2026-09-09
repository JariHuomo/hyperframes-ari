#!/usr/bin/env node
/** Script → click → saved source → rendered image → undo → reload. No paid providers. */
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const temp = mkdtempSync(join(tmpdir(), "ari-proof-"));
const projectId = temp.split("/").at(-1);
const source = join(temp, "compositions/left-card.html");
const evidence = resolve(
  process.env.ARI_EVIDENCE_DIR ??
    join(root, "screenshots", new Date().toISOString().slice(0, 10), "ari-loop"),
);
mkdirSync(evidence, { recursive: true });
cpSync(join(here, "fixtures/webmcp-edit-loop"), temp, { recursive: true });
const port = await new Promise((resolvePort) => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolvePort(port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const logs = [];
const server = spawn("bun", ["run", "ari:studio", "--project", temp, "--port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
  env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", VITE_HYPERFRAMES_NO_TELEMETRY: "1" },
});
server.stdout.on("data", (data) => logs.push(String(data)));
server.stderr.on("data", (data) => logs.push(String(data)));
let browser;
const report = { ok: false, checks: [], providerSpendUsd: 0 };
const hasYellow = (html) =>
  html.includes("#fbbf24") || html.replace(/\s/g, "").includes("rgb(251,191,36)");
const sha = (data) => createHash("sha256").update(data).digest("hex");
try {
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(logs.join(""));
    try {
      if ((await fetch(`${origin}/api/projects`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  assert(ready, "Studio startup timed out");
  browser = await puppeteer.launch({
    executablePath: resolveChromeExecutable(),
    headless: true,
    args: ["--no-first-run"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/#project/${projectId}`, { waitUntil: "domcontentloaded" });
  const call = (name, input = {}) =>
    page.evaluate((name, input) => window.ariStudio.call(name, input), name, input);
  async function lookReady() {
    await page.waitForFunction(
      async () => {
        if (!window.ariStudio) return false;
        const look = await window.ariStudio.call("studio_look");
        return look.ok && look.sceneStatus === "ready" && look.elementCount > 0;
      },
      { polling: 250 },
    );
    return call("studio_look");
  }
  const before = await lookReady();
  assert.equal(await page.evaluate(() => window.ariStudio.tools().length), 12);
  report.checks.push("12 real tools available without injected WebMCP harness");
  const buttons = page.locator("button::-p-text(Liikkeen tallennus: pois)");
  assert.equal(
    await buttons
      .waitHandle()
      .then((e) => e.evaluate((button) => button.getAttribute("aria-pressed"))),
    "false",
  );
  const target = before.elements.find(
    (e) => e.sourceFile === "compositions/left-card.html" && e.tag === "h1",
  );
  assert(target);
  assert((await call("studio_select", { handle: target.handle })).ok);
  const siblingBefore = readFileSync(join(temp, "compositions/right-card.html"), "utf8");
  const write = await call("studio_set_text", { handle: target.handle, text: "Valitse oma tyyli" });
  assert.equal(write.stage, "saved");
  assert(readFileSync(source, "utf8").includes("Valitse oma tyyli"));
  assert.equal(readFileSync(join(temp, "compositions/right-card.html"), "utf8"), siblingBefore);
  report.checks.push("script text write persisted; duplicate id in sibling untouched");
  const previewHeight = await page.$eval(
    '[aria-label="Composition preview"]',
    (el) => el.getBoundingClientRect().height,
  );
  if (
    (await page.$eval('[data-testid="ari-control-panel"] button', (el) =>
      el.getAttribute("aria-expanded"),
    )) !== "true"
  )
    await page.locator("button::-p-text(Ari-ohjaamo)").click();
  await page.locator('[aria-label="Mainosteksti"]').fill("Valitse oma tyyli.");
  await page.locator("button::-p-text(Tallenna teksti)").click();
  await page.waitForFunction(
    () =>
      window.ariStudio.getSnapshot()?.state === "done" &&
      window.ariStudio.getSnapshot()?.tool === "studio_set_text",
  );
  assert(readFileSync(source, "utf8").includes("Valitse oma tyyli."));
  const dockedPreviewHeight = await page.$eval(
    '[aria-label="Composition preview"]',
    (el) => el.getBoundingClientRect().height,
  );
  assert(Math.abs(previewHeight - dockedPreviewHeight) < 3, "Ari dock must preserve canvas height");
  report.checks.push(
    "plain text field saves through the bridge; side dock preserves preview height",
  );
  await page.locator("summary::-p-text(Skriptikomennot)").click();
  await page.select('[aria-label="Skriptitoiminto"]', "studio_set_style");
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Komennon tiedot"]').value.includes("#ffffff"),
  );
  await page.click('[aria-label="Komennon tiedot"]');
  await page.$eval('[aria-label="Komennon tiedot"]', (element) => element.select());
  await page.keyboard.type(JSON.stringify({ handle: target.handle, styles: { color: "#fbbf24" } }));
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Komennon tiedot"]').value.includes("#fbbf24"),
  );
  const entered = await page.$eval('[aria-label="Komennon tiedot"]', (element) => element.value);
  assert.equal(JSON.parse(entered).styles.color, "#fbbf24");
  await page.locator("button::-p-text(Suorita toiminto)").click();
  await page.waitForFunction(
    () =>
      window.ariStudio.getSnapshot()?.state === "done" &&
      window.ariStudio.getSnapshot()?.tool === "studio_set_style",
  );
  const receipt = await page.evaluate(() => window.ariStudio.getSnapshot().result);
  assert.equal(receipt.stage, "saved");
  assert(
    hasYellow(readFileSync(source, "utf8")),
    JSON.stringify({
      receipt,
      source: readFileSync(source, "utf8"),
      input: await page.$eval('[aria-label="Komennon tiedot"]', (el) => el.value),
    }),
  );
  report.checks.push("visible form and click used the same tool and saved the style");
  await page.locator("button::-p-text(Tarkista ruutukuva)").click();
  await page.waitForFunction(
    () =>
      window.ariStudio.getSnapshot()?.tool === "studio_frame" &&
      window.ariStudio.getSnapshot()?.state === "done",
  );
  const frame = await page.evaluate(() => window.ariStudio.getSnapshot().result);
  assert(frame.ok, JSON.stringify(frame));
  assert(frame.sourceRevision);
  assert.equal(new URL(frame.url).searchParams.get("revision"), frame.sourceRevision);
  const bytes = Buffer.from(await (await fetch(frame.url)).arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  writeFileSync(join(evidence, "source-frame.png"), bytes);
  await page.waitForSelector('img[alt^="Renderöity ruutu"]');
  await page.screenshot({ path: join(evidence, "controls.png") });
  report.checks.push(
    "click rendered a PNG from saved source; result image visible in control panel",
  );
  report.frameSha256 = sha(bytes);
  if (
    (await page.$eval('[data-testid="ari-control-panel"] button', (el) =>
      el.getAttribute("aria-expanded"),
    )) !== "true"
  )
    await page.locator("button::-p-text(Ari-ohjaamo)").click();
  // Closing the panel changes the canvas scale. Wait for the overlay RAF to
  // follow the new geometry before judging or clicking its visible handles.
  let stableGeometryCount = 0;
  let lastGeometry = "";
  const geometryDeadline = Date.now() + 15000;
  while (stableGeometryCount < 5 && Date.now() < geometryDeadline) {
    const geometry = await page.evaluate(() => {
      const frame = document
        .querySelector("hyperframes-player")
        ?.shadowRoot?.querySelector("iframe");
      const element = frame?.contentDocument?.querySelector("#duplicate-headline");
      const box = document.querySelector('[data-dom-edit-selection-box="true"]');
      if (![frame, element, box].every(Boolean)) return null;
      const outer = frame.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      const actual = box.getBoundingClientRect();
      const scale = outer.width / frame.clientWidth;
      const aligned =
        Math.abs(actual.left - (outer.left + inner.left * scale)) < 6 &&
        Math.abs(actual.width - inner.width * scale) < 6;
      return aligned ? JSON.stringify([actual.left, actual.width, outer.width]) : null;
    });
    stableGeometryCount = geometry && geometry === lastGeometry ? stableGeometryCount + 1 : 0;
    lastGeometry = geometry;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(
    stableGeometryCount,
    5,
    "Selection outline did not settle at the enlarged canvas geometry",
  );
  report.checks.push("selection outline follows the enlarged canvas geometry");
  await page.screenshot({ path: join(evidence, "large-canvas.png") });
  const previous = readFileSync(source, "utf8");
  await page.locator('section[aria-label="Ari-ohjaamo"] button::-p-text(Peru)').click();
  const undoDeadline = Date.now() + 15000;
  while (readFileSync(source, "utf8") === previous && Date.now() < undoDeadline)
    await new Promise((r) => setTimeout(r, 100));
  assert(!hasYellow(readFileSync(source, "utf8")));
  assert(readFileSync(source, "utf8").includes("Valitse oma tyyli"));
  report.checks.push("visible undo reverted only the latest style edit");
  await page.reload({ waitUntil: "domcontentloaded" });
  await lookReady();
  const inspect = await call("studio_inspect", { handle: target.handle });
  assert.equal(inspect.text, "Valitse oma tyyli.");
  assert.equal(
    await page
      .locator("button::-p-text(Liikkeen tallennus: pois)")
      .waitHandle()
      .then((e) => e.evaluate((button) => button.getAttribute("aria-pressed"))),
    "false",
  );
  report.checks.push("text survived reload; auto-record stayed off");
  await page.click('button[aria-label="Inspector"]');
  await page.locator("button::-p-text(Kuva isoksi)").waitHandle();
  assert.equal(
    await page.$eval('button[aria-label="Inspector"]', (el) => el.getAttribute("aria-pressed")),
    "true",
  );
  await page.locator("button::-p-text(Kuva isoksi)").click();
  await page.locator("button::-p-text(Näytä työkalupaneelit)").waitHandle();
  assert.equal(
    await page.$eval('button[aria-label="Inspector"]', (el) => el.getAttribute("aria-pressed")),
    "false",
  );
  report.checks.push("native Inspector exits focus mode; canvas mode hides it with truthful state");
  assert.deepEqual(errors, []);
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  if (browser) {
    const pages = await browser.pages();
    const active = pages.at(-1);
    report.pageText = await active?.evaluate(() => document.body.innerText.slice(0, 4000));
    await active?.screenshot({ path: join(evidence, "failure.png") });
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
  }
  writeFileSync(join(evidence, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(evidence, "server.log"), logs.join(""));
  rmSync(join(root, "packages/studio/data/projects", projectId), { force: true });
  rmSync(temp, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
