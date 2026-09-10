/**
 * Ari · D4 review-package acceptance (visible UI + agent tools)
 *
 * Builds one synthetic ad with the current project, element and motion actions,
 * freezes two versions, prepares a review package through the visible Tarkistus
 * path (ui-only) or the same bounded tools (mixed), and then verifies the thing
 * that actually matters: what the browser SHOWS is what the manifest published,
 * every asset really comes out of the confined route, and the real MP4 on disk
 * measures what the manifest says. Preparation never claims viewing.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  acceptanceRun,
  acceptanceCases,
  ariaSelect as select,
  panelTab as tab,
  textButton as button,
  tool,
  settled,
  breakVersionDependency,
  startAcceptanceCase,
} from "./ari-acceptance-browser.mjs";
import {
  addHeadline,
  digest,
  field,
  measureVideo,
  openPublishedPackage,
  projectDir as reviewProjectDir,
  readAssessments,
  recordAssessment,
  reviewControls as controls,
  saveVersion,
  showAssessments,
} from "./ari-review-helpers.mjs";

const run = await acceptanceRun(
  process.env.ARI_REVIEW_EVIDENCE ?? "screenshots/2026-09-10-d-review-ui/browser",
  {
    hash: "?v=1&t=0&tab=design&rc=0",
    tool: "studio_prepare_review_package",
    // The two refusals this journey provokes on purpose: a path outside the
    // manifest, and a version whose frozen dependency was deleted.
    expectedHttpError: (error) =>
      error.status === 409 &&
      /\/review\/(prepare$|[a-f0-9-]{36}\/asset\?path=manifest\.json$)/.test(
        new URL(error.url).pathname + new URL(error.url).search,
      ),
  },
);
const projectDir = (name) => reviewProjectDir(run.root, name);

await run.run(async (bootstrap) => {
  if (process.argv[2] === "reopen") {
    await reopenPackages();
    return;
  }
  let cases = 0;
  for (const current of acceptanceCases()) {
    run.report.modes.push(current);
    await acceptanceCase(bootstrap, current);
    cases++;
  }
  // Exactly the refusals this journey asked for: one confined-path read and two
  // failed preparations (the agent tool and the visible button) per case.
  assert.equal(
    run.report.httpErrors.filter((error) => error.status === 409).length,
    cases * 3,
    JSON.stringify(run.report.httpErrors),
  );
});

/** The motion is what gives the package a changed boundary to sample. */
async function addMotion(p, mode, current) {
  const elements = await tool(p, "studio_elements", { sourceFile: "index.html" });
  const headline = elements.elements.find((element) => element.kind === "text");
  assert(headline, JSON.stringify(elements));
  if (mode === "mixed") {
    assert((await tool(p, "studio_select", { handle: headline.handle })).ok);
    const receipt = await tool(p, "studio_add_animation", {
      handle: headline.handle,
      method: "from",
      preset: "slide",
      position: 1,
      duration: 0.6,
      ease: "power2.out",
    });
    assert(receipt.ok, JSON.stringify(receipt));
    current.receipts.push(receipt);
    return;
  }
  const look = await tool(p, "studio_look");
  const label = look.elements.find((element) => element.handle === headline.handle).label;
  await selectLayer(p, label);
  await tab(p, "Liike");
  await p.locator("summary::-p-text(Lisää uusi liike)").click();
  await field(p, "Uusi liike · Kohtauksessa (s)").fill("1");
  await field(p, "Uusi liike kesto (s)").fill("0,6");
  await button(p, "Lisää liike").click();
  // The write clears the selection when the preview reloads, so the receipt is
  // the evidence here — asking studio_inspect afterwards would find no target.
  await p.waitForFunction(() => {
    const receipt = window.ariStudio.getSnapshot();
    return receipt?.tool === "studio_add_animation" && receipt.state === "done";
  });
  const receipt = await p.evaluate(() => window.ariStudio.getSnapshot().result);
  assert(receipt?.ok, JSON.stringify(receipt));
  current.receipts.push(receipt);
}

/** The layer button is the visible selection control; the panel disables it while a
 * write is in flight, so a click can land on a disabled control and do nothing. */
async function selectLayer(p, label) {
  const pressed = (label) =>
    [...document.querySelectorAll('nav[aria-label="Tasot"] button')].some(
      (node) => node.textContent.startsWith(label) && node.getAttribute("aria-pressed") === "true",
    );
  for (let attempt = 0; attempt < 10; attempt++) {
    await p.waitForFunction(
      (label) =>
        [...document.querySelectorAll('nav[aria-label="Tasot"] button')].some(
          (node) => node.textContent.startsWith(label) && !node.disabled,
        ),
      {},
      label,
    );
    await p.locator(`nav[aria-label="Tasot"] button::-p-text(${label})`).click();
    try {
      await p.waitForFunction(pressed, { timeout: 3000 }, label);
      return;
    } catch {
      /* the control was busy; try the same visible click again */
    }
  }
  throw new Error(`Tasoa ${label} ei saatu valituksi.`);
}

async function preparePackage(p, mode, current, versions) {
  await tab(p, "Tarkistus");
  await button(p, "Tarkistuspaketti").click();
  await button(p, "Hae versiot").click();
  await settled(p);
  if (mode === "mixed") {
    const receipt = await tool(p, "studio_prepare_review_package", {
      versionId: versions.after.id,
      previousVersionId: versions.before.id,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    current.receipts.push({ preparedVia: "agent", package: receipt.package.id });
    current.assetUrls = receipt.assetUrls;
    await button(p, "Hae versiot").click();
    await settled(p);
    await p.locator("button::-p-text(Avaa paketti)").click();
  } else {
    await select(p, "Tarkistettava versio", versions.after.id);
    await select(p, "Vertailuversio", versions.before.id);
    await button(p, "Valmistele tarkistuspaketti").click();
  }
  await p.waitForFunction(
    () => document.querySelector('[data-testid="ari-review-package"]') !== null,
    { timeout: 300_000 },
  );
  await settled(p);
}

/** Every image and video the page shows must come byte-for-byte from the manifest. */
async function verifyShownAssets(p, name, manifest, current) {
  const sources = await p.$$eval("[data-testid=ari-review-package] img, video", (nodes) =>
    nodes.map((node) => node.getAttribute("src")),
  );
  assert(sources.length > 0);
  const published = new Map(
    [manifest.video, ...manifest.frames, ...manifest.boundaryFrames].map((asset) => [
      asset.path,
      asset,
    ]),
  );
  const served = [];
  for (const source of new Set(sources)) {
    const path = new URL(source, "http://127.0.0.1:3084").searchParams.get("path");
    assert(published.has(path), `${path} is not published`);
    const bytes = await p.evaluate(
      async (url) => [...new Uint8Array(await (await fetch(url)).arrayBuffer())],
      source,
    );
    const asset = published.get(path);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(digest(Buffer.from(bytes)), asset.sha256);
    served.push(path);
  }
  current.servedAssets = served;
  // The confined route serves nothing else, not even the manifest beside it.
  const refused = await p.evaluate(
    async (url) => (await fetch(url)).status,
    `/api/ari/projects/${encodeURIComponent(name)}/review/${manifest.id}/asset?path=manifest.json`,
  );
  assert.equal(refused, 409);
}

async function verifyShownBoundaries(p, manifest, current) {
  const shown = await p.$$eval("[data-testid=ari-review-boundary]", (nodes) =>
    nodes.map((node) => node.textContent),
  );
  assert.equal(shown.length, manifest.boundaries.length);
  const bound = [manifest.versionId, manifest.previousVersionId];
  for (const frame of manifest.boundaryFrames) assert(bound.includes(frame.versionId));
  for (const boundary of manifest.boundaries) assert(bound.includes(boundary.versionId));
  const count = await p.$eval(
    "[data-testid=ari-review-boundary-count]",
    (node) => node.textContent,
  );
  assert.equal(count, `Muuttuneiden liikkeiden rajat: ${manifest.boundaries.length}`);
  current.boundaries = manifest.boundaries.map((boundary) => ({
    change: boundary.change,
    edge: boundary.edge,
    versionId: boundary.versionId,
    masterTime: boundary.masterTime,
    samples: boundary.samples.map((sample) => sample.status),
  }));
  assert(
    await p.$eval("[data-testid=ari-review-disclaimer]", (node) =>
      node.textContent.includes("eikä se ole laadun hyväksyntä"),
    ),
  );
}

/** A version whose frozen dependency was removed must fail and publish nothing. */
async function proveFailedPreparation(p, name, current) {
  current.failedPreparation = await breakVersionDependency(p, projectDir(name));
  await button(p, "Valmistele tarkistuspaketti").click();
  await p.waitForFunction(() =>
    document.querySelector('[data-testid="ari-review-state"]').textContent.includes("epäonnistui"),
  );
  current.checks.push("removed dependency fails and publishes nothing");
}

/** Three categories recorded, one deliberately left alone: `puuttuu` has to be
 * what an unassessed category actually shows, not an empty space. */
function recorded() {
  return [
    ["message", "Pääviesti on luettavissa ensimmäisestä ruudusta."],
    ["layout", "Asettelu pysyy turva-alueella."],
    ["motion", "Liike alkaa ja päättyy rajaruutujen mukaisesti."],
  ];
}

function categoryOf(view, packageId, category) {
  const row = view.packages.find((item) => item.packageId === packageId);
  assert(row, JSON.stringify(view.packages.map((item) => item.packageId)));
  return { row, entry: row.categories.find((item) => item.category === category) };
}

/** Everything the reviewer said, and nothing the studio measured, in one place. */
async function assertRecordedCategories(view, manifest) {
  for (const [category] of recorded()) {
    const { entry } = categoryOf(view, manifest.id, category);
    assert.equal(entry.status, "current");
    assert.equal(entry.assessments.at(-1).reviewerType, "test_data");
    assert.equal(entry.assessments.at(-1).packageCoverage, manifest.coverage);
    assert.equal(entry.assessments.at(-1).versionId, manifest.versionId);
  }
}

async function proveAssessments(p, mode, manifest, current) {
  await button(p, "Avaa arviot").click();
  await settled(p);
  assert(
    await p.$eval("[data-testid=ari-review-measured]", (node) =>
      node.textContent.includes("mittaus, ei ääniarvio"),
    ),
    "the silent render must be shown as a measurement",
  );
  const empty = await readAssessments(p);
  for (const [category] of recorded().concat([["audio"]]))
    assert.equal(categoryOf(empty, manifest.id, category).entry.status, "missing");
  for (const [category, text] of recorded())
    await recordAssessment(p, mode, manifest.id, category, text);
  if (mode === "mixed") {
    await button(p, "Päivitä arviot").click();
    await settled(p);
  }
  const view = await readAssessments(p);
  current.assessments = view.packages
    .find((item) => item.packageId === manifest.id)
    .categories.map((entry) => ({
      category: entry.category,
      status: entry.status,
      reviewers: entry.assessments.map((item) => `${item.reviewer}/${item.reviewerType}`),
      coverage: entry.assessments.map((item) => item.packageCoverage),
    }));
  await assertRecordedCategories(view, manifest);
  // Rendering, probing and this journey itself are technical work, never an
  // audio judgement: the silent package still leaves that category missing.
  assert.equal(categoryOf(view, manifest.id, "audio").entry.status, "missing");
  assert.equal(categoryOf(view, manifest.id, "audio").row.measured.audio, false);
  const shown = await p.$eval("[data-testid=ari-assessment-audio]", (node) => node.textContent);
  assert(shown.includes("Ääni: puuttuu"), shown);
  assert(shown.includes("Puuttuva arvio ei ole hyväksyntä."), shown);
  current.checks.push(
    "three categories recorded with reviewer, type and declared coverage",
    "unassessed audio category shows puuttuu beside the no-audio measurement",
  );
}

/** A real source edit must age the assessments without deleting any of them. */
async function proveStaleness(p, mode, manifest, current) {
  // The edit happens outside the review dialog, through the ordinary element path.
  await button(p, "Sulje").click();
  await settled(p);
  await addHeadline(p, mode, current, "Alaotsikko", "Kokeile tänään");
  await openPublishedPackage(p);
  await button(p, "Avaa arviot").click();
  await settled(p);
  const after = await readAssessments(p);
  const { row } = categoryOf(after, manifest.id, "message");
  assert.equal(row.sourceChanged, true);
  for (const [category] of recorded()) {
    const { entry } = categoryOf(after, manifest.id, category);
    assert.equal(entry.status, "stale", category);
    assert.equal(entry.assessments.length, 1);
    assert.deepEqual(entry.assessments[0].staleReasons, ["source_changed"]);
  }
  const shown = await p.$eval("[data-testid=ari-assessment-message]", (node) => node.textContent);
  assert(shown.includes("Viesti: vanhentunut"), shown);
  assert(shown.includes("Arvio säilyy historiassa"), shown);
  current.staleAfterSourceEdit = after.packages
    .find((item) => item.packageId === manifest.id)
    .categories.map((entry) => `${entry.category}:${entry.status}`);
  current.checks.push("source edit ages every assessment without losing one");
}

async function acceptanceCase(bootstrap, current) {
  const { mode, width, height } = current;
  let { p, name } = await startAcceptanceCase(run, bootstrap, current, "d4-review", controls);
  current.projectId = name;
  const source = () => readFileSync(join(projectDir(name), "index.html"));
  await addHeadline(p, mode, current);
  const before = await saveVersion(p, "Ennen", current);
  await addMotion(p, mode, current);
  const after = await saveVersion(p, "Jälkeen", current);
  const authored = digest(source());
  const versionsBefore = await tool(p, "studio_versions");
  await preparePackage(p, mode, current, { before, after });
  const listed = await tool(p, "studio_list_review_packages");
  assert.equal(listed.packages.length, 1, JSON.stringify(listed));
  const read = await tool(p, "studio_read_review_package", {
    packageId: listed.packages[0].id,
  });
  assert(read.ok, JSON.stringify(read));
  const manifest = read.package;
  assert.equal(manifest.versionId, after.id);
  assert.equal(manifest.previousVersionId, before.id);
  assert.equal(manifest.coverage, "changed-motion-boundaries");
  assert(manifest.boundaries.length > 0, JSON.stringify(manifest.coverageNotes));
  current.package = {
    id: manifest.id,
    coverage: manifest.coverage,
    coverageNotes: manifest.coverageNotes,
    measured: manifest.measured,
    boundaryFrames: manifest.boundaryFrames.length,
    videoSha256: manifest.video.sha256,
  };
  const measured = measureVideo(
    join(projectDir(name), ".ari-notebook/review-packages", manifest.id, manifest.video.path),
  );
  assert.deepEqual(measured, {
    width: 1080,
    height: 1920,
    fps: 30,
    frames: manifest.measured.frames,
  });
  current.ffprobe = measured;
  await verifyShownAssets(p, name, manifest, current);
  await verifyShownBoundaries(p, manifest, current);
  await p.screenshot({ path: join(run.evidence, `${mode}-${width}-review.png`) });
  assert.equal(digest(source()), authored);
  // Preparing must not append a version of its own.
  const versions = await tool(p, "studio_versions");
  assert.equal(versions.versions.length, versionsBefore.versions.length);
  assert.equal(versions.revision, versionsBefore.revision);
  current.sourceUnchanged = { authored, afterPreparation: digest(source()) };
  await proveAssessments(p, mode, manifest, current);
  // Recording an opinion is not an edit: the ad and its version index stand still.
  assert.equal(digest(source()), authored);
  const afterAssessments = await tool(p, "studio_versions");
  assert.equal(afterAssessments.versions.length, versionsBefore.versions.length);
  assert.equal(afterAssessments.revision, versionsBefore.revision);
  await showAssessments(p, join(run.evidence, `${mode}-${width}-assessments.png`));
  await proveStaleness(p, mode, manifest, current);
  await showAssessments(p, join(run.evidence, `${mode}-${width}-assessments-stale.png`));
  await proveFailedPreparation(p, name, current);
  await p.close();
  // A fresh page in the same server session still reads the published package.
  p = await run.pageFor(name, width, height);
  const reread = await tool(p, "studio_read_review_package", { packageId: manifest.id });
  assert(reread.ok && reread.package.video.sha256 === manifest.video.sha256);
  current.checks.push(
    "visible prepare path",
    "package bound to both frozen versions",
    "real MP4 1080x1920 30 fps",
    "shown assets match the manifest byte for byte",
    "confined asset route",
    "boundary count and version binding shown",
    "preparation changed no source or version index",
    "fresh page reopen",
  );
  current.ok = true;
  await p.close();
}

/** Second invocation, against a server started after the packages were written. */
async function reopenPackages() {
  const prior = JSON.parse(
    readFileSync(
      process.env.ARI_REVIEW_PRIOR ?? "screenshots/2026-09-10-d-review-ui/browser/report.json",
      "utf8",
    ),
  );
  for (const entry of prior.modes) {
    const p = await run.pageFor(entry.projectId, entry.width, entry.height);
    await tab(p, "Tarkistus");
    await openPublishedPackage(p);
    const shown = await p.$eval("[data-testid=ari-review-package]", (node) => node.textContent);
    const listed = await tool(p, "studio_list_review_packages");
    assert.equal(listed.packages.length, 1);
    assert.equal(listed.packages[0].id, entry.package.id);
    const read = await tool(p, "studio_read_review_package", { packageId: entry.package.id });
    assert.equal(read.package.video.sha256, entry.package.videoSha256);
    assert.equal(read.package.boundaries.length, entry.boundaries.length);
    assert(shown.includes("eikä se ole laadun hyväksyntä"));
    // The assessments were written to the project, so a new server still has them.
    await button(p, "Avaa arviot").click();
    await settled(p);
    const view = await tool(p, "studio_read_review_assessments");
    const row = view.packages.find((item) => item.packageId === entry.package.id);
    assert.deepEqual(
      row.categories.map((item) => `${item.category}:${item.status}`),
      entry.staleAfterSourceEdit,
    );
    assert.equal(
      row.categories.filter((item) => item.assessments.length).length,
      entry.assessments.filter((item) => item.reviewers.length).length,
    );
    const audio = await p.$eval("[data-testid=ari-assessment-audio]", (node) => node.textContent);
    assert(audio.includes("Ääni: puuttuu"), audio);
    await showAssessments(p, join(run.evidence, `${entry.mode}-${entry.width}-reopen.png`));
    run.report.modes.push({
      projectId: entry.projectId,
      mode: entry.mode,
      width: entry.width,
      ok: true,
      packageId: entry.package.id,
      staleAfterSourceEdit: entry.staleAfterSourceEdit,
      checks: [
        "fresh server and browser listing",
        "same package id and video checksum",
        "same boundary count",
        "assessments and their staleness survive a fresh server session",
        "audio still missing after reopen",
      ],
    });
    await p.close();
  }
}
