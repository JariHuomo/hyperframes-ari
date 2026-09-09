#!/usr/bin/env node
/**
 * Sprint item U2: the browser UAT for curves and nested-scene time.
 *
 * The same acceptance flow twice, against a throwaway copy of the
 * `rajamarket-scenes` fixture:
 *
 *   mixed    (default)      bridge calls and clicks, headless
 *   ui-only  (ARI_UI_ONLY=1) every step through visible controls and typed
 *                            fields; no `window.ariStudio.call` drives anything
 *
 * Both modes must leave `scenes/headline-card.html` and `scenes/pack-grid.html`
 * byte-identical — that is the real claim: the script surface and the buttons
 * are one editor, not two. The report records the sha256 of each scene file and
 * the ui-only run compares them against the mixed run's report.
 *
 * The proof that the second headline instance runs 1.5x faster is measured out
 * of the exported MP4, not asserted from the manifest: the scene's entrance is
 * linear, so the headline's top edge in a frame reads back scene time (the same
 * arithmetic as examples/rajamarket-scenes/evidence/measure-headline.py).
 *
 * No provider calls. 0 USD.
 */
import assert from "node:assert/strict";
import { mkdirSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";

const root = resolve(import.meta.dirname, "../../../..");
const fixtureDir = join(root, "examples/rajamarket-scenes");
const project = "rajamarket-scenes-e2e";
const dir = join(root, "examples", project);
const port = Number(process.env.ARI_SCENES_PORT || 3083);
const uiOnly = process.env.ARI_UI_ONLY === "1";
const headed = process.env.ARI_HEADED === "1";
const mode = uiOnly ? "ui-only" : "mixed";
const uatRoot = join(root, "screenshots/2026-09-09-scenes-curves/uat");
const evidence = join(uatRoot, mode);
const origin = `http://127.0.0.1:${port}`;

// --- the fixture ------------------------------------------------------------
// examples/* is gitignored, so a fresh clone has no fixture. Say so plainly
// rather than failing later with a missing selector.
if (!existsSync(join(fixtureDir, "index.html")) || !existsSync(join(fixtureDir, "scenes"))) {
  throw new Error(
    `Fixture puuttuu: ${fixtureDir}\n` +
      "examples/* on gitignoressa, joten rajamarket-scenes ei tule mukana kloonissa.\n" +
      "Luo se sprintin kohdan U1 mukaan (examples/rajamarket-scenes/README.md).",
  );
}
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const file of ["index.html", "hyperframes.json"])
  cpSync(join(fixtureDir, file), join(dir, file));
for (const folder of ["scenes", "assets"])
  cpSync(join(fixtureDir, folder), join(dir, folder), { recursive: true });
mkdirSync(evidence, { recursive: true });

const headlineScene = join(dir, "scenes/headline-card.html");
const packScene = join(dir, "scenes/pack-grid.html");
const masterFile = join(dir, "index.html");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// --- the server -------------------------------------------------------------
// The launcher tolerates an occupied port, and a stale server holding an older
// project has produced a false failure before. Clear the port first.
function portOwners() {
  const found = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });
  return (found.stdout || "")
    .split("\n")
    .map((line) => Number(line))
    .filter(Boolean);
}
for (const pid of portOwners()) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}
for (let attempt = 0; attempt < 40 && portOwners().length > 0; attempt++) {
  spawnSync("sleep", ["0.25"]);
}
if (portOwners().length > 0) throw new Error(`Portti ${port} ei vapautunut.`);

const startup = spawnSync(
  process.execPath,
  ["scripts/ari-studio.mjs", "--project", dir, "--port", String(port), "--background"],
  { cwd: root, encoding: "utf8" },
);
if (startup.status !== 0) throw new Error(startup.stderr || startup.stdout);
const serverPid = Number(/PID (\d+)/.exec(startup.stdout)?.[1] ?? 0);

const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: !headed,
  devtools: false,
  args: ["--no-first-run"],
});
const page = await browser.newPage();
page.setDefaultTimeout(90000);
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = {
  ok: false,
  mode,
  port,
  project,
  checks: [],
  receipts: [],
  providerSpendUsd: 0,
};

// --- helpers ----------------------------------------------------------------
/** Bridge call. Refused in ui-only mode: that mode drives only through the UI. */
const bridge = (name, input = {}) => {
  if (uiOnly) throw new Error(`ui-only mode may not call ${name} through the bridge`);
  return page.evaluate((n, i) => window.ariStudio.call(n, i), name, input);
};
/** Passive read of the last receipt. Allowed in both modes: it drives nothing. */
const snapshot = () => page.evaluate(() => window.ariStudio.getSnapshot());
const button = (name) => page.locator(`button::-p-text(${name})`);
const fill = (label, value) => page.locator(`[aria-label="${label}"]`).fill(value);

/** Wait for a receipt NEWER than `minId`. Two writes of the same tool in a row
 * (a curve dragged, then typed) otherwise resolve on the first one's receipt and
 * the file is read before the second write has landed. */
async function settled(tool, minId = 0) {
  await page.waitForFunction(
    (t, m) => {
      const s = window.ariStudio?.getSnapshot();
      return s?.state === "done" && s.tool === t && s.id > m;
    },
    { polling: 100 },
    tool,
    minId,
  );
  const s = await snapshot();
  report.receipts.push({ step: report.checks.length, ...s });
  return s.result;
}
/** Do something in the UI and settle on the receipt that action produced. */
async function act(tool, action) {
  const before = (await snapshot())?.id ?? 0;
  await action();
  return settled(tool, before);
}

/** Every completed receipt, whoever started it — so "exactly one write" is
 * countable in both modes. Re-attached after every navigation. */
async function watchReceipts() {
  await page.evaluate(() => {
    const api = window.ariStudio;
    window.__ariLog = [];
    api.__ariLogged = true;
    api.subscribe(() => {
      const s = api.getSnapshot();
      if (s && s.state === "done")
        window.__ariLog.push({ id: s.id, tool: s.tool, result: s.result });
    });
  });
}
async function receiptsSince(mark, tool) {
  const live = await page.evaluate(() => window.ariStudio?.__ariLogged === true);
  assert.equal(live, true, "the receipt log lost its bridge; counts would be wrong");
  const log = await page.evaluate(() => window.__ariLog);
  return log.slice(mark).filter((entry) => entry.tool === tool);
}
const logLength = () => page.evaluate(() => window.__ariLog.length);

/** Click a layer row by its exact label; `nth` picks between the rows a scene
 * hosted twice produces. Real mouse click, so it works in ui-only mode too. */
async function clickLayer(label, nth = 0) {
  const rows = await page.$$('[aria-label="Tasot"] button');
  const hits = [];
  for (const row of rows) {
    const own = await row.evaluate((element) => element.querySelector("span")?.textContent?.trim());
    if (own === label) hits.push(row);
  }
  assert(hits[nth], `no layer row ${nth} labelled ${label}`);
  return act("studio_select", () => hits[nth].click());
}

/** Real typing into a field inside one motion's own panel: `pack-1` already
 * carries the fixture's own entrance, so "Liike 1" is not the motion this run
 * added and every per-motion control has to be scoped. */
async function typeInto(scope, label, value) {
  const field = await scope.$(`[aria-label="${label}"]`);
  assert(field, `no field ${label} in scope`);
  // Select the whole value with the keyboard before typing. `clickCount: 3` does
  // not select inside these narrow controlled inputs, and typing then INSERTS —
  // "0.16" plus "0,25" became "0.10,256", which the ease contract rejects.
  await field.click();
  await field.focus();
  await page.keyboard.press("End");
  for (let guard = 0; guard < 24; guard++) {
    if ((await field.evaluate((element) => element.value)) === "") break;
    await page.keyboard.press("Backspace");
  }
  await field.type(String(value).replace(".", ","));
  const written = await field.evaluate((element) => element.value);
  assert.equal(written, String(value).replace(".", ","), `${label} did not take the typed value`);
}
async function clickIn(scope, label) {
  for (const candidate of await scope.$$("button")) {
    const own = await candidate.evaluate((element) => element.textContent?.trim());
    if (own === label) {
      await candidate.click();
      return;
    }
  }
  throw new Error(`no button ${label} in scope`);
}
/** Which "Liike N" panel holds the motion that starts at `position`. */
async function motionIndexAt(position) {
  const index = await page.evaluate((wanted) => {
    const fields = [...document.querySelectorAll("input[aria-label]")].filter((input) =>
      /^Liike \d+ alkaa( kohtauksessa)? \(s\)$/.test(input.getAttribute("aria-label")),
    );
    const hit = fields.find((input) => Number(input.value.replace(",", ".")) === wanted);
    return hit ? Number(/Liike (\d+)/.exec(hit.getAttribute("aria-label"))[1]) : 0;
  }, position);
  assert(index > 0, `no motion form starts at ${position} s`);
  return index;
}

/** Open a disclosure by clicking its summary, the way a human does. */
async function openDetails(label) {
  for (const summary of await page.$$("summary")) {
    const own = await summary.evaluate((element) => ({
      text: element.textContent ?? "",
      open: element.parentElement?.open === true,
    }));
    if (!own.text.includes(label)) continue;
    if (!own.open) await summary.click();
    return;
  }
  throw new Error(`no disclosure labelled ${label}`);
}

/** studio_look / studio_inspect without driving anything: the visible command
 * form in ui-only mode, the bridge in mixed mode. */
async function readTool(name) {
  if (!uiOnly) return bridge(name);
  await openDetails("Skriptikomennot");
  await page.select('[aria-label="Skriptitoiminto"]', name);
  return act(name, () => button("Suorita toiminto").click());
}

/**
 * The layer tree is built from the mounted preview, and on the FIRST load after
 * a cold studio server this project's twice-hosted headline scene is sometimes
 * absent from it (20 rows instead of 30) and never appears — a reload mounts it.
 * That is a product defect, recorded in `report.workspaceReloads` and in the
 * sprint report; here the run only refuses to start measuring a half-mounted
 * workspace. Nothing about the acceptance is relaxed: both placements must be
 * on the shelf before step 1 asserts anything.
 */
async function readyWorkspace() {
  report.workspaceReloads = 0;
  for (let reload = 0; reload <= 3; reload++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const look = await readTool("studio_look");
      if ((look.scenes?.length ?? 0) >= 2) return look;
      await new Promise((wait) => setTimeout(wait, 500));
    }
    if (reload === 3) break;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[aria-label="Tasot"] button');
    await watchReceipts();
    report.workspaceReloads += 1;
  }
  throw new Error("the workspace never mounted both scenes");
}

const FIXTURE = {
  headline: "scenes/headline-card.html",
  packs: "scenes/pack-grid.html",
  hostA: "headline-host-a",
  hostB: "headline-host-b",
  packHost: "pack-grid-host",
};
const PACK_MASTER = 1.2;
const PACK_DURATION = 0.6;
const HEADLINE_MASTER = 5.8;
const HEADLINE_DURATION = 0.9; // scene-local; 0,60 s of master at rate 1,5
const CURVE = { x1: 0.25, y1: 0.9, x2: 0.4, y2: 1 };
const EXACT_EASE = `custom(M0,0 C${CURVE.x1},${CURVE.y1} ${CURVE.x2},${CURVE.y2} 1,1)`;

try {
  await page.goto(`${origin}/#project/${project}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label="Tasot"] button');
  await watchReceipts();

  // 1. The scene shelf: two placements of one headline file, one of the packs.
  const look = await readyWorkspace();
  const scenes = Object.fromEntries(look.scenes.map((scene) => [scene.sourceFile, scene]));
  const headlineScenes = scenes[FIXTURE.headline];
  const packScenes = scenes[FIXTURE.packs];
  assert.equal(headlineScenes.instances.length, 2, JSON.stringify(headlineScenes));
  assert.equal(headlineScenes.instance, null, "two placements must not auto-select one");
  assert.equal(packScenes.instances.length, 1);
  const packHostStart = packScenes.instances[0].masterStart;
  const hostB = headlineScenes.instances.find((one) => one.hostId === FIXTURE.hostB);
  assert.equal(hostB.playbackRate, 1.5);
  report.scenes = look.scenes;
  report.checks.push("studio_look lists both headline placements and refuses to default to one");

  // 2. A motion added at MASTER time on an element inside a scene, from the
  //    master view — the scene is never opened.
  const packSelection = await clickLayer("Pack1");
  const packBefore = readFileSync(packScene, "utf8");
  let added;
  if (uiOnly) {
    await openDetails("Lisää uusi liike");
    await fill("Uusi liike alkaa pääajassa (s)", String(PACK_MASTER).replace(".", ","));
    await fill("Uusi liike kesto (s)", String(PACK_DURATION).replace(".", ","));
    added = await act("studio_add_animation", () => button("Lisää liike").click());
  } else {
    added = await bridge("studio_add_animation", {
      handle: packSelection.handle,
      method: "from",
      preset: "fade",
      position: PACK_MASTER,
      duration: PACK_DURATION,
      timeBasis: "master",
      ease: "power2.out",
    });
  }
  assert.equal(added.stage, "verified", JSON.stringify(added));
  assert.equal(added.scene.sourceFile, FIXTURE.packs);
  assert.equal(added.scene.instance, FIXTURE.packHost);
  assert.equal(added.scene.masterPosition, PACK_MASTER);
  assert.equal(added.scene.localPosition, Math.round((PACK_MASTER - packHostStart) * 1000) / 1000);
  assert.equal(added.affectsInstances, 1);
  assert.notEqual(readFileSync(packScene, "utf8"), packBefore);
  assert.equal(
    readFileSync(masterFile, "utf8"),
    readFileSync(join(fixtureDir, "index.html"), "utf8"),
  );
  report.packReceipt = added;
  report.checks.push(
    `motion added at master ${PACK_MASTER} s landed in ${FIXTURE.packs} at local ${added.scene.localPosition} s; index.html untouched`,
  );

  // 3. One completed drag on the curve = exactly one write.
  const motion = await motionIndexAt(added.scene.localPosition);
  report.motionIndex = motion;
  const panel = await page.waitForSelector(`[aria-label="Liike ${motion} käyrä"]`);
  await panel.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const mark = await logLength();
  const mark0 = (await snapshot())?.id ?? 0;
  const knob = await panel.waitForSelector(
    '[role="slider"][aria-label="First bezier control point"]',
  );
  const box = await knob.boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step++) await page.mouse.move(from.x + step * 4, from.y + step * 3);
  await page.mouse.up();
  const dragged = await settled("studio_update_animation", mark0);
  assert.equal(dragged.stage, "verified", JSON.stringify(dragged));
  assert.equal(dragged.easeCurve.kind, "custom", JSON.stringify(dragged.easeCurve));
  const writes = await receiptsSince(mark, "studio_update_animation");
  assert.equal(writes.length, 1, `one drag wrote ${writes.length} times`);
  report.dragReceipt = dragged;
  report.checks.push("one pointer drag on the ease graph produced exactly one verified write");

  // 4. The same curve as four numbers, so both modes end at the same bytes.
  // The whole motion form is keyed on its ease, so the accepted drag remounted
  // the panel captured above; take a fresh one.
  const numbersPanel = await page.waitForSelector(`[aria-label="Liike ${motion} käyrä"]`);
  await numbersPanel.evaluate((element) => element.scrollIntoView({ block: "center" }));
  for (const [label, value] of [
    ["X1", CURVE.x1],
    ["Y1", CURVE.y1],
    ["X2", CURVE.x2],
    ["Y2", CURVE.y2],
  ])
    await typeInto(numbersPanel, label, value);
  const exact = await act("studio_update_animation", () =>
    clickIn(numbersPanel, "Tallenna ohjauspisteet"),
  );
  assert.equal(exact.stage, "verified", JSON.stringify(exact));
  for (
    let attempt = 0;
    attempt < 40 && !readFileSync(packScene, "utf8").includes(EXACT_EASE);
    attempt++
  )
    spawnSync("sleep", ["0.25"]);
  assert(readFileSync(packScene, "utf8").includes(EXACT_EASE), "the exact curve is not in source");
  report.checks.push("the four control-point fields wrote the exact curve read back from source");

  // 5. studio_inspect returns the curve's control points, not just its name.
  const inspected = await readTool("studio_inspect");
  const curved = inspected.animations.find(
    (one) => one.easeCurve?.kind === "custom" && one.position === added.scene.localPosition,
  );
  assert(curved, JSON.stringify(inspected.animations));
  assert.deepEqual(curved.easeCurve.points, [CURVE.x1, CURVE.y1, CURVE.x2, CURVE.y2]);
  report.inspected = curved;
  report.checks.push("studio_inspect returns easeCurve.points for the dragged curve");

  // 6. The headline has two placements: an add without one is refused BEFORE
  //    any write.
  await clickLayer("Hc Offer");
  const headlineBefore = readFileSync(headlineScene, "utf8");
  const selection = await page.evaluate(
    () => document.querySelector('[data-testid="ari-target"]')?.textContent,
  );
  assert.equal(selection, "Hc Offer");
  let refused;
  if (uiOnly) {
    await openDetails("Lisää uusi liike");
    await fill("Uusi liike alkaa (s)", "0,3");
    await fill("Uusi liike kesto (s)", String(HEADLINE_DURATION).replace(".", ","));
    refused = await act("studio_add_animation", () => button("Lisää liike").click());
  } else {
    refused = await bridge("studio_add_animation", {
      handle: (await bridge("studio_look")).selection.handle,
      method: "from",
      preset: "fade",
      position: HEADLINE_MASTER,
      duration: HEADLINE_DURATION,
      timeBasis: "master",
      ease: "power2.out",
    });
  }
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.equal(refused.kind, "invalid", JSON.stringify(refused));
  assert(refused.hint?.includes(FIXTURE.hostB), JSON.stringify(refused));
  assert.equal(readFileSync(headlineScene, "utf8"), headlineBefore, "a refusal wrote to source");
  report.refusal = refused;
  report.checks.push(
    "an add on a twice-hosted scene without an instance is refused before any write",
  );

  // 7. Choose placement 2 and add at master 5,8 s.
  let headlineAdd;
  if (uiOnly) {
    await page.select('[aria-label="Esiintymä"]', FIXTURE.hostB);
    await page.waitForSelector('[aria-label="Uusi liike alkaa pääajassa (s)"]');
    await fill("Uusi liike alkaa pääajassa (s)", String(HEADLINE_MASTER).replace(".", ","));
    await fill("Uusi liike kesto (s)", String(HEADLINE_DURATION).replace(".", ","));
    headlineAdd = await act("studio_add_animation", () => button("Lisää liike").click());
  } else {
    const handle = (await bridge("studio_look")).selection.handle;
    // The panel choice is UI state that no tool reads on its own (S2), so the
    // write names the placement explicitly as well as the picker showing it.
    await bridge("studio_select", { handle, instance: FIXTURE.hostB });
    headlineAdd = await bridge("studio_add_animation", {
      handle,
      method: "from",
      preset: "fade",
      position: HEADLINE_MASTER,
      duration: HEADLINE_DURATION,
      timeBasis: "master",
      instance: FIXTURE.hostB,
      ease: "power2.out",
    });
  }
  assert.equal(headlineAdd.stage, "verified", JSON.stringify(headlineAdd));
  assert.equal(headlineAdd.scene.instance, FIXTURE.hostB);
  assert.equal(headlineAdd.scene.masterPosition, HEADLINE_MASTER);
  assert.equal(headlineAdd.scene.localPosition, 0.3);
  assert.equal(headlineAdd.scene.playbackRate, 1.5);
  assert.equal(headlineAdd.affectsInstances, 2);
  report.headlineReceipt = headlineAdd;
  report.checks.push(
    "master 5,8 s on placement 2 wrote scene-local 0,3 s and reported both clocks",
  );

  // 8. The bar on the MASTER rail, with the retiming named.
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="Kevyt aikajana"]')
      ?.innerText.includes("pääaika 5.80–6.40 s"),
  );
  const badge = await page.$eval(
    '[aria-label="Liike 1 toistonopeus ×1,5"]',
    (element) => element.textContent,
  );
  assert.equal(badge, "×1,5");
  await page.screenshot({ path: join(evidence, "01-master-timeline-1440.png") });
  report.checks.push("the nested motion draws at 5,80–6,40 s on the master rail with a ×1,5 badge");

  // 9. Undo, redo, reload — the scene file says the same thing throughout.
  const afterAdd = readFileSync(headlineScene, "utf8");
  await button("Peru").click();
  for (let attempt = 0; attempt < 60 && readFileSync(headlineScene, "utf8") === afterAdd; attempt++)
    spawnSync("sleep", ["0.25"]);
  assert.notEqual(readFileSync(headlineScene, "utf8"), afterAdd, "undo did not reach source");
  await button("Tee uudelleen").click();
  for (let attempt = 0; attempt < 60 && readFileSync(headlineScene, "utf8") !== afterAdd; attempt++)
    spawnSync("sleep", ["0.25"]);
  assert.equal(readFileSync(headlineScene, "utf8"), afterAdd, "redo did not restore source");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label="Tasot"] button');
  await watchReceipts();
  assert.equal(readFileSync(headlineScene, "utf8"), afterAdd);
  report.checks.push("Peru, Tee uudelleen and a page reload leave the scene source consistent");

  // 10. Three revision-bound frames from one call, inside the motion's own span.
  await clickLayer("Pack1");
  const sampleIndex = await motionIndexAt(added.scene.localPosition);
  const samplePanel = await page.waitForSelector(`[aria-label="Liike ${sampleIndex} käyrä"]`);
  await samplePanel.evaluate((element) => element.scrollIntoView({ block: "center" }));
  let samples;
  if (uiOnly) {
    samples = await act("studio_frame", () => clickIn(samplePanel, "Ruutukuvat 25/50/75 %"));
  } else {
    const current = await bridge("studio_inspect");
    const target = current.animations.find(
      (one) => one.easeCurve?.kind === "custom" || String(one.ease ?? "").startsWith("custom("),
    );
    assert(target, JSON.stringify(current.animations));
    samples = await bridge("studio_frame", {
      animationId: target.animationId,
      samples: [0.25, 0.5, 0.75],
    });
  }
  assert.equal(samples.ok !== false, true, JSON.stringify(samples));
  assert.equal(samples.frames.length, 3);
  const revisions = new Set(samples.frames.map((frame) => frame.sourceRevision));
  assert.equal(revisions.size, 1, JSON.stringify([...revisions]));
  for (const [index, frame] of samples.frames.entries()) {
    assert(new URL(frame.url, origin).searchParams.get("revision"), "frame is not revision-bound");
    const png = await fetch(new URL(frame.url, origin));
    assert.equal(png.status, 200);
    writeFileSync(
      join(evidence, `sample-${Math.round(frame.progress * 100)}.png`),
      Buffer.from(await png.arrayBuffer()),
    );
    assert.equal(frame.progress, [0.25, 0.5, 0.75][index]);
  }
  report.samples = samples.frames;
  report.checks.push("studio_frame samples returned three revision-bound PNGs from one call");

  // 11. Both workspace sizes.
  await page.screenshot({ path: join(evidence, "02-workspace-1440.png") });
  await page.setViewport({ width: 1280, height: 800 });
  await page.screenshot({ path: join(evidence, "03-workspace-1280.png") });
  assert(await page.$eval('[aria-label="Ari työkalut"]', (element) => element.scrollHeight > 0));
  assert(await page.$eval('[aria-label="Tasot"]', (element) => element.scrollHeight > 0));
  await page.setViewport({ width: 1440, height: 900 });
  report.checks.push("1440x900 and 1280x800 both expose the layers, the dock and the timeline");

  // 12. Export through the UI download.
  const cdp = await page.createCDPSession();
  const downloadDir = join(evidence, "downloads");
  mkdirSync(downloadDir, { recursive: true });
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir,
    eventsEnabled: true,
  });
  const downloaded = new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("download timed out")), 300000);
    cdp.on("Browser.downloadProgress", (event) => {
      if (event.state === "completed") {
        clearTimeout(timer);
        done(event);
      } else if (event.state === "canceled") {
        clearTimeout(timer);
        fail(new Error("download canceled"));
      }
    });
  });
  await button("Vie video · MP4").click();
  await page.waitForSelector('[aria-label="Videon vienti"] a[download]', { timeout: 300000 });
  const filename = await page.$eval('[aria-label="Videon vienti"] a[download]', (e) => e.download);
  await page.locator('[aria-label="Videon vienti"] a[download]').click();
  report.downloadEvent = await downloaded;
  const video = join(downloadDir, filename);
  assert(existsSync(video));
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
    {
      encoding: "utf8",
    },
  );
  assert.equal(probe.status, 0, probe.stderr);
  const probed = JSON.parse(probe.stdout);
  const stream = probed.streams.find((one) => one.codec_type === "video");
  const [num, den] = stream.avg_frame_rate.split("/").map(Number);
  report.video = {
    path: video,
    width: stream.width,
    height: stream.height,
    fps: num / den,
    durationSec: Number(probed.format.duration),
    sha256: sha(video),
  };
  assert.equal(stream.width, 1080);
  assert.equal(stream.height, 1920);
  assert.equal(num / den, 30);
  assert(Math.abs(Number(probed.format.duration) - 7) < 0.1, probed.format.duration);
  report.checks.push("the UI download produced a 1080x1920 / 30 fps / 7 s MP4");

  // 13. Read the two instances' scene time back out of that MP4.
  report.rate = measureRate(video, join(evidence, "frames"));
  assert.equal(report.rate.ok, true, JSON.stringify(report.rate, null, 2));
  report.checks.push(
    "matched frames from the MP4 show placement B reaching in 0,60 s of master what A needs 0,90 s for",
  );

  report.sceneHashes = {
    "scenes/headline-card.html": sha(headlineScene),
    "scenes/pack-grid.html": sha(packScene),
  };
  const sibling = join(uatRoot, uiOnly ? "mixed" : "ui-only", "report.json");
  if (existsSync(sibling)) {
    const other = JSON.parse(readFileSync(sibling, "utf8"));
    if (other.sceneHashes) {
      report.comparedWith = { mode: other.mode, sceneHashes: other.sceneHashes };
      assert.deepEqual(
        report.sceneHashes,
        other.sceneHashes,
        "the two modes wrote different source",
      );
      report.checks.push("script+UI and UI-only runs end with byte-identical scene sources");
    }
  }

  report.pageErrors = errors;
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  report.pageErrors = errors;
  try {
    await page.screenshot({ path: join(evidence, "failure.png") });
  } catch {}
  process.exitCode = 1;
} finally {
  writeFileSync(join(evidence, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(
    JSON.stringify(
      {
        ok: report.ok,
        mode,
        checks: report.checks,
        error: report.error,
        report: join(evidence, "report.json"),
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  if (serverPid) {
    try {
      process.kill(-serverPid, "SIGTERM");
    } catch {
      try {
        process.kill(serverPid, "SIGTERM");
      } catch {}
    }
  }
}

// --- the measurement --------------------------------------------------------
/**
 * `scenes/headline-card.html` moves `.hc-headline` y 90 -> 0 over 0.9 s of SCENE
 * time with `ease: 'none'`, so a frame's headline top edge reads back scene
 * time. Same band, same background and the same opacity-independent edge
 * detection as examples/rajamarket-scenes/evidence/measure-headline.py, run on
 * raw RGB straight out of ffmpeg so no PNG decoder is needed.
 */
function measureRate(video, framesDir) {
  mkdirSync(framesDir, { recursive: true });
  // Even width and height: ffmpeg's crop rounds an odd size down on 4:2:0 video,
  // and the raw buffer then no longer matches the size we asked for. 934 keeps
  // the whole headline band; the card is 935 px wide.
  const BAND = { x: 76, y: 195, w: 934, h: 170 };
  const BG = [198, 33, 40];
  const TRAVEL = 90;
  const ENTRANCE = 0.9;
  const FPS = 30;
  const HOSTS = { a: { start: 0.12, rate: 1 }, b: { start: 5.6, rate: 1.5 } };
  // Every offset stays strictly inside the entrance: `headline-card.html` is a
  // 0,9 s composition, so past its own duration the card leaves the frame and
  // there is nothing left to measure. (The fixture README's "then held" does not
  // hold — see the sprint report.)
  const OFFSETS = [0.3, 0.45, 0.6, 0.75];
  const frameIndex = (master) => Math.round(master * FPS);

  function band(index) {
    const out = spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        video,
        "-vf",
        `select=eq(n\\,${index}),crop=${BAND.w}:${BAND.h}:${BAND.x}:${BAND.y}`,
        "-vsync",
        "0",
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ],
      { maxBuffer: 1 << 28 },
    );
    if (out.status !== 0) throw new Error(`ffmpeg failed on frame ${index}: ${out.stderr}`);
    if (out.stdout.length !== BAND.w * BAND.h * 3)
      throw new Error(`frame ${index} returned ${out.stdout.length} bytes`);
    return out.stdout;
  }
  function topEdge(index) {
    const pixels = band(index);
    let peak = 0;
    const profile = new Array(BAND.h).fill(0);
    for (let row = 0; row < BAND.h; row++) {
      let best = 0;
      const base = row * BAND.w * 3;
      for (let col = 0; col < BAND.w; col++) {
        const at = base + col * 3;
        const deviation = Math.max(
          Math.abs(pixels[at] - BG[0]),
          Math.abs(pixels[at + 1] - BG[1]),
          Math.abs(pixels[at + 2] - BG[2]),
        );
        if (deviation > best) best = deviation;
      }
      profile[row] = best;
      if (best > peak) peak = best;
    }
    // Compression noise on the flat red field sits around 15; the headline is
    // 200+. A frame with no headline must be refused, never measured.
    if (peak < 60) throw new Error(`no headline in frame ${index} (peak ${peak})`);
    const cut = peak * 0.5;
    for (let row = 0; row < BAND.h; row++) if (profile[row] >= cut) return BAND.y + row;
    throw new Error(`no headline pixels in frame ${index}`);
  }
  const tops = new Map();
  const top = (index) => {
    if (!tops.has(index)) tops.set(index, topEdge(index));
    return tops.get(index);
  };
  function keep(index, name) {
    spawnSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      video,
      "-vf",
      `select=eq(n\\,${index})`,
      "-vsync",
      "0",
      "-frames:v",
      "1",
      join(framesDir, name),
    ]);
  }
  const local = (host, master) =>
    Math.min(ENTRANCE, Math.max(0, (master - HOSTS[host].start) * HOSTS[host].rate));

  const samples = [];
  const pairs = [];
  for (const offset of OFFSETS) {
    const masterA = HOSTS.a.start + offset;
    const masterB = HOSTS.b.start + offset / HOSTS.b.rate;
    const indexA = frameIndex(masterA);
    const indexB = frameIndex(masterB);
    keep(indexA, `a-scene-${offset.toFixed(2)}.png`);
    keep(indexB, `b-scene-${offset.toFixed(2)}.png`);
    for (const [host, index] of [
      ["a", indexA],
      ["b", indexB],
    ])
      samples.push({
        host,
        sceneOffsetSec: offset,
        frame: index,
        masterSec: Number((index / FPS).toFixed(4)),
        topPx: top(index),
        expectedLocalSec: Number(local(host, index / FPS).toFixed(4)),
      });
    pairs.push({
      sceneOffsetSec: offset,
      aFrame: indexA,
      bFrame: indexB,
      aMasterSec: Number((indexA / FPS).toFixed(4)),
      bMasterSec: Number((indexB / FPS).toFixed(4)),
      aTopPx: top(indexA),
      bTopPx: top(indexB),
      topDeltaPx: Math.abs(top(indexA) - top(indexB)),
      aMasterElapsedSec: Number((indexA / FPS - HOSTS.a.start).toFixed(4)),
      bMasterElapsedSec: Number((indexB / FPS - HOSTS.b.start).toFixed(4)),
    });
  }

  // Calibration-free: fit host A's own line top = intercept + slope x local. The
  // entrance is linear by construction, so the slope must come out at the
  // authored -TRAVEL/ENTRANCE px per second, and every other frame's local time
  // is read off that fit. A single settled reference frame was fragile — the
  // card is gone from the master after its own 0,9 s.
  const fitFrom = samples.filter((one) => one.host === "a");
  const n = fitFrom.length;
  const sx = fitFrom.reduce((total, one) => total + one.expectedLocalSec, 0);
  const sy = fitFrom.reduce((total, one) => total + one.topPx, 0);
  const sxx = fitFrom.reduce((total, one) => total + one.expectedLocalSec ** 2, 0);
  const sxy = fitFrom.reduce((total, one) => total + one.expectedLocalSec * one.topPx, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  for (const one of samples) {
    one.measuredLocalSec = Number(((one.topPx - intercept) / slope).toFixed(4));
    one.deltaSec = Number((one.measuredLocalSec - one.expectedLocalSec).toFixed(4));
  }

  // The negative control: read host B as if it played at rate 1. Every offset
  // must then DISAGREE with host A, or "1,5x" would be unfalsifiable.
  const naive = [];
  for (const offset of OFFSETS.slice(0, 3)) {
    const indexA = frameIndex(HOSTS.a.start + offset);
    const indexNaive = frameIndex(HOSTS.b.start + offset);
    keep(indexNaive, `b-naive-${offset.toFixed(2)}.png`);
    naive.push({
      sceneOffsetSec: offset,
      aFrame: indexA,
      bFrame: indexNaive,
      bMasterSec: Number((indexNaive / FPS).toFixed(4)),
      aTopPx: top(indexA),
      bTopPx: top(indexNaive),
      topDeltaPx: Math.abs(top(indexA) - top(indexNaive)),
    });
  }
  const tolerance = {
    matchedTopPx: 6,
    naiveTopPx: 10,
    localSec: 0.05,
    slopePxPerSec: 12,
    elapsedRatioSec: 2 / FPS,
  };
  return {
    fit: { slopePxPerSec: Number(slope.toFixed(2)), interceptPx: Number(intercept.toFixed(2)) },
    expectedSlopePxPerSec: -TRAVEL / ENTRANCE,
    travelPx: TRAVEL,
    entranceSec: ENTRANCE,
    tolerance,
    samples,
    matchedPairs: pairs,
    naiveRate1Control: naive,
    ok:
      Math.abs(slope + TRAVEL / ENTRANCE) <= tolerance.slopePxPerSec &&
      samples.every((one) => Math.abs(one.deltaSec) <= tolerance.localSec) &&
      pairs.every((one) => one.topDeltaPx <= tolerance.matchedTopPx) &&
      // Host A needed 1,5x the master seconds host B did to reach the same scene
      // state, within the two frames the 30 fps grid can move a sample.
      pairs.every(
        (one) => Math.abs(one.aMasterElapsedSec - 1.5 * one.bMasterElapsedSec) <= 2 / FPS,
      ) &&
      naive.every((one) => one.topDeltaPx > tolerance.naiveTopPx),
  };
}
