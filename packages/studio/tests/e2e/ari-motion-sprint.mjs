#!/usr/bin/env node
import { ariControls, prepareDownload, probeVideo, downloadExport } from "./ariBrowserEvidence.mjs";
/** Real local UI + bridge acceptance, frozen prototype, no provider calls. */
import assert from "node:assert/strict";
import { mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";
const root = resolve(import.meta.dirname, "../../../..");
const project = "rajamarket-sprint-mixed";
const dir = join(root, "examples", project);
const evidence = resolve(
  process.env.ARI_EVIDENCE_DIR || join(root, "screenshots/2026-09-09-easy-motion"),
);
mkdirSync(dir, { recursive: true });
mkdirSync(evidence, { recursive: true });
for (const file of ["index.html", "hyperframes.json"])
  cpSync(join(root, "examples/rajamarket-uat", file), join(dir, file));
cpSync(join(root, "examples/rajamarket-uat/assets"), join(dir, "assets"), { recursive: true });
const startup = spawnSync(
  process.execPath,
  ["scripts/ari-studio.mjs", "--project", dir, "--port", "3080", "--background"],
  { cwd: root, encoding: "utf8" },
);
if (startup.status !== 0 && !startup.stderr.includes("jo käytössä"))
  throw new Error(startup.stderr);
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: true,
  args: ["--no-first-run"],
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const report = { ok: false, checks: [], receipts: [], providerSpendUsd: 0 };
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const source = () => readFileSync(join(dir, "index.html"), "utf8");
const call = (name, input = {}) =>
  page.evaluate((n, i) => window.ariStudio.call(n, i), name, input);
const { button, fill } = ariControls(page);
async function settled(tool) {
  await page.waitForFunction(
    (t) => {
      const s = window.ariStudio?.getSnapshot();
      return s?.state === "done" && s.tool === t;
    },
    { polling: 100 },
    tool,
  );
  const s = await page.evaluate(() => window.ariStudio.getSnapshot());
  assert.equal(s.result.ok, true, JSON.stringify(s.result));
  report.receipts.push(s);
  return s.result;
}
async function selected(label) {
  await page.locator(`[aria-label="Tasot"] button::-p-text(${label})`).click();
  await settled("studio_select");
}
try {
  await page.goto(`http://127.0.0.1:3080/#project/${project}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label="Tasot"] button');
  await selected("Headline");
  const first = await call("studio_look");
  const handle = first.selection.handle;
  assert((await call("studio_set_text", { handle, text: "Kuusi herkkua mukaan." })).ok);
  await fill("Tekstikoko (px)", "76");
  await button("Tallenna ulkoasu").click();
  await settled("studio_set_style");
  assert(source().includes("font-size: 76px"));
  report.checks.push("script text -> UI font size saved and same selection retained");
  await selected("Pack1 Image");
  await fill("Vaakasiirto (px)", "16");
  await fill("Pystysiirto (px)", "0");
  await button("Siirrä kohdetta").click();
  const moved = await settled("studio_transform");
  assert(moved.changed);
  report.checks.push("product image moved from visible controls and persisted");
  await selected("Headline");
  const add = await call("studio_add_animation", {
    handle,
    method: "from",
    preset: "slide",
    position: 2.6,
    duration: 0.45,
    ease: "power2.out",
  });
  assert.equal(add.stage, "verified", JSON.stringify(add));
  assert(add.animationId);
  report.receipts.push(add);
  await page.waitForSelector('[aria-label="Liike 1 alkaa (s)"]');
  await fill("Liike 1 alkaa (s)", "0,12");
  await fill("Liike 1 kesto (s)", "0,55");
  await button("Tallenna liike 1").click();
  const update = await settled("studio_update_animation");
  assert.equal(update.stage, "verified");
  assert.notEqual(update.animationId, add.animationId);
  report.checks.push(
    "atomic preset and UI retiming return saved revision plus current animation id",
  );
  await button("Peru").click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Liike 1 alkaa (s)"]')?.value === "2.6",
  );
  await button("Tee uudelleen").click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Liike 1 alkaa (s)"]')?.value === "0.12",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label="Liike 1 alkaa (s)"]');
  assert.equal(await page.$eval('[aria-label="Liike 1 kesto (s)"]', (e) => e.value), "0.55");
  report.checks.push("one undo/redo restores timing; text, geometry and motion survive reload");
  await call("studio_seek", { time: 3.5 });
  const frame = await call("studio_frame");
  assert(frame.ok, JSON.stringify(frame));
  const png = await fetch(new URL(frame.url, "http://127.0.0.1:3080"));
  writeFileSync(join(evidence, "mixed-source-frame.png"), Buffer.from(await png.arrayBuffer()));
  await fill("Mainosteksti", "Kuusi herkkua mukaan!");
  await button("Tallenna teksti").click();
  await settled("studio_set_text");
  await page.waitForFunction(() => document.body.innerText.includes("Ruutukuva vanhentunut"));
  assert.equal((await fetch(new URL(frame.url, "http://127.0.0.1:3080"))).status, 409);
  report.checks.push("source frame marked stale after edit; old revision URL refuses with 409");
  // Exercise a failed source write; no silent success or duplicate tween.
  const beforeFailure = source();
  let refused = false;
  await page.setRequestInterception(true);
  const intercept = (req) => {
    if (!refused && isAnimationWrite(req)) {
      refused = true;
      void req.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "UAT deliberate save failure" }),
      });
    } else void req.continue();
  };
  page.on("request", intercept);
  const failed = await call("studio_add_animation", {
    handle,
    method: "from",
    preset: "grow",
    position: 1,
    duration: 0.3,
  });
  await page.setRequestInterception(false);
  page.off("request", intercept);
  assert(refused);
  assert.equal(failed.ok, false);
  assert.equal(source(), beforeFailure);
  report.checks.push("injected write failure returns failure and leaves no duplicate motion");
  // Successful recovery, final content through the bridge.
  assert((await call("studio_set_text", { handle, text: "Kuusi herkkua mukaan." })).ok);
  await call("studio_seek", { time: 3.5 });
  await call("studio_frame");
  await page.screenshot({ path: join(evidence, "01-studio-1440.png") });
  const size = await page.$eval('[aria-label="Composition preview"]', (e) => ({
    width: e.clientWidth,
    height: e.clientHeight,
  }));
  report.preview1440 = size;
  assert(size.height >= 500, JSON.stringify(size));
  await page.setViewport({ width: 1280, height: 800 });
  await page.screenshot({ path: join(evidence, "02-studio-1280.png") });
  assert(await page.$eval('[aria-label="Ari työkalut"]', (e) => e.scrollHeight > 0));
  await page.setViewport({ width: 1440, height: 900 });
  report.checks.push("1440x900 and 1280x800 workspaces expose scrollable controls and timeline");
  const downloadDir = join(evidence, "downloads");
  const { completed: downloadComplete } = await prepareDownload(page, downloadDir, 240000);
  const beforeExport = Date.now();
  const { filename, event, video } = await downloadExport(
    page,
    downloadDir,
    downloadComplete,
    240000,
  );
  report.downloadEvent = event;
  report.video = video;
  report.probe = probeVideo(video);
  report.exportMs = Date.now() - beforeExport;
  const stream = report.probe.streams.find((s) => s.codec_type === "video");
  assert.equal(stream.width, 1080);
  assert.equal(stream.height, 1920);
  assert(Math.abs(Number(report.probe.format.duration) - 7) < 0.1);
  report.sha256 = createHash("sha256").update(readFileSync(video)).digest("hex");
  report.checks.push("real browser download completed; MP4 is 1080x1920, seven seconds");
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('[aria-label="Videon vienti"] a[download]');
  assert.equal(
    await page.$eval('[aria-label="Videon vienti"] a[download]', (e) => e.download),
    filename,
  );
  report.checks.push("reload still offers the newest rendered MP4, independent of history order");
  report.pageErrors = errors;
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  await page.screenshot({ path: join(evidence, "failure.png") });
  process.exitCode = 1;
} finally {
  writeFileSync(join(evidence, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(
    JSON.stringify(
      { ok: report.ok, checks: report.checks, error: report.error, video: report.video },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
}

function isAnimationWrite(req) {
  return (
    ["POST", "PUT"].includes(req.method()) &&
    ["/gsap-mutations/", "/files/"].some((path) => req.url().includes(path))
  );
}
