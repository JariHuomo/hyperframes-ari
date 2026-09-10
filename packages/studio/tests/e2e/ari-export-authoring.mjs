import assert from "node:assert/strict";
import { tool, settled } from "./ari-acceptance-browser.mjs";

export async function addExportHeadline(p, mode, controls) {
  if (process.env.ARI_SCENE_EXPORT !== "1") return;
  const { button, field, select } = controls;
  await button(p, "Elementit").click();
  await settled(p);
  if (mode === "mixed") {
    const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
    const receipt = await tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: listing.version,
      action: "add",
      kind: "text",
      name: "Pääviesti",
      text: "Pieni tauko. Hyvä hetki.",
    });
    assert(receipt.ok, JSON.stringify(receipt));
  } else {
    await select(p, "Tyyppi", "text");
    await field(p, "Nimi").fill("Pääviesti");
    await field(p, "Teksti").fill("Pieni tauko. Hyvä hetki.");
    await submitElement(p, button);
  }
  await button(p, "Sulje").click();
  await addExportMotion(p, mode, button, false);
}
export async function submitElement(p, button) {
  await button(p, "Lisää elementti").click();
  await settled(p);
  assert.equal(await p.$("dialog [role=alert]"), null);
}
export async function addExportMotion(p, mode, button, nested = true) {
  if (process.env.ARI_SCENE_EXPORT !== "1") return;
  const look = await tool(p, "studio_look");
  assert(look.selection?.handle);
  if (mode === "mixed") {
    await addMotionWithTool(p, look.selection, nested);
  } else {
    await addMotionWithControls(p, button, nested);
  }
}

async function addMotionWithControls(p, button) {
  const summary = await p.evaluateHandle(() =>
    Array.from(document.querySelectorAll("summary")).find(
      (e) => e.textContent.trim() === "Lisää uusi liike",
    ),
  );
  await summary.asElement().focus();
  await p.keyboard.press("Enter");
  await summary.dispose();
  await p.locator('[aria-label="Liikevalinta"]').fill("slide");
  const label = "Uusi liike · Kohtauksessa (s)";
  await p.locator(`[aria-label="${label}"]`).fill("0");
  await p.locator('[aria-label="Uusi liike kesto (s)"]').fill("0,6");
  await button(p, "Lisää liike").click();
  await p.waitForFunction(() => window.ariStudio.getSnapshot()?.state === "done");
  const receipt = await p.evaluate(() => window.ariStudio.getSnapshot()?.result);
  assert(receipt?.ok, JSON.stringify(receipt));
}

async function addMotionWithTool(p, selection, nested) {
  const result = await tool(p, "studio_add_animation", {
    handle: selection.handle,
    method: "from",
    preset: "slide",
    position: 0,
    duration: 0.6,
    ease: "power2.out",
    ...(nested ? { timeBasis: "scene", instance: selection.instance } : {}),
  });
  assert(result.ok, JSON.stringify(result));
}
