import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  acceptanceRun,
  acceptanceCases,
  tool,
  settled,
  createAcceptanceProject,
  waitComparisonReady,
} from "./ari-acceptance-browser.mjs";
const run = await acceptanceRun(
  process.env.ARI_COMPARISON_EVIDENCE ?? "screenshots/2026-09-10-b-comparison/browser-final",
  { hash: "?v=1&t=1&tab=design&rc=0", tool: "studio_compare_versions" },
);
const button = (p, name) => p.locator(`button::-p-text(${name})`);
const field = (p, name) => p.locator(`::-p-aria(${name}[role="textbox"])`);
const select = (p, name, value) => p.select(`::-p-aria(${name})`, value);
const controls = { button, field, select };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await run.run(async (bootstrap) => {
  if (process.argv[2] === "reopen") {
    await reopenComparisons();
    return;
  }
  for (const current of acceptanceCases()) {
    run.report.modes.push(current);
    await acceptanceCase(bootstrap, current);
  }
});

async function addComparisonElement(p, mode, current, element) {
  if (mode === "mixed") {
    const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
    const receipt = await tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: listing.version,
      action: "add",
      ...element,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    current.receipts.push(receipt);
    return;
  }
  await select(p, "Tyyppi", element.kind);
  await field(p, "Nimi").fill(element.name);
  if (element.text) await field(p, "Teksti").fill(element.text);
  else
    await p.$eval(
      "dialog input[type=color]",
      (el, color) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, color);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      element.color,
    );
  await button(p, "Lisää elementti").click();
  await settled(p);
}

async function acceptanceCase(bootstrap, current) {
  const { mode, width, height } = current;
  let p = await run.pageFor(bootstrap, width, height);
  const name = `b-compare-${mode}-${width}-${Date.now()}`;
  await createAcceptanceProject(p, name, mode, controls, current.receipts);
  const source = () =>
    readFileSync(join(run.root, "packages/studio/data/projects", name, "index.html"));
  const initial = source();
  await button(p, "Versiot / vertailu").click();
  await settled(p);
  await field(p, "Version nimi").fill("Ennen");
  await button(p, "Tallenna tarkistusversio").click();
  await settled(p);
  current.receipts.push(await p.evaluate(() => window.ariStudio.getSnapshot().result));
  const first = (await tool(p, "studio_versions")).versions.at(-1);
  await button(p, "Sulje vertailu").click();
  await button(p, "Elementit").click();
  await settled(p);
  await addComparisonElement(p, mode, current, {
    kind: "background",
    name: "Sininen tausta",
    color: "#a8d8eb",
  });
  await addComparisonElement(p, mode, current, {
    kind: "text",
    name: "Vertailun otsikko",
    text: "Uusi hyvä hetki",
  });
  await button(p, "Sulje").click();
  const changed = source();
  assert.notEqual(digest(changed), digest(initial));
  await button(p, "Versiot / vertailu").click();
  await settled(p);
  await field(p, "Version nimi").fill("Jälkeen");
  await button(p, "Tallenna tarkistusversio").click();
  await settled(p);
  current.receipts.push(await p.evaluate(() => window.ariStudio.getSnapshot().result));
  const second = (await tool(p, "studio_versions")).versions.at(-1);
  current.projectId = name;
  current.versions = { first, second };
  if (mode === "ui-only") {
    await select(p, "Edellinen versio", first.id);
    await select(p, "Nykyinen versio", second.id);
    await button(p, "Avaa vertailu").click();
    await settled(p);
  } else {
    const receipt = await tool(p, "studio_compare_versions", {
      beforeId: first.id,
      afterId: second.id,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    current.receipts.push(receipt);
  }
  await waitComparisonReady(p);
  await p.$eval('input[aria-label="Vertailuaika"]', (el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "1");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Use the range keyboard path to guarantee React's control receives a native change.
  await p.locator('[aria-label="Vertailuaika"]').click();
  await p.keyboard.press("ArrowRight");
  await p.screenshot({ path: join(run.evidence, `${mode}-${width}-comparison.png`) });
  const frames = await p.$$("dialog iframe");
  const pixels = [];
  for (let i = 0; i < frames.length; i++) {
    const bytes = await frames[i].screenshot();
    writeFileSync(join(run.evidence, `${mode}-${width}-${i}.png`), bytes);
    pixels.push(digest(bytes));
  }
  assert.notEqual(pixels[0], pixels[1]);
  current.frameHashes = pixels;
  current.runtime = await Promise.all(
    frames.map(async (f) =>
      (await f.contentFrame()).evaluate(() => ({
        time: window.__player.getTime(),
        text: document.body.innerText,
        sandboxOrigin: location.origin,
      })),
    ),
  );
  assert.equal(current.runtime[0].time, current.runtime[1].time);
  assert(!current.runtime[0].text.includes("Uusi hyvä hetki"));
  assert(current.runtime[1].text.includes("Uusi hyvä hetki"));
  assert.equal(digest(source()), digest(changed));
  await button(p, "Toista vertailu").click();
  await p.waitForFunction(
    () => Number(document.querySelector("dialog input[type=range]").value) > 4,
  );
  await provePlayingSeek(p, frames, current);
  assert.equal(digest(source()), digest(changed));
  await button(p, "Palauta edellinen").click();
  await settled(p);
  const restored = await p.evaluate(() => window.ariStudio.getSnapshot().result);
  assert(restored.ok && restored.previewReady, JSON.stringify(restored));
  current.receipts.push(restored);
  assert.equal(digest(source()), digest(initial));
  await button(p, "Sulje vertailu").click();
  await button(p, "Peru").click();
  await p.waitForFunction(() => !document.body.innerText.includes("Tallennetaan"));
  await p.waitForFunction(async () =>
    (await window.ariStudio.call("studio_elements", { sourceFile: "index.html" })).elements.some(
      (e) => e.name === "Vertailun otsikko",
    ),
  );
  assert.equal(digest(source()), digest(changed));
  await button(p, "Tee uudelleen").click();
  await p.waitForFunction(
    async () =>
      !(await window.ariStudio.call("studio_elements", { sourceFile: "index.html" })).elements.some(
        (e) => e.name === "Vertailun otsikko",
      ),
  );
  assert.equal(digest(source()), digest(initial));
  await p.close();
  p = await run.pageFor(name, width, height);
  const reopened = await tool(p, "studio_versions");
  assert(reopened.versions.some((v) => v.id === first.id));
  assert(reopened.versions.some((v) => v.id === second.id));
  current.sourceHashes = {
    initial: digest(initial),
    changed: digest(changed),
    reopened: digest(source()),
  };
  current.checks.push(
    "named frozen versions",
    "visible pixel difference",
    "shared seek",
    "shared playback",
    "active sources unchanged by comparison",
    "restore",
    "undo",
    "redo",
    "fresh page reopen",
  );
  current.ok = true;
  await p.close();
}

async function reopenComparisons() {
  const prior = JSON.parse(
    readFileSync(
      process.env.ARI_COMPARISON_PRIOR ??
        "screenshots/2026-09-10-b-comparison/complete/report.json",
      "utf8",
    ),
  );
  for (const entry of prior.modes) {
    const p = await run.pageFor(entry.projectId, entry.width, entry.height);
    const before = await tool(p, "studio_versions");
    await button(p, "Versiot / vertailu").click();
    await settled(p);
    await select(p, "Edellinen versio", entry.versions.first.id);
    await select(p, "Nykyinen versio", entry.versions.second.id);
    await button(p, "Avaa vertailu").click();
    await settled(p);
    await waitComparisonReady(p);
    await button(p, "Säilytä muutos").click();
    const after = await tool(p, "studio_versions");
    assert.equal(before.revision, after.revision);
    // A legitimate edit while comparison is open makes its restore proposal stale.
    assert(
      (
        await tool(p, "studio_compare_versions", {
          beforeId: entry.versions.first.id,
          afterId: entry.versions.second.id,
        })
      ).ok,
    );
    const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
    assert(
      (
        await tool(p, "studio_edit_element", {
          sourceFile: "index.html",
          version: listing.version,
          action: "add",
          kind: "text",
          name: "Uudempi työ",
          text: "Säilytä tämä",
        })
      ).ok,
    );
    const newer = await tool(p, "studio_versions");
    const refused = await tool(p, "studio_comparison", { action: "restore" });
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /muuttui/);
    assert.equal((await tool(p, "studio_versions")).revision, newer.revision);
    await tool(p, "studio_comparison", { action: "keep" });
    run.report.modes.push({
      projectId: entry.projectId,
      width: entry.width,
      mode: entry.mode,
      ok: true,
      checks: [
        "fresh server and browser frozen replay",
        "keep leaves sources unchanged",
        "stale restore refuses newer edit",
      ],
      receipt: refused,
    });
    await p.close();
  }
}

async function provePlayingSeek(page, frames, current) {
  const runtimes = await Promise.all(frames.map((frame) => frame.contentFrame()));
  const read = () =>
    Promise.all(runtimes.map((frame) => frame.evaluate(() => window.__player.getTime())));
  const receipt = await tool(page, "studio_comparison", { action: "seek", time: 1.2 });
  assert(receipt.ok, JSON.stringify(receipt));
  current.receipts.push(receipt);
  await new Promise((resolve) => setTimeout(resolve, 250));
  current.seekInitialRuntime = await read();
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    samples.push(await read());
  }
  assertSeekSamples(samples);
  assert((await tool(page, "studio_comparison", { action: "play" })).ok);
  await runtimes[0].waitForFunction(() => window.__player.getTime() > 1.4);
  assert((await tool(page, "studio_comparison", { action: "pause" })).ok);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const resumed = await read();
  for (const time of resumed) assert(time > 1.2 && time < 3, JSON.stringify(resumed));
  assert(Math.abs(resumed[0] - resumed[1]) < 0.001);
  current.playingSeek = { requested: 1.2, samples, resumed };
  current.checks.push(
    "agent seek during playback remains on both runtime clocks; resume starts there",
  );
}

function assertSeekSamples(samples) {
  for (const sample of samples)
    for (const time of sample) assert(Math.abs(time - 1.2) < 0.001, JSON.stringify(samples));
}
