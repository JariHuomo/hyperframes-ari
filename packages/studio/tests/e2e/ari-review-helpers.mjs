/** Shared review-surface plumbing for the D4 and D6–D7 acceptance journeys. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  settled,
  textButton as button,
  tool,
  typeIntoInput,
  ariaSelect as select,
} from "./ari-acceptance-browser.mjs";

/** `(s)` labels appear more than once, so those are typed into a resolved node. */
export const field = (p, name) => ({
  fill: async (value) => {
    if (!name.includes("(s)")) {
      await p.locator(`::-p-aria(${name}[role="textbox"])`).fill(value);
      return;
    }
    await typeIntoInput(p, await p.waitForSelector(`::-p-aria(${name}[role="textbox"])`), value);
  },
});
export const reviewControls = { button, field, select };
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const projectDir = (root, name) => join(root, "packages/studio/data/projects", name);

export function measureVideo(path) {
  const raw = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,nb_read_packets",
    "-count_packets",
    "-of",
    "json",
    path,
  ]);
  const stream = JSON.parse(raw.toString()).streams[0];
  const [num, den] = stream.r_frame_rate.split("/").map(Number);
  return {
    width: stream.width,
    height: stream.height,
    fps: num / den,
    frames: Number(stream.nb_read_packets),
  };
}

export async function saveVersion(p, name, current) {
  await button(p, "Versiot / vertailu").click();
  await settled(p);
  await field(p, "Version nimi").fill(name);
  await button(p, "Tallenna tarkistusversio").click();
  await settled(p);
  await button(p, "Sulje vertailu").click();
  const version = (await tool(p, "studio_versions")).versions.at(-1);
  current.receipts.push({ savedVersion: version });
  return version;
}

/** One tracked source write, through the visible dialog or the same bounded tool. */
export async function addHeadline(
  p,
  mode,
  current,
  name = "Otsikko",
  copy = "Hyvä hetki alkaa tästä",
) {
  if (mode === "mixed") {
    const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
    const receipt = await tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: listing.version,
      action: "add",
      kind: "text",
      name,
      text: copy,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    current.receipts.push(receipt);
    return receipt;
  }
  await button(p, "Elementit").click();
  await settled(p);
  await select(p, "Tyyppi", "text");
  await field(p, "Nimi").fill(name);
  await field(p, "Teksti").fill(copy);
  await button(p, "Lisää elementti").click();
  await settled(p);
  await button(p, "Sulje").click();
  return { ok: true };
}

/** Open the review dialog and show a published package; used after every reopen. */
export async function openPublishedPackage(p) {
  await button(p, "Tarkistuspaketti").click();
  await button(p, "Hae versiot").click();
  await settled(p);
  await p.locator("button::-p-text(Avaa paketti)").click();
  await p.waitForFunction(
    () => document.querySelector('[data-testid="ari-review-package"]') !== null,
  );
}

export async function readAssessments(p) {
  const result = await tool(p, "studio_read_review_assessments");
  assert(result.ok, JSON.stringify(result));
  return result;
}

/** Screenshots are evidence, so put the statuses on screen before taking one. */
export async function showAssessments(p, path) {
  await p.$eval("[data-testid=ari-review-assessment-list]", (node) =>
    node.scrollIntoView({ block: "start" }),
  );
  await p.screenshot({ path });
}

/**
 * Record one category. `test_data` is the only honest reviewer type for a
 * browser journey: nobody watched anything here.
 */
export async function recordAssessment(p, mode, packageId, category, text) {
  if (mode === "mixed") {
    const view = await readAssessments(p);
    const receipt = await tool(p, "studio_record_review_assessment", {
      packageId,
      expectedToken: view.token,
      category,
      reviewer: "Hyväksyntäajo",
      reviewerType: "test_data",
      verdict: "ok",
      text,
      wholeVideoWatched: true,
      checkedBoundaries: "all",
    });
    assert(receipt.ok, JSON.stringify(receipt));
    assert.equal(receipt.approved, false);
    return receipt;
  }
  await button(p, "Päivitä arviot").click();
  await settled(p);
  await select(p, "Osa-alue", category);
  await select(p, "Tekijän rooli", "test_data");
  await field(p, "Arvion tekijä").fill("Hyväksyntäajo");
  await field(p, "Perustelu").fill(text);
  // The form keeps its state between records, so tick only what is still unticked.
  for (const name of ["Katsoin koko videon", "Tarkastin kaikki rajat"]) {
    const box = await p.waitForSelector(`::-p-aria(${name})`);
    if (!(await box.evaluate((node) => node.checked))) await box.click();
  }
  await button(p, "Kirjaa arvio").click();
  await p.waitForFunction(() =>
    document
      .querySelector('[data-testid="ari-assessment-status"]')
      .textContent.includes("Arvio kirjattu"),
  );
  await settled(p);
  return null;
}
