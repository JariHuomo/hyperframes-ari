/** A3 primitive element acceptance; visible controls vs discovered tools. */
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
  fillDefinedFields,
  fillTextFields,
} from "./ari-acceptance-browser.mjs";
import { nestedElementsAcceptance } from "./ari-elements-nested.mjs";
const { root, evidence, browser, report, pageFor, run } = await acceptanceRun(
  process.env.ARI_ELEMENTS_EVIDENCE ?? "screenshots/2026-09-10-a3-ui-integration",
  { hash: "", previewButton: true, tool: "studio_edit_element" },
);
const button = (p, name) => p.locator(`button::-p-text(${name})`);
const field = (p, name) => ({
  fill: async (value) => {
    const selector = `::-p-aria(${name}[role="textbox"])`;
    await p.locator(selector).click();
    const input = await p.$(selector);
    assert(input, name);
    await typeIntoInput(p, input, value);
  },
});

async function listing(p) {
  const r = await tool(p, "studio_elements", { sourceFile: "index.html" });
  assert(r.ok, JSON.stringify(r));
  return r;
}
await run(async (bootstrapId) => {
  for (const current of acceptanceCases()) {
    const { mode, width, height } = current;
    report.modes.push(current);
    const name = `a3-${mode}-${width}-${Date.now()}`;
    const p = await pageFor(bootstrapId, width, height);
    await createAcceptanceProject(
      p,
      name,
      mode,
      { button, field, select: (p, name, value) => p.select(`::-p-aria(${name})`, value) },
      current.receipts,
    );
    current.checks.push("created through assigned path");
    // Import through the same visible shelf on both paths.
    const shelf = await importSyntheticImage(p, button);
    const image = shelf.assets.find((a) => a.name === "one.png");
    assert(image);
    await button(p, "Elementit").click();
    await settled(p);
    async function fillOperation(extra) {
      await fillDefinedFields(
        extra,
        { kind: "Tyyppi", target: "Valittu elementti", imagePath: "Kuva aineistohyllystä" },
        (label, value) => p.select(`::-p-aria(${label})`, value),
      );
      await fillTextFields(p, field, extra, { name: "Nimi", text: "Teksti" });
    }
    async function edit(action, extra = {}) {
      current.stage = { action, ...extra };
      const before = await listing(p);
      if (mode === "mixed") {
        const receipt = await tool(p, "studio_edit_element", {
          sourceFile: "index.html",
          version: before.version,
          action,
          ...extra,
        });
        assert(receipt.ok, JSON.stringify(receipt));
        current.receipts.push(receipt);
        await button(p, "Päivitä tilanne").click();
        await settled(p);
      } else {
        await fillOperation(extra);
        const labels = {
          add: "Lisää elementti",
          rename: "Nimeä",
          duplicate: "Kopioi",
          delete: "Poista",
          forward: "Tuo edemmäs",
          backward: "Vie taaemmas",
        };
        // Keyboard activation is part of the visible path.
        const control = await p.$(`button::-p-text(${labels[action]})`);
        await p.waitForFunction((control) => !control.matches(":disabled"), {}, control);
        await control.focus();
        await p.keyboard.press("Enter");
        await p.waitForFunction(
          () =>
            document.querySelector("dialog [role=status]")?.textContent.includes("Tallennettu") ||
            document.querySelector("dialog [role=alert]"),
        );
        await settled(p);
        const error = await p.$("dialog [role=alert]");
        assert(!error, error ? await error.evaluate((e) => e.textContent) : "");
      }
      return listing(p);
    }
    await p.evaluate(() => {
      window.elementReceipts = [];
      window.ariStudio.subscribe(() => {
        const receipt = window.ariStudio.getSnapshot();
        if (receipt?.state === "done" && receipt.tool === "studio_edit_element")
          window.elementReceipts.push(receipt.result);
      });
    });
    const initial = await listing(p);
    const baseline = initial.elements.length;
    if (mode === "ui-only") {
      await field(p, "Teksti").fill("   ");
      await button(p, "Lisää elementti").click();
      await p.waitForSelector('dialog [role="alert"]');
      await settled(p);
      await p.screenshot({ path: join(evidence, `${mode}-${width}-refusal.png`) });
    } else {
      const rejected = await tool(p, "studio_edit_element", {
        sourceFile: "index.html",
        version: "stale",
        action: "add",
        kind: "text",
        name: "Otsikko",
        text: "Testi",
      });
      assert.equal(rejected.ok, false);
    }
    assert.equal((await listing(p)).version, initial.version);
    current.checks.push("refused invalid/stale input without a source write");
    let state = await edit("add", { kind: "text", name: "Otsikko", text: "Yhteinen testi" });
    assert.equal(state.elements.length, baseline + 1);
    const target = state.elements.find((e) => e.name === "Otsikko").target;
    state = await edit("add", {
      kind: "image",
      name: "Tuotekuva",
      imagePath: image.path,
      checksum: image.checksum,
    });
    assert.equal(state.elements.length, baseline + 2);
    state = await edit("add", { kind: "background", name: "Taustapinta", color: "#f2eedf" });
    assert.equal(state.elements.length, baseline + 3);
    current.checks.push("text/image/background saved");
    state = await edit("rename", { target, name: "Valmis otsikko" });
    assert.equal(state.elements.find((e) => e.target === target).name, "Valmis otsikko");
    state = await edit("duplicate", { target });
    assert.equal(state.elements.length, baseline + 4);
    const copy = state.elements.find((e) => e.name === "Valmis otsikko (kopio)");
    assert(copy);
    state = await edit("backward", { target: copy.target });
    assert(
      state.elements.find((e) => e.target === copy.target).zIndex <
        state.elements.find((e) => e.target === target).zIndex,
    );
    state = await edit("forward", { target: copy.target });
    assert(
      state.elements.find((e) => e.target === copy.target).zIndex >
        state.elements.find((e) => e.target === target).zIndex,
    );
    state = await edit("delete", { target: copy.target });
    assert.equal(state.elements.length, baseline + 3);
    current.checks.push("rename duplicate order delete");
    await p.screenshot({ path: join(evidence, `${mode}-${width}-elements.png`) });
    await button(p, "Sulje").click();
    const saved = await listing(p);
    await button(p, "Peru").click();
    await p.waitForFunction(
      async (baseline) => {
        const r = await window.ariStudio.call("studio_elements", { sourceFile: "index.html" });
        return r.elements?.length === baseline + 4;
      },
      {},
      baseline,
    );
    await button(p, "Tee uudelleen").click();
    await p.waitForFunction(
      async (baseline) => {
        const r = await window.ariStudio.call("studio_elements", { sourceFile: "index.html" });
        return r.elements?.length === baseline + 3;
      },
      {},
      baseline,
    );
    assert.equal((await listing(p)).version, saved.version);
    current.checks.push("undo/redo exact source version");
    current.receipts = await p.evaluate(() => window.elementReceipts);
    current.savedElements = saved.elements;
    await p.close();
    const reopened = await pageFor(name, width, height);
    assert.deepEqual((await listing(reopened)).elements, saved.elements);
    current.checks.push("reopen preserves names order image checksum");
    await reopened.screenshot({ path: join(evidence, `${mode}-${width}-reopened.png`) });
    await reopened.close();
    await nestedElementsAcceptance({
      browser,
      pageFor,
      tool,
      button,
      field,
      settled,
      mode,
      width,
      height,
      evidence,
      current,
      root,
    });
    current.ok = true;
  }
});
