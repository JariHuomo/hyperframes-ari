import assert from "node:assert/strict";

export async function templateElementAcceptance({
  p,
  tool,
  button,
  field,
  settled,
  mode,
  current,
}) {
  const sourceFile = "index.html";
  const listing = () => tool(p, "studio_elements", { sourceFile });
  const original = await listing();
  const image = original.elements.find((e) => e.kind === "image");
  const background = original.elements.find((e) => e.kind === "background");
  assert(image && background);
  await button(p, "Elementit").click();
  await settled(p);
  async function edit(action, target, name) {
    const before = await listing();
    if (mode === "mixed") {
      const receipt = await tool(p, "studio_edit_element", {
        sourceFile,
        version: before.version,
        action,
        target,
        ...(name ? { name } : {}),
      });
      assert(receipt.ok, JSON.stringify(receipt));
      current.receipts.push(receipt);
    } else {
      await p.select("::-p-aria(Valittu elementti)", target);
      await settled(p);
      if (name) await field(p, "Nimi").fill(name);
      const control = await p.$(
        `button::-p-text(${{ rename: "Nimeä", duplicate: "Kopioi", delete: "Poista" }[action]})`,
      );
      await control.focus();
      await p.keyboard.press("Enter");
      await settled(p);
      assert.equal(await p.$("dialog [role=alert]"), null);
    }
    const after = await listing();
    assert.notEqual(after.version, before.version);
    return after;
  }
  await edit("rename", background.target, "Pohjan tausta");
  await edit("rename", image.target, "Pohjan kuva");
  let after = await edit("duplicate", image.target);
  const copy = after.elements.find((e) => e.name === "Pohjan kuva (kopio)");
  assert(copy);
  assert.equal(copy.imagePath, image.imagePath);
  await edit("delete", copy.target);
  assert(
    (await listing()).elements.some((e) => e.target === image.target && e.name === "Pohjan kuva"),
  );
  await button(p, "Sulje").click();
  current.checks.push(
    "old template background and image rename; image copy retains URL; independent deletion through assigned path",
  );
}
