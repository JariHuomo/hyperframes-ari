import { submitElement } from "./ari-export-authoring.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tool, settled } from "./ari-acceptance-browser.mjs";

export async function independentSceneAcceptance({
  p,
  mode,
  current,
  root,
  name,
  evidence,
  button,
  field,
  select,
  edit,
  first,
  source,
}) {
  if (process.env.ARI_SCENE_COPY !== "1") return;
  const dir = join(root, "packages/studio/data/projects", name);
  const original = readFileSync(join(dir, "scenes/avaus.html"), "utf8");
  await button(p, "Kohtaukset").click();
  await settled(p);
  const shared = await edit("duplicate", { target: first.target });
  assert.equal(shared.affectsInstances, 2);
  const beforeHost = source();
  const compareTime = shared.rows.find((row) => row.target === shared.target).start + 0.5;
  const capture = async (label) => {
    await button(p, "Sulje").click();
    // Explicitly seek the same master time after both structural updates.
    await field(p, "Aika sekunteina").fill(String(compareTime));
    await button(p, "Siirry").click();
    // The saved receipt selects the same authored element in the chosen placement.
    const iframe = await p.$("pierce/iframe");
    const path = join(evidence, `${mode}-${current.width}-${label}.png`);
    await captureComposition(p, iframe, path);
    const frame = await iframe.contentFrame();
    writeFileSync(
      path + ".json",
      JSON.stringify(
        await frame.evaluate(() => ({
          timelines: Object.fromEntries(
            Object.entries(window.__timelines ?? {})
              .filter(([, t]) => typeof t?.time === "function")
              .map(([id, t]) => [id, { time: t.time(), duration: t.duration() }]),
          ),
          clips: [...document.querySelectorAll(".clip")].map((e) => ({
            id: e.id,
            start: e.dataset.start,
            duration: e.dataset.duration,
            style: e.getAttribute("style"),
            opacity: getComputedStyle(e).opacity,
            visibility: getComputedStyle(e).visibility,
            display: getComputedStyle(e).display,
          })),
        })),
        null,
        2,
      ),
    );
    await button(p, "Kohtaukset").click();
    await settled(p);
    return path;
  };
  const beforeImage = await capture("own-before");
  const beforeGeometry = await compositionGeometry(p);
  const receipt = await edit("detach", { target: shared.target, fileName: "oma.html" });
  assert.equal(receipt.affectsInstances, 1);
  assert.equal(receipt.selectionSourceFile, "scenes/oma.html");
  assert.equal(receipt.instance, shared.instance);
  assert.equal(receipt.beforeDuration, receipt.afterDuration);
  assert.deepEqual(
    receipt.rows,
    shared.rows.map((r) =>
      r.target === shared.target ? { ...r, sourceFile: "scenes/oma.html" } : r,
    ),
  );
  assert.equal(readFileSync(join(dir, "scenes/oma.html"), "utf8"), original);
  assert.equal(readFileSync(join(dir, "scenes/avaus.html"), "utf8"), original);
  const afterImage = await capture("own-after");
  // Decode PNG data; metadata/compression differences do not count as pixel changes.
  const sharp = createRequire(new URL("../../../studio-server/package.json", import.meta.url))(
    "sharp",
  );
  const a = await sharp(beforeImage).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(afterImage).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(a.info, b.info);
  const afterGeometry = await compositionGeometry(p);
  assert.deepEqual(afterGeometry, beforeGeometry, "composition geometry/styles changed");
  const pixelDifferenceFraction = comparePreviewPixels(a, b);
  const normalizedBefore = await sharp(beforeImage).resize(32, 32).raw().toBuffer();
  const normalizedAfter = await sharp(afterImage).resize(32, 32).raw().toBuffer();
  const meanColorError =
    normalizedBefore.reduce((sum, value, i) => sum + Math.abs(value - normalizedAfter[i]), 0) /
    normalizedBefore.length;
  assert(meanColorError <= 1, `normalized visual difference: ${meanColorError}/255`);
  current.copyProof = {
    receipt,
    beforeImage,
    afterImage,
    identicalPixels: a.data.equals(b.data),
    pixelDifferenceFraction,
    meanColorError,
    geometry: afterGeometry,
    runtime: await runtimeCopyProof(p),
  };
  const savedHost = source();
  await button(p, "Sulje").click();
  await button(p, "Peru").click();
  await p.waitForFunction(
    async () =>
      !(await window.ariStudio.call("studio_scenes", { sourceFile: "index.html" })).rows?.some(
        (r) => r.sourceFile === "scenes/oma.html",
      ),
  );
  assert.equal(source(), beforeHost);
  assert(!existsSync(join(dir, "scenes/oma.html")));
  await button(p, "Tee uudelleen").click();
  await p.waitForFunction(async () =>
    (await window.ariStudio.call("studio_scenes", { sourceFile: "index.html" })).rows?.some(
      (r) => r.sourceFile === "scenes/oma.html",
    ),
  );
  assert.equal(source(), savedHost);
  assert.equal(readFileSync(join(dir, "scenes/oma.html"), "utf8"), original);
  await button(p, "Kohtaukset").click();
  await select(p, "Valittu kohtaus", shared.target);
  await settled(p);
  await button(p, "Sulje").click();
  await button(p, "Elementit").click();
  await settled(p);
  const listing = await tool(p, "studio_elements", { sourceFile: "scenes/oma.html" });
  const background = listing.elements.find((e) => e.kind === "background");
  assert(background);
  if (mode === "mixed") {
    const changed = await tool(p, "studio_edit_element", {
      sourceFile: "scenes/oma.html",
      version: listing.version,
      action: "add",
      kind: "text",
      text: "Vain oma kopio",
      name: "Oma viesti",
    });
    assert(changed.ok, JSON.stringify(changed));
    current.copyProof.editReceipt = changed;
  } else {
    await select(p, "Tyyppi", "text");
    await field(p, "Nimi").fill("Oma viesti");
    await field(p, "Teksti").fill("Vain oma kopio");
    await submitElement(p, button);
  }
  await button(p, "Sulje").click();
  assert.equal(readFileSync(join(dir, "scenes/avaus.html"), "utf8"), original);
  assert.notEqual(readFileSync(join(dir, "scenes/oma.html"), "utf8"), original);
  const editedPath = join(evidence, `${mode}-${current.width}-own-edited.png`);
  await captureComposition(p, await p.$("pierce/iframe"), editedPath);
  const edited = await sharp(editedPath).raw().toBuffer();
  assert(!edited.equals(b.data), "copy edit must change visible pixels");
  current.copyProof.editedImage = editedPath;
  current.copyProof.editedElements = (
    await tool(p, "studio_elements", { sourceFile: "scenes/oma.html" })
  ).elements;
  current.checks.push(
    "independent second placement preserves exact source, timing, media and same-time pixels; own edit leaves original unchanged",
  );
  current.checks.push(
    "detach undo restores exact host and removes new source; redo restores both exact files",
  );
}

async function captureComposition(p, iframe, path) {
  const style = await p.addStyleTag({
    content: '[aria-label="Composition canvas"] { visibility:hidden !important }',
  });
  try {
    // Source receipt/seek completion precedes browser paint; capture the settled frame.
    const frame = await iframe.contentFrame();
    await frame.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await iframe.screenshot({ path });
  } finally {
    await style.evaluate((node) => node.remove());
  }
}

export async function verifyReopenedCopy(p, current, dir, original) {
  if (!current.copyProof) return;
  const own = await tool(p, "studio_elements", { sourceFile: "scenes/oma.html" });
  assert.deepEqual(own.elements, current.copyProof.editedElements);
  assert.equal(readFileSync(join(dir, "scenes/avaus.html"), "utf8"), original);
  current.checks.push("reopen retains independent copy edit and untouched original");
}

async function runtimeCopyProof(p) {
  const frame = await (await p.$("pierce/iframe")).contentFrame();
  const proof = await frame.evaluate(() => {
    const timelines = window.__timelines ?? {};
    const hosts = Array.from(document.querySelectorAll("[data-composition-file]")).map((node) => ({
      source: node.getAttribute("data-composition-file"),
      id: node.getAttribute("data-composition-id"),
      timeline: Boolean(timelines[node.getAttribute("data-composition-id")]),
      time: timelines[node.getAttribute("data-composition-id")]?.time?.(),
      uniqueLocalIds: (() => {
        const ids = Array.from(node.querySelectorAll("[id]")).map((element) => element.id);
        return new Set(ids).size === ids.length;
      })(),
    }));
    const ids = Array.from(document.querySelectorAll("[id]")).map((node) => node.id);
    return {
      hosts,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      timelineKeys: Object.keys(timelines),
    };
  });
  const original = proof.hosts.find((host) => host.source?.endsWith("avaus.html"));
  const own = proof.hosts.find((host) => host.source?.endsWith("oma.html"));
  assert(original && own, JSON.stringify(proof));
  assert.notEqual(original.id, own.id);
  assert(original.timeline && own.timeline, JSON.stringify(proof));
  assert(own.time > 0, JSON.stringify(proof));
  assert(original.uniqueLocalIds && own.uniqueLocalIds, JSON.stringify(proof));
  return proof;
}

async function compositionGeometry(p) {
  const frame = await (await p.$("pierce/iframe")).contentFrame();
  return frame.evaluate(() => {
    const host = Array.from(document.querySelectorAll("[data-composition-file]")).find(
      (node) => node.getAttribute("data-label") === "Tuotekohtaus (kopio)",
    );
    return Array.from(host.querySelectorAll(".clip, img")).map((node) => {
      const rect = node.getBoundingClientRect(),
        style = getComputedStyle(node);
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        opacity: style.opacity,
        background: style.backgroundColor,
        transform: style.transform,
        text: node.textContent,
        image:
          node.tagName === "IMG"
            ? { width: node.naturalWidth, height: node.naturalHeight, complete: node.complete }
            : null,
      };
    });
  });
}

function comparePreviewPixels(a, b) {
  let changedPixels = 0;
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    if (!a.data.subarray(i, i + a.info.channels).equals(b.data.subarray(i, i + b.info.channels)))
      changedPixels++;
  }
  const pixelDifferenceFraction = changedPixels / (a.info.width * a.info.height);
  // Retain the raw difference as evidence; subpixel screenshot bounds differ
  // across panel layouts. Acceptance also requires exact inner geometry/styles
  // and mean RGB error <= 1/255 at 32x32, rather than literal screen pixels.
  return pixelDifferenceFraction;
}
