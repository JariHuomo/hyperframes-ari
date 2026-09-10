import { templateElementAcceptance } from "./ari-elements-template.mjs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** A prepared shared-scene fixture, not a claim of UI scene creation. */
export async function nestedElementsAcceptance({
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
}) {
  const { id, dir } = createNestedFixture(root, mode, width);
  const sourceFile = "scenes/headline-card.html";
  const p = await pageFor(id, width, height);
  await p.waitForFunction(async () =>
    (await window.ariStudio.call("studio_look")).scenes?.some(
      (s) => s.sourceFile === "scenes/headline-card.html",
    ),
  );
  await templateElementAcceptance({ p, tool, button, field, settled, mode, current });
  const look = await tool(p, "studio_look");
  const scene = look.scenes.find((s) => s.sourceFile === sourceFile);
  assert.equal(scene.instances.length, 2);
  const instance = scene.instances[1].hostId;
  const list = async () => {
    const r = await tool(p, "studio_elements", { sourceFile });
    assert(r.ok, JSON.stringify(r));
    return r;
  };
  await p.evaluate(() => {
    window.a3writes = [];
    window.ariStudio.subscribe(() => {
      const r = window.ariStudio.getSnapshot();
      if (r?.state === "done" && r.tool === "studio_edit_element") window.a3writes.push(r.result);
    });
  });
  const original = await list();
  const headline = original.elements.find((e) => e.target === "headline-card-headline");
  assert(headline);
  await field(p, "Aika sekunteina").fill("6.3");
  await button(p, "Siirry").click();
  if (mode === "mixed")
    assert((await tool(p, "studio_select", { handle: headline.handle, instance })).ok);
  else {
    // Visible layer buttons explicitly identify the chosen host.
    const text = `${look.elements.find((e) => e.handle === headline.handle).label} · ${scene.instances[1].label}`;
    await button(p, text).click();
  }
  await button(p, "Elementit").click();
  await settled(p);
  assert.equal(await p.$eval("::-p-aria(Valittu elementti)", (e) => e.value), headline.target);
  assert(
    (await p.$eval('[data-testid="element-impact"]', (e) => e.textContent)).includes(
      "jokaista esiintymää (2)",
    ),
  );
  current.impactText = await p.$eval('[data-testid="element-impact"]', (e) => e.textContent);
  await p.screenshot({ path: join(evidence, `${mode}-${width}-shared-impact.png`) });
  current.checks.push(
    "second shared instance selected through assigned path; impact shown before write",
  );
  const selection = async (target) => {
    await p.waitForFunction(
      async ({ target, instance }) => {
        const r = await window.ariStudio.call("studio_look");
        return (
          r.ok &&
          r.selection?.handle?.endsWith(encodeURIComponent(target)) &&
          r.scenes.find((s) => s.sourceFile === "scenes/headline-card.html")?.instance === instance
        );
      },
      {},
      { target, instance },
    );
    const r = await tool(p, "studio_look");
    const pressedResult = await p.waitForFunction(
      (label) => {
        const labels = [
          ...document.querySelectorAll('nav[aria-label="Tasot"] button[aria-pressed="true"]'),
        ].map((button) => button.textContent);
        return labels.length === 1 && labels[0].includes(label) ? labels : false;
      },
      {},
      scene.instances[1].label,
    );
    const pressed = await pressedResult.jsonValue();
    assert.equal(pressed.length, 1);
    assert(pressed[0].includes(scene.instances[1].label));
    (current.selections ??= []).push({
      target,
      selection: r.selection,
      instance: r.scenes.find((s) => s.sourceFile === sourceFile)?.instance,
    });
  };
  async function edit(action, target, name) {
    const before = await list();
    if (mode === "mixed") {
      const r = await tool(p, "studio_edit_element", {
        sourceFile,
        version: before.version,
        action,
        target,
        ...(name ? { name } : {}),
      });
      assert(r.ok, JSON.stringify(r));
      current.receipts.push(r);
    } else {
      await p.select("::-p-aria(Valittu elementti)", target);
      await settled(p);
      if (name) await field(p, "Nimi").fill(name);
      const labels = {
        rename: "Nimeä",
        duplicate: "Kopioi",
        delete: "Poista",
        backward: "Vie taaemmas",
        forward: "Tuo edemmäs",
      };
      await button(p, labels[action]).click();
      await settled(p);
      assert.equal(await p.$("dialog [role=alert]"), null);
    }
    await p.waitForFunction(
      async (sourceFile) => {
        const look = await window.ariStudio.call("studio_look");
        return (
          look.ok &&
          look.sceneStatus === "ready" &&
          look.scenes.some((s) => s.sourceFile === sourceFile)
        );
      },
      {},
      sourceFile,
    );
    const after = await list();
    assert.notEqual(after.version, before.version);
    assert.equal(after.affectsInstances, 2);
    assert.equal(
      after.version,
      `"sha256:${createHash("sha256")
        .update(readFileSync(join(dir, sourceFile)))
        .digest("hex")}"`,
    );
    return after;
  }
  await edit("rename", headline.target, "Yhteinen otsikko");
  await selection(headline.target);
  await button(p, "Sulje").click();
  const renamed = await list();
  await button(p, "Peru").click();
  await waitForElementVersion(p, sourceFile, original.version);
  await selection(headline.target);
  await button(p, "Tee uudelleen").click();
  await waitForElementVersion(p, sourceFile, renamed.version);
  await selection(headline.target);
  current.checks.push("selected source identity and second instance survive undo redo");
  await button(p, "Elementit").click();
  await settled(p);
  let after = await edit("duplicate", headline.target);
  const copy = after.elements.find(
    (e) => e.target !== headline.target && e.name === "Yhteinen otsikko (kopio)",
  );
  assert(copy);
  await selection(copy.target);
  await p.waitForFunction(
    async (handle) => {
      const r = await window.ariStudio.call("studio_inspect", { handle });
      return r.ok && r.isCurrentSelection && r.animations.length > 0;
    },
    {},
    copy.handle,
  );
  const inspected = await tool(p, "studio_inspect", { handle: copy.handle });
  assert(inspected.ok && inspected.animations.length > 0, JSON.stringify(inspected));
  recordAnimationEvidence(current, inspected);
  const copiedSource = readFileSync(join(dir, sourceFile), "utf8");
  assert(copiedSource.includes(copy.target));
  await edit("rename", copy.target, "Itsenäinen kopio");
  await selection(copy.target);
  after = await edit("delete", copy.target);
  await p.waitForFunction(
    async () => (await window.ariStudio.call("studio_look")).selection === null,
  );
  current.checks.push(
    "old animated template rename duplicate independent rename delete; saved identity follows preview and deletion clears",
  );
  await button(p, "Sulje").click();
  const savedBytes = readFileSync(join(dir, sourceFile), "utf8");
  await button(p, "Peru").click();
  await p.waitForFunction(
    async (sourceFile) =>
      (await window.ariStudio.call("studio_elements", { sourceFile })).elements?.some(
        (e) => e.name === "Itsenäinen kopio",
      ),
    {},
    sourceFile,
  );
  await button(p, "Tee uudelleen").click();
  await waitForElementVersion(p, sourceFile, after.version);
  assert.equal(readFileSync(join(dir, sourceFile), "utf8"), savedBytes);
  const refused = await tool(p, "studio_edit_element", {
    sourceFile,
    version: after.version,
    action: "rename",
    target: copy.target,
    name: "Ei tallennu",
  });
  assert.equal(refused.ok, false);
  assert.equal(readFileSync(join(dir, sourceFile), "utf8"), savedBytes);
  current.checks.push("nested exact undo redo; deleted target refused without write");
  await p.screenshot({ path: join(evidence, `${mode}-${width}-nested.png`) });
  // Import and place the copied raster inside the nested source, through the assigned path.
  await button(p, "Uusi mainos / aineisto").click();
  await button(p, "Aineisto").click();
  await (
    await p.$("input[type=file]")
  ).uploadFile(join(root, "packages/studio/tests/e2e/fixtures/ari-authoring/one.png"));
  await p.waitForFunction(() =>
    document.querySelector("dialog [role=status]")?.textContent.includes("1 kuvaa tuotu"),
  );
  await button(p, "Sulje").click();
  const image = (await tool(p, "studio_images")).assets.find((a) => a.name === "one.png");
  assert(image);
  if (mode === "mixed")
    assert((await tool(p, "studio_select", { handle: headline.handle, instance })).ok);
  else await button(p, `Yhteinen otsikko · ${scene.instances[1].label}`).click();
  await button(p, "Elementit").click();
  await settled(p);
  async function addNestedImage() {
    if (mode === "mixed") {
      const r = await tool(p, "studio_edit_element", {
        sourceFile,
        version: (await list()).version,
        action: "add",
        kind: "image",
        name: "Kohtauksen kuva",
        imagePath: image.path,
        checksum: image.checksum,
      });
      assert(r.ok, JSON.stringify(r));
      current.receipts.push(r);
    } else {
      await p.select("::-p-aria(Tyyppi)", "image");
      await field(p, "Nimi").fill("Kohtauksen kuva");
      await p.select("::-p-aria(Kuva aineistohyllystä)", image.path);
      await button(p, "Lisää elementti").click();
      await settled(p);
      assert.equal(await p.$("dialog [role=alert]"), null);
    }
  }
  await addNestedImage();
  after = await list();
  const nestedImage = after.elements.find((e) => e.name === "Kohtauksen kuva");
  assert.equal(nestedImage.checksum, image.checksum);
  await selection(nestedImage.target);
  await button(p, "Sulje").click();
  await field(p, "Aika sekunteina").fill("6.3");
  await button(p, "Siirry").click();
  const imageProof = await nestedImageProof(p, nestedImage.target, instance);
  current.imageProof = imageProof;
  assert(readFileSync(join(dir, sourceFile), "utf8").includes(`../${image.path}`));
  current.checks.push(
    "shelf raster placed in nested source; checksum and relative URL match; browser decodes image",
  );
  await p.screenshot({ path: join(evidence, `${mode}-${width}-nested-image.png`) });
  // A concurrent editor changes the same source while this dialog holds its old version.
  await button(p, "Elementit").click();
  await settled(p);
  async function renameConcurrentHeadline() {
    await p.select("::-p-aria(Valittu elementti)", headline.target);
    await settled(p);
    await field(p, "Nimi").fill("Oma jatkettu otsikko");
    await button(p, "Nimeä").click();
    await settled(p);
  }
  const staleVersion = (await list()).version;
  const other = await pageFor(id, width, height);
  await other.waitForFunction(async () =>
    (await window.ariStudio.call("studio_look")).scenes?.some(
      (s) => s.sourceFile === "scenes/headline-card.html",
    ),
  );
  const external = await tool(other, "studio_edit_element", {
    sourceFile,
    version: staleVersion,
    action: "rename",
    target: headline.target,
    name: "Toisen muokkaajan otsikko",
  });
  assert(external.ok, JSON.stringify(external));
  await other.close();
  await p.bringToFront();
  await renameConcurrentHeadline();
  assert(await p.$("dialog [role=alert]"));
  assert.equal((await list()).version, external.version);
  await p.screenshot({ path: join(evidence, `${mode}-${width}-stale.png`) });
  await button(p, "Päivitä tilanne").click();
  await settled(p);
  await renameConcurrentHeadline();
  assert.equal(await p.$("dialog [role=alert]"), null);
  after = await list();
  assert(
    after.elements.some((e) => e.target === headline.target && e.name === "Oma jatkettu otsikko"),
  );
  await selection(headline.target);
  await button(p, "Sulje").click();
  current.checks.push(
    "concurrent editor invalidates dialog version; visible refusal and refresh allow safe continuation",
  );
  current.nestedReceipts = await p.evaluate(() => window.a3writes);
  verifyNestedReceipts(current.nestedReceipts, sourceFile);
  current.nestedSource = { sourceFile, version: after.version, elements: after.elements };
  await p.close();
  const reopened = await pageFor(id, width, height);
  const reread = await tool(reopened, "studio_elements", { sourceFile });
  assert.equal(reread.version, after.version);
  current.checks.push("nested source survives reopening");
  await reopened.close();
}

function createNestedFixture(root, mode, width) {
  const id = `a3-nested-${mode}-${width}-${Date.now()}`;
  const dir = join(root, "packages/studio/data/projects", id);
  cpSync(join(root, "packages/studio/tests/e2e/fixtures/ari-scenes"), dir, { recursive: true });
  cpSync(
    createRequire(join(root, "packages/studio/package.json")).resolve("gsap/dist/gsap.min.js"),
    join(dir, "assets/gsap.min.js"),
  );
  for (const plugin of ["CustomEase", "MotionPathPlugin"])
    cpSync(
      createRequire(join(root, "packages/studio/package.json")).resolve(
        `gsap/dist/${plugin}.min.js`,
      ),
      join(dir, `assets/${plugin}.min.js`),
    );
  const master = join(dir, "index.html");
  writeFileSync(
    master,
    readFileSync(master, "utf8").replace(
      "</head>",
      '<script src="assets/CustomEase.min.js"></script><script src="assets/MotionPathPlugin.min.js"></script></head>',
    ),
  );
  return { id, dir };
}

async function waitForElementVersion(p, sourceFile, version) {
  await p.waitForFunction(
    async ({ sourceFile, version }) =>
      (await window.ariStudio.call("studio_elements", { sourceFile })).version === version,
    {},
    { sourceFile, version },
  );
}

async function nestedImageProof(p, target, instance) {
  let imageFrame;
  for (const frame of p.frames()) {
    if (
      await frame.evaluate(
        (target) =>
          [...document.querySelectorAll("img")].some(
            (e) => e.getAttribute("data-hf-id") === target,
          ),
        target,
      )
    )
      imageFrame = frame;
  }
  assert(imageFrame, "Nested image must exist in a preview frame (including shadow-hosted iframe)");
  const imageProof = await imageFrame.evaluate(
    ({ target, instance }) => {
      const image = [...document.querySelectorAll("img")].find(
        (e) => e.getAttribute("data-hf-id") === target && e.closest(`[id="${instance}"]`),
      );
      if (!image) return null;
      const box = image.getBoundingClientRect();
      return {
        src: image.src,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        complete: image.complete,
        width: box.width,
        height: box.height,
      };
    },
    { target: target, instance },
  );
  assert(imageProof, "Image must resolve inside the chosen instance");
  assert(imageProof.complete, JSON.stringify(imageProof));
  assert(
    [imageProof.naturalWidth, imageProof.width, imageProof.height].every((value) => value > 0),
    JSON.stringify(imageProof),
  );
  return imageProof;
}

function verifyNestedReceipts(receipts, sourceFile) {
  for (const receipt of receipts.filter((r) => r.ok)) {
    assert.equal(receipt.sourceFile, sourceFile);
    assert.equal(receipt.affectsInstances, 2);
    assert.equal(receipt.stage, "saved");
    assert.equal(typeof receipt.version, "string");
    assert.equal(receipt.previewReady, true);
  }
}

function recordAnimationEvidence(current, inspected) {
  (current.animationEvidence ??= []).push(inspected);
}
