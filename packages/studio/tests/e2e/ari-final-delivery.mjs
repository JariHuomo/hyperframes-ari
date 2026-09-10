/**
 * Ari · whole-delivery acceptance (A1–D7) on ONE synthetic ad.
 *
 * Four visible cases — `ui-only` and `mixed` at 1280×800 and 1440×900 — build
 * the same ad with the current creation actions, never by hand-editing a
 * source. Each case then freezes it, proves a real before/after picture
 * difference, prepares a review package, records four `test_data` assessments,
 * approves the version locally, stops and resumes the work, exhausts the repair
 * rounds, walks the error paths and exports a real MP4. A separate reopen phase
 * replays every case against a fresh server and browser session.
 *
 * Nothing here is a human test and nothing here is a release.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  ariaSelect,
  importSyntheticImage,
  panelTab as tab,
  waitComparisonReady,
  settled,
  startAcceptanceCase,
  tool,
} from "./ari-acceptance-browser.mjs";
import {
  button,
  controls,
  notebookJourney,
  notebookRun,
  finishCase,
  approveVisibly,
  prepareRepairVisibly,
  prepareRepairWithCommand,
  proveRoundLimitReached,
  readNotebook as read,
  stopWorkVisibly,
  updateNotebook,
  refusal,
  reopenedWithStopHistory,
  unchangedAround,
} from "./ari-notebook-helpers.mjs";
import { digest, recordAssessment, saveVersion, showAssessments } from "./ari-review-helpers.mjs";
import {
  CUSTOM_EASE,
  GAP,
  LOCKED,
  NEXT,
  addMasterMotion,
  closeDialog,
  editElement,
  editScene,
  normalizedSources,
  removedDependency,
  selectNested,
  sourceOf,
  staleTarget,
} from "./ari-final-helpers.mjs";
import { exportedVideo, faultyExport } from "./ari-final-export.mjs";

const evidence = process.env.ARI_FINAL_EVIDENCE ?? "screenshots/2026-09-10-final-delivery/browser";
const reopen = process.env.ARI_FINAL_REOPEN;
const SOURCE_FILES = ["index.html", "scenes/avaus.html", "scenes/oma.html"];
/** Scene-local start of the one motion; the master time is derived from it. */
const LOCAL_MOTION = 0.4;
const run = await notebookRun(evidence, {
  hash: "?v=1&t=0&tab=design&rc=0",
  // One browser context for every case: `Browser.setDownloadBehavior` targets
  // the default context, so an isolated one silently drops the exported file.
  isolatedSessions: false,
  // Every refusal this journey provokes on purpose is a 409 from one of the two
  // confined routes. The injected export failure never reaches the network: it
  // is answered inside the page, so it is not an HTTP error at all.
  expectedHttpError: (error) =>
    error.status === 409 &&
    /\/(versions\/operations|review\/prepare)$/.test(new URL(error.url).pathname),
});

/** Stage 1 — the ad itself: media, copy, scenes, an own copy and one motion. */
async function buildAd(p, entry) {
  const shelf = await importSyntheticImage(p, button);
  const asset = shelf.assets[0];
  entry.asset = { path: asset.path, checksum: asset.checksum };
  assert(
    (await editElement(p, entry, { kind: "background", name: "Tausta", color: "#123c5a" })).ok,
  );
  assert((await editElement(p, entry, { kind: "text", name: "Pääviesti", text: LOCKED })).ok);
  assert(
    (
      await editElement(p, entry, {
        kind: "image",
        name: "Tuotekuva",
        imagePath: asset.path,
        checksum: asset.checksum,
      })
    ).ok,
  );
  const opening = await editScene(p, entry, "add", {
    name: "Avaus",
    fileName: "avaus.html",
    duration: 2,
  });
  assert.equal(opening.afterDuration, 9);
  const shared = await editScene(p, entry, "duplicate", { target: opening.target });
  assert.equal(shared.affectsInstances, 2);
  const own = await editScene(p, entry, "detach", {
    target: shared.target,
    fileName: "oma.html",
  });
  assert.equal(own.affectsInstances, 1);
  assert.equal(own.selectionSourceFile, "scenes/oma.html");
  entry.structure = { opening: opening.target, shared: shared.target, instance: own.instance };
  entry.checks.push(
    "the ad is created from a template and filled with imported media, copy, a background and scenes",
    "a second placement of the opening scene becomes its own independent source",
  );
  await addMotionToOwnCopy(p, entry);
}
/** The motion goes on the detached copy, positioned in master time. */
async function addMotionToOwnCopy(p, entry) {
  const nested = await tool(p, "studio_elements", { sourceFile: "scenes/oma.html" });
  const target = nested.elements[0];
  assert(target, JSON.stringify(nested));
  const look = await tool(p, "studio_look");
  const scene = look.scenes.find((row) => row.sourceFile === "scenes/oma.html");
  assert(scene, JSON.stringify(look.scenes?.map((row) => row.sourceFile)));
  const placement = scene.instances[0];
  assert.deepEqual(
    { rate: placement.playbackRate, start: placement.playbackStart },
    { rate: 1, start: 0 },
  );
  const master = placement.masterStart + LOCAL_MOTION;
  await tool(p, "studio_seek", { time: master });
  await selectNested(p, entry, target.handle, "scenes/oma.html");
  await tab(p, "Liike");
  const motion = await addMasterMotion(
    p,
    entry,
    target.handle,
    placement.hostId,
    master,
    LOCAL_MOTION,
    "scenes/oma.html",
  );
  const source = sourceOf(run.root, entry.projectId, "scenes/oma.html");
  assert(source.includes(CUSTOM_EASE), "the saved scene source carries the custom curve");
  entry.motion = { master, ease: CUSTOM_EASE, receipts: motion };
  entry.checks.push(
    "one motion is added in master time on the detached placement and given an explicit custom curve",
  );
}

/** Stage 2 — two frozen versions and a real picture difference at one time. */
async function proveBeforeAfter(p, entry) {
  const before = await saveVersion(p, "Ennen", entry);
  assert(
    (await editElement(p, entry, { kind: "background", name: "Korostus", color: "#a8d8eb" })).ok,
  );
  assert(
    (await editElement(p, entry, { kind: "text", name: "Lisäys", text: "Uusi hyvä hetki" })).ok,
  );
  const after = await saveVersion(p, "Jälkeen", entry);
  assert.notEqual(before.id, after.id);
  entry.versions = { before: before.id, after: after.id };
  entry.versionList = (await tool(p, "studio_versions")).versions.map((row) => ({
    id: row.id,
    name: row.name,
  }));
  await button(p, "Versiot / vertailu").click();
  await settled(p);
  if (entry.mode === "ui-only") {
    entry.selectedVersions = [
      await ariaSelect(p, "Edellinen versio", before.id),
      await ariaSelect(p, "Nykyinen versio", after.id),
    ];
    assert.deepEqual(entry.selectedVersions, [[before.id], [after.id]]);
    await button(p, "Avaa vertailu").click();
  } else {
    const receipt = await tool(p, "studio_compare_versions", {
      beforeId: before.id,
      afterId: after.id,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    entry.receipts.push(receipt);
  }
  await waitComparisonReady(p);
  await comparePictures(p, entry);
  await button(p, "Säilytä muutos").click();
  await settled(p);
  await closeDialog(p);
}
async function comparePictures(p, entry) {
  const frames = await p.$$("dialog iframe");
  assert.equal(frames.length, 2);
  await seekComparison(p, frames);
  const runtime = await Promise.all(
    frames.map(async (frame) =>
      (await frame.contentFrame()).evaluate(() => ({
        time: window.__player.getTime(),
        text: document.body.innerText,
      })),
    ),
  );
  assert.equal(runtime[0].time, runtime[1].time);
  assert(!runtime[0].text.includes("Uusi hyvä hetki"), JSON.stringify(runtime));
  assert(runtime[1].text.includes("Uusi hyvä hetki"), JSON.stringify(runtime));
  const hashes = [];
  for (const [index, frame] of frames.entries()) {
    const bytes = await frame.screenshot();
    writeFileSync(join(run.evidence, `${entry.mode}-${entry.width}-version-${index}.png`), bytes);
    hashes.push(digest(bytes));
  }
  assert.notEqual(hashes[0], hashes[1], "before and after must differ at the same time");
  entry.comparison = { hashes, runtime };
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-comparison.png`) });
  entry.checks.push(
    "two frozen versions replay side by side and differ visibly at the same shared time",
  );
}

/** Both replays are moved to the same later time; at zero the ad is still empty. */
async function seekComparison(p, frames) {
  await p.$eval('input[aria-label="Vertailuaika"]', (node) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(node, "1.2");
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await p.locator('[aria-label="Vertailuaika"]').click();
  await p.keyboard.press("ArrowRight");
  const runtimes = await Promise.all(frames.map((frame) => frame.contentFrame()));
  for (const runtime of runtimes)
    await runtime.waitForFunction(() => window.__player.getTime() > 1);
  await p.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Stage 3 — a write that names a source version the project has moved past. */
async function proveStaleTarget(p, entry) {
  const stale = await unchangedAround(p, entry, () => staleTarget(p));
  assert.match(JSON.stringify(stale), /muuttunut|muuttui|vanhent/i, JSON.stringify(stale));
  entry.errorPaths = { stale };
  entry.checks.push(
    "a write naming a source version the project moved past is refused and writes nothing",
  );
}

/**
 * Stage 6b — a frozen version whose own dependency is deleted underneath it.
 * It is saved AFTER the approved one and from a different source state: the
 * version store shares one blob between identical files, so a version frozen
 * from unchanged bytes would take the published package's dependency with it.
 */
async function proveRemovedDependency(p, entry) {
  const broken = await saveVersion(p, "Rikottava", entry);
  entry.brokenVersion = broken.id;
  const removed = await removedDependency(p, entry, run.root);
  assert.equal(removed.versionId, broken.id);
  entry.errorPaths.removed = removed;
  const published = await tool(p, "studio_read_review_package", { packageId: entry.package.id });
  assert(published.ok, JSON.stringify(published));
  entry.checks.push(
    "a version whose frozen dependency was deleted fails preparation and publishes no package",
    "the already published package still reads: it owns its own copies",
  );
}

/** Stage 4 — a real review package, four assessments and the local approval. */
async function reviewAndApprove(p, entry) {
  await tab(p, "Tarkistus");
  await button(p, "Tarkistuspaketti").click();
  await button(p, "Hae versiot").click();
  await settled(p);
  if (entry.mode === "mixed") {
    const receipt = await tool(p, "studio_prepare_review_package", {
      versionId: entry.versions.after,
    });
    assert(receipt.ok, JSON.stringify(receipt));
    await button(p, "Hae versiot").click();
    await settled(p);
    await p.locator("button::-p-text(Avaa paketti)").click();
  } else {
    assert.deepEqual(await ariaSelect(p, "Tarkistettava versio", entry.versions.after), [
      entry.versions.after,
    ]);
    await button(p, "Valmistele tarkistuspaketti").click();
    // The state line appears as soon as the request leaves the panel; waiting
    // for it separates "the button did nothing" from "the render is slow".
    await p.waitForFunction(
      () => document.querySelector('[data-testid="ari-review-state"]') !== null,
      { timeout: 30_000 },
    );
    entry.reviewState = await p.$eval(
      '[data-testid="ari-review-state"]',
      (node) => node.textContent,
    );
  }
  await p.waitForFunction(
    () => document.querySelector('[data-testid="ari-review-package"]') !== null,
    { timeout: 900_000 },
  );
  await settled(p);
  const listed = await tool(p, "studio_list_review_packages");
  assert.equal(listed.packages.length, 1, JSON.stringify(listed));
  const manifest = listed.packages[0];
  assert.equal(manifest.versionId, entry.versions.after);
  entry.package = { id: manifest.id, versionId: manifest.versionId, coverage: manifest.coverage };
  await button(p, "Avaa arviot").click();
  await settled(p);
  for (const category of ["message", "layout", "motion", "audio"])
    await recordAssessment(p, entry.mode, manifest.id, category, `${category} tarkastettu`);
  await showAssessments(p, join(run.evidence, `${entry.mode}-${entry.width}-assessments.png`));
  await closeDialog(p);
  await approveLocally(p, entry, manifest);
}
async function approveLocally(p, entry, manifest) {
  const decision = {
    action: "approval",
    versionId: entry.versions.after,
    packageId: manifest.id,
    decision: "approved",
    approver: "Hyväksyntäajo",
    approverType: "test_data",
    note: "Kaikki neljä osa-aluetta kirjattiin tässä ajossa testiaineistona.",
  };
  if (entry.mode === "mixed") {
    const receipt = await updateNotebook(p, entry, decision);
    assert.equal(receipt.currentApproval.decision, "approved");
    return;
  }
  await approveVisibly(p, manifest, decision);
  await closeDialog(p);
}

/** Stage 5 — the stop refuses the next tracked write on the shared path. */
async function proveStop(p, entry) {
  await notebookAction(p, entry, {
    action: "stop_work",
    by: "Hyväksyntäajo",
    byType: "test_data",
    reason: "Odotetaan asiakkaan hintaa",
  });
  const refused = await unchangedAround(p, entry, () =>
    editElement(p, entry, { kind: "text", name: "Torjuttu", text: "Ei pitäisi tallentua" }),
  );
  assert.equal(refused.ok, false, JSON.stringify(refused));
  assert.match(refusal(refused), /Työ on pysäytetty/);
  entry.stopRefusal = refusal(refused);
  await notebookAction(p, entry, {
    action: "resume_work",
    by: "Hyväksyntäajo",
    byType: "test_data",
    reason: "Hinta saatu",
  });
  entry.checks.push(
    "a stopped project refuses the next tracked source write and leaves every byte untouched",
    "Jatka pysäytettyä työtä releases the same write path without reopening the project",
  );
}
/** Every notebook decision goes through the visible control or the same tool. */
async function notebookAction(p, entry, input) {
  if (entry.mode === "mixed") return updateNotebook(p, entry, input);
  await stopWorkVisibly(p, input.action === "stop_work", input);
  await closeDialog(p);
  return { ok: true };
}

/** Stage 6 — a later source change ages the approval without losing it. */
async function ageApproval(p, entry) {
  assert(
    (await editElement(p, entry, { kind: "text", name: "Alaotsikko", text: "Kokeile tänään" })).ok,
  );
  const current = await read(p);
  const row = current.approvals.at(-1);
  assert.equal(row.decision, "approved");
  assert.deepEqual(row.staleReasons, ["source_changed"]);
  assert.equal(current.currentApproval, null);
  assert.match(current.export.note, /Luonnos, ei hyväksytty/);
  entry.agedApproval = { id: row.id, staleReasons: row.staleReasons, note: current.export.note };
  entry.checks.push(
    "a later source change ages the local approval with its reason and keeps it in history",
  );
}

/** Stage 7 — the repair-round limit and the locked approved message. */
async function proveRepairLimit(p, entry) {
  const task = await notebookRepair(p, entry);
  const locked = await unchangedAround(p, entry, () => removeLocked(p));
  assert.equal(locked.ok, false, JSON.stringify(locked));
  assert.match(refusal(locked), /Hyväksyttyä tekstiä ei muuteta/);
  entry.lockedRefusal = refusal(locked);
  for (const round of [1, 2])
    assert(
      (
        await editElement(p, entry, {
          kind: "text",
          name: `Korjaus ${round}`,
          text: `Kierros ${round}`,
        })
      ).ok,
    );
  await proveRoundLimitReached(
    p,
    entry,
    () => editElement(p, entry, { kind: "text", name: "Korjaus 3", text: "Kierros 3" }),
    GAP,
    NEXT,
  );
  entry.taskId = task;
  entry.checks.push(
    "the approved main message cannot be changed without an explicit mandate",
    "two repair rounds are consumed by real writes and the third is refused with the gap and the suggestion",
  );
}
async function notebookRepair(p, entry) {
  const plan = {
    task: "Korjaa otsikko",
    gap: GAP,
    suggestion: NEXT,
    lockLabel: "Pääviesti",
    lockText: LOCKED,
  };
  if (entry.mode === "mixed") return prepareRepairWithCommand(p, entry, plan);
  const taskId = await prepareRepairVisibly(p, plan);
  await closeDialog(p);
  return taskId;
}
async function removeLocked(p) {
  const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
  const row = listing.elements.find((element) => element.name === "Pääviesti");
  assert(row, JSON.stringify(listing.elements.map((element) => element.name)));
  return tool(p, "studio_edit_element", {
    sourceFile: "index.html",
    version: listing.version,
    action: "delete",
    target: row.target,
  });
}

async function createCase(bootstrap, entry) {
  const { p, name } = await startAcceptanceCase(run, bootstrap, entry, "final", controls);
  entry.projectId = name;
  await buildAd(p, entry);
  await proveBeforeAfter(p, entry);
  await proveStaleTarget(p, entry);
  await reviewAndApprove(p, entry);
  await proveStop(p, entry);
  await ageApproval(p, entry);
  await proveRemovedDependency(p, entry);
  await proveRepairLimit(p, entry);
  entry.export = await faultyExport(p, entry, run);
  entry.sourceHashes = normalizedSources(run.root, entry, SOURCE_FILES);
  entry.notebook = await read(p);
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-final.png`) });
  entry.checks.push(
    "a failed export hides the previous download, the retry renders a real MP4 and its receipt names the source version",
  );
  await finishCase(p, entry);
}

async function reopenCase(entry) {
  const { p, current } = await reopenedWithStopHistory(run, entry, [
    "stop:Hyväksyntäajo",
    "resume:Hyväksyntäajo",
  ]);
  assert.equal(current.notebook.locks[0].text, LOCKED);
  const task = current.repair.tasks.find((row) => row.id === entry.taskId);
  assert.deepEqual({ used: task.used, exhausted: task.exhausted }, { used: 2, exhausted: true });
  const row = current.approvals.at(-1);
  assert.equal(row.id, entry.agedApproval.id);
  assert.deepEqual(row.staleReasons, entry.agedApproval.staleReasons);
  assert.equal(current.currentApproval, null);
  const versions = await tool(p, "studio_versions");
  for (const id of Object.values(entry.versions))
    assert(
      versions.versions.some((version) => version.id === id),
      id,
    );
  const packages = await tool(p, "studio_list_review_packages");
  assert.equal(packages.packages[0].id, entry.package.id);
  assert.deepEqual(normalizedSources(run.root, entry, SOURCE_FILES), entry.sourceHashes);
  const resumed = await tool(p, "studio_resume_work");
  assert(resumed.ok, JSON.stringify(resumed));
  assert.deepEqual(normalizedSources(run.root, entry, SOURCE_FILES), entry.sourceHashes);
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-reopened.png`) });
  run.report.modes.push({
    ...entry,
    checks: [
      "a fresh server process and browser session keep the notebook, versions, package, approval and stop history",
      "resuming the work in the new session repeats no completed operation and rewrites no source byte",
    ],
    ok: true,
  });
  await p.close();
}

await notebookJourney(run, reopen, {
  createCase,
  reopenCase,
  finish: () => {
    if (reopen) return;
    const hashes = run.report.modes.map((entry) => JSON.stringify(entry.sourceHashes));
    assert.equal(new Set(hashes).size, 1, hashes.join("\n"));
    run.report.equivalentSources = true;
    exportedVideo(run.report);
    writeFileSync(join(run.evidence, "cases.json"), JSON.stringify(run.report.modes, null, 2));
  },
});
// Per case: the stopped write, the locked message and the third repair round are
// refused by the operations route; the deleted dependency is refused by the
// preparation route. The stale-target write never leaves the browser.
if (run.report.ok && !reopen) {
  const routes = run.report.deliberateRefusals.map((error) =>
    new URL(error.url).pathname.split("/").slice(-2).join("/"),
  );
  const counted = routes.reduce((all, route) => ({ ...all, [route]: (all[route] ?? 0) + 1 }), {});
  assert.deepEqual(counted, {
    "versions/operations": run.report.modes.length * 3,
    "review/prepare": run.report.modes.length,
  });
}
