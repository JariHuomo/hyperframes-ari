import { addExportHeadline, addExportMotion, submitElement } from "./ari-export-authoring.mjs";
import { exportSceneAcceptance, compareSceneExports } from "./ari-scene-export.mjs";
import { independentSceneAcceptance, verifyReopenedCopy } from "./ari-scene-copy.mjs";
import { waitForSceneCount } from "./ari-acceptance-browser.mjs";
/** A3 scene structure acceptance; visible controls vs discovered tools. */
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  acceptanceRun,
  acceptanceCases,
  tool,
  settled,
  createAcceptanceProject,
  importSyntheticImage,
  typeIntoInput,
  fillTextFields,
} from "./ari-acceptance-browser.mjs";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const { root, evidence, report, pageFor, run } = await acceptanceRun(
  process.env.ARI_SCENE_STRUCTURE_EVIDENCE ?? "screenshots/2026-09-10-a3-scenes",
  { hash: "?v=1&t=0&tab=design&rc=0", tool: "studio_edit_scene" },
);
const button = (p, name) => ({
  click: async () => {
    console.log("button", name);
    await p.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent.trim().startsWith(name) && !b.matches(":disabled"),
        ),
      {},
      name,
    );
    const handle = await p.evaluateHandle(
      (name) =>
        Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim().startsWith(name) && !b.matches(":disabled"),
        ),
      name,
    );
    await handle.asElement().focus();
    await p.keyboard.press("Enter");
    await handle.dispose();
  },
});
const field = (p, name) => ({
  fill: async (value) => {
    console.log("fill", name);
    if (name !== "Aika sekunteina") {
      await p.waitForSelector("dialog:modal");
      await settled(p);
    }
    await p.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll("label")).some(
          (l) =>
            (l.textContent.trim().startsWith(name) ||
              l.querySelector("input")?.getAttribute("aria-label") === name) &&
            l.querySelector("input"),
        ),
      {},
      name,
    );
    const handle = await p.evaluateHandle(labeledControl, { name, tag: "input" });
    await handle.evaluate((e) => e.focus());
    assert(await handle.evaluate((e) => document.activeElement === e));
    await typeIntoInput(p, handle, value);
    await handle.dispose();
  },
});
async function select(p, name, value) {
  await settled(p);
  const handle = await p.evaluateHandle(labeledControl, { name, tag: "select" });
  await handle.asElement().select(value);
  await handle.dispose();
}

await run(async (bootstrapId) => {
  for (const current of acceptanceCases()) {
    const { mode, width, height } = current;
    report.modes.push(current);
    const name = `scene-ops-${mode}-${width}-${Date.now()}`;
    let p = await pageFor(bootstrapId, width, height);
    await createAcceptanceProject(p, name, mode, { button, field, select }, current.receipts);
    current.project = name;
    await addExportHeadline(p, mode, { button, field, select });
    await p.evaluate(() => {
      window.sceneReceipts = [];
      window.ariStudio.subscribe(() => {
        const r = window.ariStudio.getSnapshot();
        if (r?.state === "done" && r.tool === "studio_edit_scene")
          window.sceneReceipts.push(r.result);
      });
    });
    const list = async () => {
      const result = await tool(p, "studio_scenes", { sourceFile: "index.html" });
      assert(result.ok, JSON.stringify(result));
      return result;
    };
    const source = () =>
      readFileSync(join(root, "packages/studio/data/projects", name, "index.html"), "utf8");
    const hash = (text) => createHash("sha256").update(text).digest("hex");
    async function selected(target, deleted = false) {
      const look = await tool(p, "studio_look");
      current.selections.push({ target, deleted, selection: look.selection });
      if (deleted) assert.equal(look.selection, null);
      else
        assert(
          look.selection?.handle?.endsWith(encodeURIComponent(target)),
          JSON.stringify(look.selection),
        );
    }
    await button(p, "Kohtaukset").click();
    await settled(p);
    async function fillOperation(extra) {
      if (extra.target) {
        await select(p, "Valittu kohtaus", extra.target);
        await settled(p);
      }
      await fillTextFields(p, field, extra, {
        name: "Kohtauksen nimi",
        fileName: "Uuden kohtauksen tiedostonimi",
        duration: "Uuden kohtauksen kesto (s)",
      });
    }
    async function edit(action, extra = {}) {
      current.stage = { action, ...extra };
      console.log(mode, width, current.stage);
      const args = { sourceFile: "index.html", action, ...extra };
      const before = source();
      if (mode === "mixed") {
        const plan = await tool(p, "studio_prepare_scene", args);
        assert(plan.ok, JSON.stringify(plan));
        assert.equal(source(), before);
        current.lastPlan = plan;
        const receipt = await tool(p, "studio_edit_scene", {
          ...args,
          reviewVersion: plan.reviewVersion,
        });
        assert(receipt.ok, JSON.stringify(receipt));
        assert.equal(receipt.version, `"sha256:${hash(source())}"`);
        await button(p, "Päivitä kohtausjono").click();
        await settled(p);
      } else {
        await fillOperation(extra);
        const label = {
          add: "Lisää kohtaus",
          rename: "Nimeä kohtaus",
          duplicate: "Kopioi kohtaus",
          detach: "Tee oma kopio",
          delete: "Poista kohtaus",
          earlier: "Siirrä aiemmaksi",
          later: "Siirrä myöhemmäksi",
        }[action];
        await button(p, label).click();
        await settled(p);
        assert.equal(await p.$("dialog [role=alert]"), null);
        await p.waitForSelector('section[aria-label="Kohtausmuutoksen vaikutus"]');
        assert.equal(source(), before);
        await p.screenshot({ path: join(evidence, `${mode}-${width}-${action}-impact.png`) });
        await button(p, "Tallenna kohtausmuutos").click();
        await settled(p);
        assert.equal(await p.$("dialog [role=alert]"), null);
      }
      const receipts = await p.evaluate(() => window.sceneReceipts);
      const receipt = receipts.at(-1);
      assert(receipt?.ok, JSON.stringify(receipt));
      assert.equal(receipt.version, `"sha256:${hash(source())}"`);
      assert.equal(receipt.previewReady, true, JSON.stringify(receipt));
      await selected(receipt.selectionTarget, receipt.deleted);
      return receipt;
    }
    const first = await edit("add", { name: "Avaus", fileName: "avaus.html", duration: 2 });
    assert.equal(first.afterDuration, 9);
    assert.equal((await list()).rows.length, 1);
    current.checks.push(
      "new scene and host saved together through assigned path; preview target and saved version agree",
    );
    const createdHost = source();
    const scenePath = join(root, "packages/studio/data/projects", name, "scenes/avaus.html");
    const createdChild = readFileSync(scenePath, "utf8");
    await button(p, "Sulje").click();
    await button(p, "Peru").click();
    await waitForSceneCount(p, 0);
    assert.equal(existsSync(scenePath), false);
    await button(p, "Tee uudelleen").click();
    await waitForSceneCount(p, 1);
    assert.equal(source(), createdHost);
    assert.equal(readFileSync(scenePath, "utf8"), createdChild);
    current.checks.push(
      "single undo removes newly created scene file and host; redo restores both exact byte sequences",
    );
    await button(p, "Kohtaukset").click();
    await settled(p);
    await edit("add", { name: "Loppu", fileName: "loppu.html", duration: 3 });
    await edit("rename", { target: first.target, name: "Tuotekohtaus" });
    const copy = await edit("duplicate", { target: first.target });
    assert.equal(copy.affectsInstances, 2);
    const sharedLook = await tool(p, "studio_look");
    const shared = sharedLook.scenes.find((s) => s.sourceFile === "scenes/avaus.html");
    assert.equal(shared.instances.length, 2);
    assert.equal(shared.instance, copy.instance);
    current.sharedScene = shared;
    current.checks.push(
      "runtime manifest contains exactly two shared placements and the copied instance is physically selected",
    );

    current.checks.push("rename and shared-source copy with explicit pre-write timing/impact");
    await edit("later", { target: copy.target });
    assert.deepEqual(
      (await list()).rows.map((r) => r.start),
      [7, 9, 12],
    );
    await edit("earlier", { target: copy.target });
    assert.deepEqual(
      (await list()).rows.map((r) => r.start),
      [7, 9, 11],
    );
    current.checks.push(
      "chronological reorder changes host timing independently of element overlap",
    );
    // Name collision is exercised in the assigned path and does not change source.
    const beforeConflict = source();
    await refuseSceneCollision(p, mode);
    assert.equal(source(), beforeConflict);
    current.checks.push("file-name conflict refused without writing; next action recovers");
    const beforeDelete = source();
    await edit("delete", { target: copy.target });
    const afterDelete = source();
    assert(readFileSync(join(root, "packages/studio/data/projects", name, "scenes/avaus.html")));
    current.checks.push("delete clears physical selection and retains shared source");
    await button(p, "Sulje").click();
    await button(p, "Peru").click();
    await waitForSceneCount(p, 3);
    assert.equal(source(), beforeDelete);
    await button(p, "Tee uudelleen").click();
    await waitForSceneCount(p, 2);
    assert.equal(source(), afterDelete);
    current.checks.push("undo/redo restores exact host bytes");
    const shelf = await importSyntheticImage(p, button);
    const asset = shelf.assets[0];
    assert(asset);
    const nested = await tool(p, "studio_elements", { sourceFile: "scenes/avaus.html" });
    assert(nested.ok, JSON.stringify(nested));
    const bg = nested.elements[0];
    async function selectNestedBackground() {
      if (mode === "mixed") {
        assert((await tool(p, "studio_seek", { time: 7.8 })).ok);
        assert((await tool(p, "studio_select", { handle: bg.handle })).ok);
      } else {
        await field(p, "Aika sekunteina").fill("7,8");
        await button(p, "Siirry").click();
        const look = await tool(p, "studio_look");
        const label = look.elements.find((e) => e.handle === bg.handle)?.label;
        assert(label, JSON.stringify(look.elements));
        await button(
          p,
          `${label} · ${look.scenes.find((s) => s.sourceFile === "scenes/avaus.html").instances[0].label}`,
        ).click();
      }
    }
    await selectNestedBackground();
    await button(p, "Elementit").click();
    await settled(p);
    if (mode === "mixed") {
      const receipt = await tool(p, "studio_edit_element", {
        sourceFile: "scenes/avaus.html",
        version: nested.version,
        action: "add",
        kind: "image",
        name: "Synteettinen kuva",
        imagePath: asset.path,
        checksum: asset.checksum,
      });
      assert(receipt.ok, JSON.stringify(receipt));
      current.imageReceipt = receipt;
    } else {
      await select(p, "Tyyppi", "image");
      await field(p, "Nimi").fill("Synteettinen kuva");
      await select(p, "Kuva aineistohyllystä", asset.path);
      await submitElement(p, button);
    }
    await button(p, "Sulje").click();
    const withImage = await tool(p, "studio_elements", { sourceFile: "scenes/avaus.html" });
    const imageRow = withImage.elements.find((e) => e.name === "Synteettinen kuva");
    assert(imageRow);
    assert.equal(imageRow.checksum, asset.checksum);
    let child = readFileSync(
      join(root, "packages/studio/data/projects", name, "scenes/avaus.html"),
      "utf8",
    );
    assert(child.includes(`src="../${asset.path}"`));
    const imageProofs = await decodedImageProofs(p);
    current.imageProofs = imageProofs;
    await p.screenshot({ path: join(evidence, `${mode}-${width}-nested-image.png`) });
    current.checks.push(
      "imported synthetic image copied into newly created nested scene; relative URL decodes in preview",
    );
    await addExportMotion(p, mode, button);
    child = readFileSync(
      join(root, "packages/studio/data/projects", name, "scenes/avaus.html"),
      "utf8",
    );
    await independentSceneAcceptance({
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
    });
    current.receipts = await p.evaluate(() => window.sceneReceipts);
    current.final = await list();
    current.normalizedHostHash = hash(source().replaceAll(name, "acceptance-project"));
    current.sourceHashes = {
      "index.html": `"sha256:${hash(source())}"`,
      "scenes/avaus.html": hash(child),
    };
    await p.close();
    p = await pageFor(name, width, height);
    await waitForReopenedScenes(
      p,
      current.final.rows.map((row) => row.sourceFile),
    );
    assert.deepEqual((await list()).rows, current.final.rows);
    const reopened = await tool(p, "studio_elements", { sourceFile: "scenes/avaus.html" });
    assert.deepEqual(reopened.elements, withImage.elements);
    await verifyReopenedCopy(p, current, join(root, "packages/studio/data/projects", name), child);
    current.checks.push("reopen retains timeline names source identities order and media checksum");
    await p.screenshot({ path: join(evidence, `${mode}-${width}-reopened.png`) });
    await exportSceneAcceptance({ p, current, root, evidence });
    await p.close();
    current.ok = true;
  }
  assert.equal(new Set(report.modes.map((m) => m.normalizedHostHash)).size, 1);
  assert.equal(new Set(report.modes.map((m) => m.sourceHashes["scenes/avaus.html"])).size, 1);
  report.equivalentSources = true;
  compareSceneExports(report);
});

async function decodedImageProofs(p) {
  const imageProofs = [];
  for (const frame of p.frames()) {
    const proof = await frame.evaluate(() => {
      const image = Array.from(document.images).find((i) => i.alt === "Synteettinen kuva");
      if (!image) return null;
      const box = image.getBoundingClientRect();
      return {
        src: image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        width: box.width,
        height: box.height,
      };
    });
    if (proof) imageProofs.push(proof);
  }
  assert(
    imageProofs.some((p) => p.complete && p.naturalWidth > 0 && p.width > 0 && p.height > 0),
    JSON.stringify(imageProofs),
  );
  return imageProofs;
}

function labeledControl({ name, tag }) {
  return Array.from(document.querySelectorAll("label"))
    .find(
      (label) =>
        (label.textContent.trim().startsWith(name) ||
          label.querySelector(tag)?.getAttribute("aria-label") === name) &&
        label.querySelector(tag),
    )
    .querySelector(tag);
}

async function refuseSceneCollision(p, mode) {
  if (mode === "ui-only") {
    await field(p, "Uuden kohtauksen tiedostonimi").fill("avaus.html");
    await button(p, "Lisää kohtaus").click();
    await settled(p);
    assert(await p.$("dialog [role=alert]"));
  } else {
    const refusal = await tool(p, "studio_prepare_scene", {
      sourceFile: "index.html",
      action: "add",
      name: "Collision",
      fileName: "avaus.html",
      duration: 2,
    });
    assert.equal(refusal.ok, false);
  }
}

async function waitForReopenedScenes(p, sourceFiles) {
  await p.waitForFunction(
    async (sourceFiles) => {
      const look = await window.ariStudio.call("studio_look");
      return (
        look.sceneStatus === "ready" &&
        sourceFiles.every((sourceFile) =>
          look.scenes.some((scene) => scene.sourceFile === sourceFile),
        )
      );
    },
    {},
    sourceFiles,
  );
}
