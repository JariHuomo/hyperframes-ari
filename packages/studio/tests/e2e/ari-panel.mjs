import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  acceptanceRun,
  acceptanceCases,
  tool,
  settled,
  createAcceptanceProject,
  editSceneWithCommand,
  typeIntoInput,
} from "./ari-acceptance-browser.mjs";
const run = await acceptanceRun(
  process.env.ARI_PANEL_EVIDENCE ?? "screenshots/2026-09-10-c-panel/browser",
  { hash: "?v=1&t=0&tab=design&rc=0", selectionDebug: true, tool: "studio_compare_versions" },
);
function button(p, name) {
  return p.locator(`button::-p-text(${name})`);
}
const field = (p, name) => ({
  fill: async (value) => {
    if (!name.includes(" · Kohtauksessa") && !name.includes("kesto (s)")) {
      await p.locator(`::-p-aria(${name}[role="textbox"])`).fill(value);
      return;
    }
    const input = await p.waitForSelector(`::-p-aria(${name}[role="textbox"])`);
    await typeIntoInput(p, input, value);
  },
});
const select = (p, name, value) => p.select(`::-p-aria(${name})`, value);
const tab = (p, name) => p.locator(`button[role=tab]::-p-text(${name})`).click();
const controls = { field, select, button };
async function saved(p, name) {
  console.log("waiting receipt", name);
  await p.waitForFunction((name) => window.panelReceipts?.some((r) => r.tool === name), {}, name);
  const r = await p.evaluate((name) => {
    const index = window.panelReceipts.findIndex((r) => r.tool === name);
    return window.panelReceipts.splice(index, 1)[0].result;
  }, name);
  assert(r.ok, JSON.stringify(r));
  console.log("saved", name);
  return r;
}
async function sceneEdit(p, current, action, extra) {
  const args = { sourceFile: "index.html", action, ...extra };
  if (current.mode === "mixed") return editSceneWithCommand(p, args);
  await button(p, "Kohtaukset").click();
  await settled(p);
  await fillSceneFields(p, action, extra);
  await button(p, action === "add" ? "Lisää kohtaus" : "Kopioi kohtaus").click();
  await settled(p);
  await button(p, "Tallenna kohtausmuutos").click();
  const receipt = await saved(p, "studio_edit_scene");
  await button(p, "Sulje").click();
  return receipt;
}
async function checkpoint(p, name) {
  await button(p, "Versiot / vertailu").click();
  await settled(p);
  await field(p, "Version nimi").fill(name);
  await button(p, "Tallenna tarkistusversio").click();
  const receipt = await saved(p, "studio_save_version");
  await button(p, "Sulje vertailu").click();
  return receipt.version;
}
await run.run(async (bootstrap) => {
  for (const current of acceptanceCases()) {
    run.report.modes.push(current);
    const p = await run.pageFor(bootstrap, current.width, current.height);
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    const name = `c-panel-${current.mode}-${current.width}-${Date.now()}`;
    current.project = name;
    await createAcceptanceProject(p, name, current.mode, controls, current.receipts);
    await p.evaluate(() => {
      window.panelReceipts = [];
      window.ariStudio.subscribe(() => {
        const r = window.ariStudio.getSnapshot();
        if (r?.state === "done") window.panelReceipts.push(r);
      });
    });
    const first = await sceneEdit(p, current, "add", {
      name: "Otsikkokohtaus",
      fileName: "otsikko.html",
      duration: 2,
    });
    const second = await sceneEdit(p, current, "duplicate", { target: first.target });
    current.receipts.push(first, second);
    await button(p, "Elementit").click();
    await settled(p);
    await select(p, "Tyyppi", "text");
    await field(p, "Nimi").fill("Otsikko");
    await field(p, "Teksti").fill("Alkuperäinen otsikko");
    await button(p, "Lisää elementti").click();
    await saved(p, "studio_edit_element");
    await button(p, "Sulje").click();
    const look = await tool(p, "studio_look");
    const scene = look.scenes.find((s) => s.sourceFile === "scenes/otsikko.html");
    assert.equal(scene.instances.length, 2);
    const instance = scene.instances[1].hostId;
    await field(p, "Aika sekunteina").fill(
      String(second.rows.find((row) => row.hostId === instance).start).replace(".", ","),
    );
    await button(p, "Siirry").click();
    const elements = await tool(p, "studio_elements", { sourceFile: scene.sourceFile });
    current.elements = elements.elements;
    const headline = elements.elements.find((e) => e.kind === "text");
    assert(headline, JSON.stringify(elements));
    await chooseHeadline(p, current.mode, headline, instance, look, scene);
    await tab(p, "Liike");
    await p.locator("summary::-p-text(Lisää uusi liike)").click();
    await field(p, "Uusi liike · Kohtauksessa (s)").fill("0,1");
    await field(p, "Uusi liike kesto (s)").fill("0,6");
    await button(p, "Lisää liike").click();
    current.receipts.push(await saved(p, "studio_add_animation"));
    const beforeVersion = await checkpoint(p, "Ennen paneelimuutosta");
    await tab(p, "Teksti");
    await field(p, "Mainosteksti").fill("Hyvä hetki alkaa tästä.");
    await button(p, "Tallenna teksti").click();
    current.receipts.push(await saved(p, "studio_set_text"));
    await tab(p, "Liike");
    current.beforeMotion = await tool(p, "studio_inspect");
    await field(p, "Liike 1 · Kohtauksessa (s)").fill("0,2");
    const ease = p.locator('button[aria-label="Liike 1 tuntuma"]');
    await ease.click();
    await p.locator('[data-ari-ease="sine.inOut"]').click();
    await tab(p, "Liike");
    current.geometry = await panelGeometry(p);
    for (const box of current.geometry) {
      assert(box.visible, JSON.stringify(box));
      assert.equal(box.scrollTop, 0);
    }
    await button(p, "Tallenna liike 1").click();
    current.receipts.push(await saved(p, "studio_update_animation"));
    current.afterGeometry = await panelGeometry(p);
    assert.equal(
      current.geometry.find((b) => b.name === "Tallenna liike 1").y,
      current.afterGeometry.find((b) => b.name === "Tallenna liike 1").y,
    );
    const selected = await tool(p, "studio_look");
    assert.equal(selected.selection.handle, headline.handle);
    assert.equal(selected.scenes.find((s) => s.sourceFile === scene.sourceFile).instance, instance);
    current.selections.push(selected.selection);
    await p.screenshot({ path: join(run.evidence, `${current.mode}-${current.width}-motion.png`) });
    current.checks.push(
      "created shared scenes through assigned authoring path",
      "second instance preserved across text and motion saves",
      "comma timing and ease saved",
      "core controls inside viewport without scrolling",
      "save button position stable",
    );
    const sourcePath = join(run.root, "packages/studio/data/projects", name, scene.sourceFile);
    const after = readFileSync(sourcePath, "utf8");
    await field(p, "Liike 1 · Kohtauksessa (s)").fill("virhe");
    await button(p, "Tallenna liike 1").click();
    await p.waitForSelector("[role=alert]");
    assert.equal(readFileSync(sourcePath, "utf8"), after);
    await field(p, "Liike 1 · Kohtauksessa (s)").fill("0,2");
    await button(p, "Tallenna liike 1").click();
    await saved(p, "studio_update_animation");
    await button(p, "Peru").click();
    await p.waitForFunction(() => !document.body.textContent.includes("Esikatselu latautuu…"));
    await waitSource(sourcePath, (text) => text !== after);
    await button(p, "Tee uudelleen").click();
    await p.waitForFunction(() => !document.body.textContent.includes("Esikatselu latautuu…"));
    await waitSource(sourcePath, (text) => text === after);
    await p.waitForFunction(
      async (handle) => (await window.ariStudio.call("studio_look")).selection?.handle === handle,
      {},
      headline.handle,
    );
    const afterHistory = await tool(p, "studio_look");
    assert.equal(
      afterHistory.scenes.find((s) => s.sourceFile === scene.sourceFile).instance,
      instance,
    );
    current.selections.push(afterHistory.selection);
    assert.equal(readFileSync(sourcePath, "utf8"), after);
    current.checks.push(
      "invalid number refuses without writing; correction works",
      "undo and redo preserve saved bytes",
    );
    const afterVersion = await checkpoint(p, "Jälkeen paneelimuutoksen");
    await tab(p, "Tarkistus");
    await button(p, "Vertaa muutosta").click();
    await settled(p);
    await compareVersions(p, current, beforeVersion, afterVersion);
    assert.equal(readFileSync(sourcePath, "utf8"), after);
    current.checks.push(
      "real frozen versions show changed text at the same time without source writes",
    );
    await p.screenshot({ path: join(run.evidence, `${current.mode}-${current.width}-review.png`) });
    await button(p, "Sulje vertailu").click();
    await (await p.$("#ari-section-3")).focus();
    await p.keyboard.press("Home");
    assert.equal(await p.evaluate(() => document.activeElement.id), "ari-section-0");
    await p.keyboard.press("ArrowRight");
    assert.equal(await p.evaluate(() => document.activeElement.id), "ari-section-1");
    current.checks.push("keyboard section navigation with visible focus");
    await button(p, "Elementit").click();
    await settled(p);
    await p.locator("dialog button::-p-text(Poista)").click();
    current.receipts.push(await saved(p, "studio_edit_element"));
    await button(p, "Sulje").click();
    assert.equal((await tool(p, "studio_look")).selection, null);
    current.checks.push(
      "deleting the selected element clears selection without choosing a replacement",
    );
    current.ok = true;
    await p.close();
  }
});
async function panelGeometry(p) {
  return p.evaluate(() => {
    const container = document.querySelector('[data-testid="ari-command-panel"]');
    const boundsRect = container.getBoundingClientRect();
    const names = [
      "Liike 1 · Kohtauksessa (s)",
      "Liike 1 kesto (s)",
      "Liike 1 tuntuma",
      "Tallenna liike 1",
    ];
    return names.map((name) => {
      const el = [
        ...document.querySelectorAll(
          '[data-testid="ari-edit-panel"] input, [data-testid="ari-edit-panel"] button',
        ),
      ].find((e) => e.getAttribute("aria-label") === name || e.textContent.trim() === name);
      const r = el.getBoundingClientRect();
      const bounds = [
        r.y >= boundsRect.y,
        r.bottom <= boundsRect.bottom,
        r.x >= 0,
        r.right <= innerWidth,
        el.checkVisibility(),
      ];
      return {
        name,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        visible: bounds.every(Boolean),
        scrollTop: container.scrollTop,
      };
    });
  });
}

async function fillSceneFields(p, action, extra) {
  if (extra.target) await select(p, "Valittu kohtaus", extra.target);
  if (action === "add") {
    await field(p, "Kohtauksen nimi").fill(extra.name);
    await field(p, "Uuden kohtauksen tiedostonimi").fill(extra.fileName);
    await field(p, "Uuden kohtauksen kesto (s)").fill(String(extra.duration));
  }
}

async function chooseHeadline(p, mode, headline, instance, look, scene) {
  if (mode === "mixed")
    assert((await tool(p, "studio_select", { handle: headline.handle, instance })).ok);
  else {
    const label = `${look.elements.find((e) => e.handle === headline.handle).label} · ${scene.instances[1].label}`;
    await button(p, label).click();
  }
}

async function waitSource(path, check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check(readFileSync(path, "utf8"))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("source did not reach the expected saved state");
}

async function compareVersions(p, current, before, after) {
  await select(p, "Edellinen versio", before.id);
  await select(p, "Nykyinen versio", after.id);
  await button(p, "Avaa vertailu").click();
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll("dialog figure p")].filter((e) => e.textContent === "Valmis")
        .length === 2,
  );
  const slider = await p.$('[aria-label="Vertailuaika"]');
  await slider.focus();
  await p.keyboard.press("End");
  // The shared native range is 0.01 seconds; seek back to 9.5s with keys.
  for (let frame = 0; frame < 150; frame++) await p.keyboard.press("ArrowLeft");
  const frames = await p.$$("dialog iframe");
  current.comparison = [];
  for (const [index, iframe] of frames.entries()) {
    const runtime = await iframe.contentFrame();
    await runtime.waitForFunction(() => Math.abs(window.__player.getTime() - 9.5) < 0.02);
    const state = await runtime.evaluate(() => ({
      time: window.__player.getTime(),
      text: document.body.innerText,
    }));
    current.comparison.push(state);
    await iframe.screenshot({
      path: join(run.evidence, `${current.mode}-${current.width}-version-${index}.png`),
    });
  }
  assert(current.comparison[0].text.includes("Alkuperäinen otsikko"));
  assert(current.comparison[1].text.includes("Hyvä hetki alkaa tästä."));
  assert.equal(current.comparison[0].time, current.comparison[1].time);
}
