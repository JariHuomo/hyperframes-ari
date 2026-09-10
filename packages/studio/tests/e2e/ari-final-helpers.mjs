/**
 * Ari · stages shared by the whole-delivery acceptance journey.
 *
 * Every stage here is one step of the SAME synthetic ad, written through the
 * visible controls in `ui-only` and through the bounded tools in `mixed`. No
 * stage hand-fixes an acceptance source and none of them is a human test.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  ariaSelect,
  breakVersionDependency,
  editSceneWithCommand,
  elementDialogResult,
  settled,
  tool,
  typeIntoInput,
} from "./ari-acceptance-browser.mjs";
import { button, fill, select } from "./ari-notebook-helpers.mjs";
import { digest, projectDir } from "./ari-review-helpers.mjs";

export const LOCKED = "Pieni tauko.";
export const GAP = "Hinta puuttuu ruudusta";
export const NEXT = "Kysy hinta asiakkaalta";
export const CUSTOM_EASE = "custom(M0,0 C0.25,0.9 0.4,1 1,1)";

/**
 * Several dialogs share the "Sulje" spelling and some close themselves, so this
 * asks whatever is open to close until nothing is. Clicking a control behind an
 * open modal silently does nothing and shows up much later as a click timeout.
 */
export async function closeDialog(p) {
  await p.waitForFunction(() => {
    const dialog = document.querySelector("dialog");
    if (!dialog) return true;
    const close = [...dialog.querySelectorAll("button")].find(
      (node) => node.textContent.trim().startsWith("Sulje") && !node.disabled,
    );
    close?.click();
    return false;
  });
}
export const sourceOf = (root, name, file = "index.html") =>
  readFileSync(join(projectDir(root, name), file), "utf8");

/** One element write, through the tool or through the visible dialog. */
export async function editElement(p, entry, input, sourceFile = "index.html") {
  if (entry.mode === "mixed") return editElementWithCommand(p, input, sourceFile);
  return editElementVisibly(p, input, sourceFile);
}
async function editElementWithCommand(p, input, sourceFile) {
  const listing = await tool(p, "studio_elements", { sourceFile });
  return tool(p, "studio_edit_element", {
    sourceFile,
    version: listing.version,
    action: "add",
    ...input,
  });
}
async function editElementVisibly(p, input, sourceFile) {
  if (sourceFile === "index.html") await selectRoot(p);
  await button(p, "Elementit").click();
  await settled(p);
  await ariaSelect(p, "Tyyppi", input.kind);
  // Changing the kind re-renders the form; typing into the old fields loses it.
  await settled(p);
  await fill(p, "Nimi", input.name);
  await fillElementKind(p, input);
  await button(p, "Lisää elementti").click();
  const result = await elementDialogResult(p);
  await closeDialog(p);
  return result;
}
/** The one field each element kind adds to the shared name field. */
const ELEMENT_KIND_FIELD = {
  text: (p, input) => fill(p, "Teksti", input.text),
  image: (p, input) => ariaSelect(p, "Kuva aineistohyllystä", input.imagePath),
  background: (p, input) => setColor(p, input.color),
};
const fillElementKind = (p, input) => ELEMENT_KIND_FIELD[input.kind](p, input);

/**
 * The visible element dialog writes into whichever source the panel has
 * selected, so a root write after working inside a scene needs the selection
 * put back first. The tool path says `sourceFile` outright.
 */
async function selectRoot(p) {
  const look = await tool(p, "studio_look");
  if (!look.selection || look.selection.sourceFile === "index.html") return;
  await button(p, "Pääviesti").click();
  await p.waitForFunction(
    async () => (await window.ariStudio.call("studio_look")).selection?.sourceFile === "index.html",
  );
}
async function setColor(p, color) {
  await p.$eval(
    "dialog input[type=color]",
    (node, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    color,
  );
}
/** One scene structure operation, priced before the write on both paths. */
export async function editScene(p, entry, action, extra = {}) {
  const args = { sourceFile: "index.html", action, ...extra };
  if (entry.mode === "mixed") return editSceneWithCommand(p, args);
  return editSceneVisibly(p, action, extra);
}
async function editSceneVisibly(p, action, extra) {
  await button(p, "Kohtaukset").click();
  await settled(p);
  await fillSceneForm(p, extra);
  await button(p, SCENE_LABELS[action]).click();
  await settled(p);
  await p.waitForSelector('section[aria-label="Kohtausmuutoksen vaikutus"]');
  const collected = await collectSceneReceipts(p);
  await button(p, "Tallenna kohtausmuutos").click();
  await settled(p);
  assert.equal(await p.$("dialog [role=alert]"), null);
  // The panel's last snapshot belongs to whichever tool ran most recently, so
  // the scene receipt is taken from its own subscription instead.
  await p.waitForFunction((seen) => window.__ariSceneReceipts.length > seen, {}, collected);
  const receipt = await p.evaluate(() => window.__ariSceneReceipts.at(-1));
  await closeDialog(p);
  assert(receipt?.ok, JSON.stringify(receipt));
  return receipt;
}
const SCENE_FIELDS = {
  name: "Kohtauksen nimi",
  fileName: "Uuden kohtauksen tiedostonimi",
  duration: "Uuden kohtauksen kesto (s)",
};
async function fillSceneForm(p, extra) {
  if (extra.target) await select(p, "Valittu kohtaus", extra.target);
  for (const [key, label] of Object.entries(SCENE_FIELDS))
    if (extra[key] !== undefined) await fill(p, label, String(extra[key]));
}
function collectSceneReceipts(p) {
  return p.evaluate(() => {
    if (!window.__ariSceneReceipts) {
      window.__ariSceneReceipts = [];
      window.ariStudio.subscribe(() => {
        const snapshot = window.ariStudio.getSnapshot();
        if (snapshot?.state === "done" && snapshot.tool === "studio_edit_scene")
          window.__ariSceneReceipts.push(snapshot.result);
      });
    }
    return window.__ariSceneReceipts.length;
  });
}
const SCENE_LABELS = {
  add: "Lisää kohtaus",
  duplicate: "Kopioi kohtaus",
  detach: "Tee oma kopio",
};

/** Select one element inside a nested placement, physically in both paths. */
export async function selectNested(p, entry, handle, sceneFile) {
  if (entry.mode === "mixed") {
    assert((await tool(p, "studio_select", { handle })).ok);
    return;
  }
  const look = await tool(p, "studio_look");
  const label = look.elements.find((element) => element.handle === handle)?.label;
  assert(label, JSON.stringify(look.elements.map((e) => e.handle)));
  const scene = look.scenes.find((row) => row.sourceFile === sceneFile);
  await button(p, `${label} · ${scene.instances[0].label}`).click();
}

/**
 * The one motion of the ad: added in MASTER time on a nested placement, then
 * given an explicit `custom(...)` curve and read back out of the source.
 */
const fiNumber = (value) => String(value).replace(".", ",");
export async function addMasterMotion(p, entry, handle, instance, master, local, sourceFile) {
  if (entry.mode === "mixed") {
    const added = await tool(p, "studio_add_animation", {
      handle,
      method: "from",
      preset: "slide",
      position: master,
      duration: 0.6,
      ease: "power2.out",
      timeBasis: "master",
      instance,
    });
    assert(added.ok, JSON.stringify(added));
    const curved = await curveWithFreshHandle(p, added, instance, sourceFile);
    return { added, curved };
  }
  await p.locator("summary::-p-text(Lisää uusi liike)").click();
  await p.locator('[aria-label="Liikevalinta"]').fill("slide");
  // Typed into the master field; the panel converts it to the scene's own clock
  // before the write, and this waits for that conversion instead of assuming it.
  await typeIntoInput(
    p,
    await p.waitForSelector('[aria-label="Uusi liike · Koko videossa (s)"]'),
    fiNumber(master),
  );
  await p.waitForFunction(
    (expected) =>
      document.querySelector('[aria-label="Uusi liike · Kohtauksessa (s)"]')?.value === expected,
    {},
    fiNumber(local),
  );
  await p.locator('[aria-label="Uusi liike kesto (s)"]').fill("0,6");
  const curves = await countCurveSections(p);
  await button(p, "Lisää liike").click();
  await p.waitForFunction(() => window.ariStudio.getSnapshot()?.state === "done");
  const added = await p.evaluate(() => window.ariStudio.getSnapshot()?.result);
  assert(added?.ok, JSON.stringify(added));
  const curved = await commitCurvePoints(p, curves);
  return { added, curved };
}
/**
 * The handle a write was given is stale the moment the preview reloads, and the
 * write also clears the selection, so the curve is written against a handle
 * read back after the fact. The tool's own hint is "Call studio_look again".
 */
async function curveWithFreshHandle(p, added, instance, sourceFile) {
  let last = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    last = await tryCurveWrite(p, added, instance, sourceFile);
    if (last?.ok) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return assert.fail(JSON.stringify(last));
}
async function tryCurveWrite(p, added, instance, sourceFile) {
  const target = await readyTarget(p, sourceFile);
  if (!target) return null;
  const selected = await tool(p, "studio_select", { handle: target.handle });
  const curved = await tool(p, "studio_update_animation", {
    handle: target.handle,
    animationId: added.animationId,
    instance,
    ease: CUSTOM_EASE,
  });
  return curved.ok ? curved : { selected, curved };
}
/** The scene's first element once the preview has finished reloading. */
async function readyTarget(p, sourceFile) {
  const look = await tool(p, "studio_look");
  if (look.sceneStatus !== "ready") return null;
  return (await tool(p, "studio_elements", { sourceFile })).elements?.[0] ?? null;
}

const countCurveSections = (p) =>
  p.evaluate(() => document.querySelectorAll('[aria-label$=" käyrä"]').length);
async function commitCurvePoints(p, before) {
  // The new motion's own panel has to exist first; the scene template already
  // carries one, so the first curve section belongs to an older motion.
  await p.waitForFunction(
    (before) => document.querySelectorAll('[aria-label$=" käyrä"]').length > before,
    {},
    before,
  );
  const label = await p.$$eval('[aria-label$=" käyrä"]', (nodes) => {
    const last = nodes.at(-1);
    last.closest("details").open = true;
    return last.getAttribute("aria-label");
  });
  const scope = `[aria-label="${label}"]`;
  for (const [name, value] of [
    ["X1", "0,25"],
    ["Y1", "0,9"],
    ["X2", "0,4"],
    ["Y2", "1"],
  ])
    await typeIntoInput(p, await p.waitForSelector(`${scope} input[aria-label="${name}"]`), value);
  await p.locator(`${scope} button::-p-text(Tallenna ohjauspisteet)`).click();
  await p.waitForFunction(() => {
    const receipt = window.ariStudio.getSnapshot();
    return receipt?.tool === "studio_update_animation" && receipt.state === "done";
  });
  const receipt = await p.evaluate(() => window.ariStudio.getSnapshot()?.result);
  assert(receipt?.ok, JSON.stringify(receipt));
  return receipt;
}

/**
 * A version whose frozen dependency is deleted underneath it. The removal is
 * the injected fault; no acceptance source file is touched.
 */
export async function removedDependency(p, entry, root) {
  return breakVersionDependency(p, projectDir(root, entry.projectId));
}

/** A write that names a source version the project has moved past. */
export async function staleTarget(p) {
  const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
  const refused = await tool(p, "studio_edit_element", {
    sourceFile: "index.html",
    version: '"sha256:0000000000000000000000000000000000000000000000000000000000000000"',
    action: "add",
    kind: "text",
    name: "Vanhentunut",
    text: "Ei pitäisi tallentua",
  });
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.equal(
    (await tool(p, "studio_elements", { sourceFile: "index.html" })).version,
    listing.version,
  );
  return refused;
}

/** Cross-path source equality: the project name is the only allowed difference. */
export function normalizedSources(root, entry, files) {
  return Object.fromEntries(
    files.map((file) => [
      file,
      digest(sourceOf(root, entry.projectId, file).replaceAll(entry.projectId, "ad")),
    ]),
  );
}
