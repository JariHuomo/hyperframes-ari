/**
 * Ari · D6–D7 acceptance: Pysäytä työ and the local version approval
 *
 * One synthetic ad per case, built with the current actions. It stops the work
 * and proves the refusal on the SHARED write path — from the visible dialog and
 * from the agent tool, with the sources, the version index and the undo history
 * captured immediately before and after. It then resumes, prepares a real review
 * package, records all four assessments as `test_data`, approves the version
 * locally, exports a draft MP4, moves the sources on and watches the approval
 * age. Nothing here is a human test and nothing here is a release.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  ariaSelect,
  elementDialogResult,
  panelTab as tab,
  settled,
  startAcceptanceCase,
  tool,
} from "./ari-acceptance-browser.mjs";
import {
  button as notebookButton,
  fill,
  notebookJourney,
  notebookRun,
  finishCase,
  approveVisibly,
  openNotebook,
  stopWorkVisibly,
  updateNotebook,
  projectState as state,
  readNotebook as read,
  refusal,
  reopenedWithStopHistory,
  unchangedAround,
} from "./ari-notebook-helpers.mjs";
import {
  addHeadline,
  digest,
  measureVideo,
  projectDir as dirOf,
  recordAssessment,
  saveVersion,
  reviewControls as controls,
  showAssessments,
} from "./ari-review-helpers.mjs";

const evidence =
  process.env.ARI_STOP_EVIDENCE ?? "screenshots/2026-09-10-d6-d7-stop-approval/browser";
const reopen = process.env.ARI_STOP_REOPEN;
const REASON = "Odotetaan asiakkaan hintaa";
const RESUME = "Hinta saatu";
const categories = ["message", "layout", "motion", "audio"];
const run = await notebookRun(evidence, {
  hash: "?v=1&t=0&tab=design&rc=0",
  // The refusals under test: a stopped write on the operations route, and the
  // approval the notebook route refuses before all four categories exist.
  expectedHttpError: (error) =>
    error.status === 409 && /\/(notebook|versions\/operations)$/.test(new URL(error.url).pathname),
});
/**
 * Several dialogs share the "Sulje" spelling, so closing one is only finished
 * when no dialog is left. Clicking a control behind an open modal silently does
 * nothing and shows up much later as a click timeout.
 */
async function closeDialog(p) {
  await p.locator("dialog button::-p-text(Sulje)").click();
  await p.waitForFunction(() => document.querySelector("dialog") === null);
}
/** The one visible element write, used both as a refused attempt and a real one. */
async function tryElementWrite(p, entry, name, copy) {
  if (entry.mode === "mixed") {
    const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
    return tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: listing.version,
      action: "add",
      kind: "text",
      name,
      text: copy,
    });
  }
  await notebookButton(p, "Elementit").click();
  await settled(p);
  await ariaSelect(p, "Tyyppi", "text");
  await fill(p, "Nimi", name);
  await fill(p, "Teksti", copy);
  await notebookButton(p, "Lisää elementti").click();
  const result = await elementDialogResult(p);
  await closeDialog(p);
  return result;
}
/** Stop or resume, once through the visible control and once through the tool. */
async function setStopped(p, entry, stop) {
  const input = {
    action: stop ? "stop_work" : "resume_work",
    by: "Hyväksyntäajo",
    byType: "test_data",
    reason: stop ? REASON : RESUME,
  };
  if (entry.mode === "mixed") return updateNotebook(p, entry, input);
  await stopWorkVisibly(p, stop, input);
  await closeDialog(p);
  return { ok: true };
}
/** Both paths meet the same refusal: the stop lives in the server, not a button. */
async function proveStopRefuses(p, entry) {
  const visible = await unchangedAround(p, entry, () =>
    tryElementWrite(p, entry, "Torjuttu", "Ei pitäisi tallentua"),
  );
  assert.equal(visible.ok, false, JSON.stringify(visible));
  assert.match(refusal(visible), /Työ on pysäytetty/);
  assert.match(refusal(visible), new RegExp(REASON));
  const viaTool = await unchangedAround(p, entry, async () => {
    const listing = await tool(p, "studio_elements", { sourceFile: "index.html" });
    return tool(p, "studio_edit_element", {
      sourceFile: "index.html",
      version: listing.version,
      action: "add",
      kind: "text",
      name: "Torjuttu agentilta",
      text: "Ei pitäisi tallentua",
    });
  });
  assert.equal(viaTool.ok, false, JSON.stringify(viaTool));
  assert.match(refusal(viaTool), /Työ on pysäytetty/);
  entry.stopRefusals = [refusal(visible), refusal(viaTool)];
  entry.checks.push(
    "a stopped project refuses the next tracked source write from the panel AND from the agent tool",
    "both refusals leave the sources, the source revision, the version index and the undo history untouched",
  );
}
/** Writing things down is not a source write, so it stays available. */
async function proveNotebookStaysOpen(p, entry) {
  const before = await state(p, entry.projectId);
  const receipt = await updateNotebook(p, entry, {
    action: "observation",
    author: "Hyväksyntäajo",
    // A browser journey is technical work; it never signs a human's name.
    authorType: "technical",
    coverage: "Ei katsottu — automaattinen hyväksyntäajo",
    text: "Hinta puuttuu ruudusta.",
    revision: (await read(p)).revision,
  });
  assert(receipt.ok, JSON.stringify(receipt));
  assert.deepEqual(await state(p, entry.projectId), before);
  entry.checks.push("the notebook and its observations stay writable while the work is stopped");
}
async function prepareReview(p, entry, version) {
  await tab(p, "Tarkistus");
  await notebookButton(p, "Tarkistuspaketti").click();
  await notebookButton(p, "Hae versiot").click();
  await settled(p);
  if (entry.mode === "mixed") {
    const receipt = await tool(p, "studio_prepare_review_package", { versionId: version.id });
    assert(receipt.ok, JSON.stringify(receipt));
    await notebookButton(p, "Hae versiot").click();
    await settled(p);
    await p.locator("button::-p-text(Avaa paketti)").click();
  } else {
    await ariaSelect(p, "Tarkistettava versio", version.id);
    await notebookButton(p, "Valmistele tarkistuspaketti").click();
  }
  await p.waitForFunction(
    () => document.querySelector('[data-testid="ari-review-package"]') !== null,
    { timeout: 300_000 },
  );
  await settled(p);
  const listed = await tool(p, "studio_list_review_packages");
  assert.equal(listed.packages.length, 1, JSON.stringify(listed));
  return listed.packages[0];
}
/** Exports a real local MP4 and reads what the receipt calls it. */
async function exportDraft(p, entry, expected) {
  await tab(p, "Tarkistus");
  await p.waitForFunction(() => document.querySelector("dialog") === null);
  await p.waitForFunction(() => {
    const control = [...document.querySelectorAll("button")].find((node) =>
      node.textContent.includes("Vie video"),
    );
    return Boolean(control) && !control.disabled;
  });
  await p.locator("button::-p-text(Vie video)").click();
  await p.waitForFunction(
    () => document.querySelector("[data-testid=ari-export-approval]") !== null,
    { timeout: 300_000 },
  );
  await p.waitForFunction(
    (expected) =>
      document.querySelector("[data-testid=ari-export-approval]")?.dataset.exportApproval ===
      expected,
    { timeout: 60_000 },
    expected,
  );
  const shown = await p.$eval("[data-testid=ari-export-approval]", (node) => node.textContent);
  assert.match(shown, /ei asiakastuotannon julkaisu/);
  const section = 'section[aria-label="Videon vienti"]';
  const revision = await p.$eval(
    `${section} [data-source-revision]`,
    (node) => node.dataset.sourceRevision,
  );
  // Scoped to the export section: the frame-evidence panel also offers downloads.
  await p.waitForSelector(`${section} a[download]`);
  const file = await p.$eval(`${section} a[download]`, (node) => node.getAttribute("download"));
  const measured = measureVideo(
    join(run.root, "packages/studio/data/renders", entry.projectId, file),
  );
  assert.equal(measured.fps, 30);
  entry.exports = [...(entry.exports ?? []), { expected, revision, file, shown, measured }];
  return revision;
}
async function approveVersion(p, entry, manifest, version) {
  const decision = {
    action: "approval",
    versionId: version.id,
    packageId: manifest.id,
    decision: "approved",
    approver: "Hyväksyntäajo",
    approverType: "test_data",
    note: "Kaikki neljä osa-aluetta on kirjattu tässä ajossa testiaineistona.",
  };
  // Approving before every category has a stated position must be refused.
  const early = await tool(p, "studio_update_notebook", {
    expectedToken: (await read(p)).token,
    ...decision,
    versionId: version.id,
  });
  entry.receipts.push(early);
  assert.equal(early.ok, false, JSON.stringify(early));
  assert.match(refusal(early), /Puuttuu:/);
  assert.match(refusal(early), /Tekninen mittaus ei riitä/);
  entry.earlyApprovalRefusal = refusal(early);
  await notebookButton(p, "Avaa arviot").click();
  await settled(p);
  for (const category of categories)
    await recordAssessment(p, entry.mode, manifest.id, category, `${category} tarkastettu`);
  await showAssessments(p, join(run.evidence, `${entry.mode}-${entry.width}-assessments.png`));
  if (entry.mode === "mixed") {
    const receipt = await updateNotebook(p, entry, decision);
    assert(receipt.ok, JSON.stringify(receipt));
    assert.equal(receipt.currentApproval.decision, "approved");
    // The review dialog is modal; leaving it open would swallow the export click.
    await closeDialog(p);
    return;
  }
  await closeDialog(p);
  await approveVisibly(p, manifest, decision);
  await closeDialog(p);
}
async function proveApprovalAges(p, entry, manifest) {
  const receipt = await addHeadline(p, entry.mode, entry, "Alaotsikko", "Kokeile tänään");
  assert(receipt.ok !== false, JSON.stringify(receipt));
  const current = await read(p);
  const row = current.approvals.at(-1);
  assert.equal(row.decision, "approved");
  assert.equal(row.stale, true);
  assert.deepEqual(row.staleReasons, ["source_changed"]);
  assert.equal(current.currentApproval, null);
  assert.equal(current.export.approved, false);
  assert.match(current.export.note, /Luonnos, ei hyväksytty/);
  entry.agedApproval = {
    id: row.id,
    packageId: manifest.id,
    staleReasons: row.staleReasons,
    exportNote: current.export.note,
  };
  entry.checks.push(
    "a later source change ages the approval with its reason and keeps the decision in history",
  );
}
async function createCase(bootstrap, entry) {
  const { p, name } = await startAcceptanceCase(run, bootstrap, entry, "d6d7", controls);
  entry.projectId = name;
  const source = () => readFileSync(join(dirOf(run.root, name), "index.html"));
  await addHeadline(p, entry.mode, entry);
  const authored = digest(source());

  await setStopped(p, entry, true);
  await proveStopRefuses(p, entry);
  await proveNotebookStaysOpen(p, entry);
  assert.equal(digest(source()), authored);
  await openNotebook(p);
  await p.$eval('[aria-label="Pysäytyshistoria"]', (e) => e.scrollIntoView({ block: "center" }));
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-stopped.png`) });
  await closeDialog(p);

  await setStopped(p, entry, false);
  assert((await tryElementWrite(p, entry, "Jatkettu", "Kirjoitus onnistuu taas")).ok);
  entry.checks.push("Jatka työtä releases the same write path without reopening the project");
  const version = await saveVersion(p, "Tarkistettava", entry);
  const manifest = await prepareReview(p, entry, version);
  entry.package = { id: manifest.id, versionId: manifest.versionId };
  await approveVersion(p, entry, manifest, version);
  entry.checks.push(
    "a local approval is refused until all four categories have a stated position",
    "an approved version is recorded with a named decider and a non-technical role",
  );
  entry.approvedRevision = await exportDraft(p, entry, "approved");
  await proveApprovalAges(p, entry, manifest);
  entry.draftRevision = await exportDraft(p, entry, "draft");
  assert.notEqual(entry.draftRevision, entry.approvedRevision);
  entry.checks.push(
    "a local export always succeeds and its receipt names the approved version as a local draft",
    "the export after the source change is called luonnos, ei hyväksytty",
  );
  await openNotebook(p);
  await p.$eval('[data-testid="ari-approval-list"]', (e) => e.scrollIntoView({ block: "center" }));
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-approval.png`) });
  entry.notebook = await read(p);
  await closeDialog(p);
  await finishCase(p, entry);
}
async function reopenCase(entry) {
  const { p, current } = await reopenedWithStopHistory(run, entry, [
    "stop:Hyväksyntäajo",
    "resume:Hyväksyntäajo",
  ]);
  assert.equal(current.repair.stop, null);
  const row = current.approvals.at(-1);
  assert.equal(row.id, entry.agedApproval.id);
  assert.deepEqual(row.staleReasons, entry.agedApproval.staleReasons);
  assert.equal(current.currentApproval, null);
  assert.equal(current.export.approved, false);
  await openNotebook(p);
  await p.$eval('[aria-label="Pysäytyshistoria"]', (e) => e.scrollIntoView({ block: "center" }));
  const history = await p.$eval('[aria-label="Pysäytyshistoria"]', (e) => e.textContent);
  assert.match(history, new RegExp(REASON));
  assert.match(history, new RegExp(RESUME));
  const approvals = await p.$eval('[data-testid="ari-approval-list"]', (e) => e.textContent);
  assert.match(approvals, /Vanhentunut: mainos muuttui/);
  const receipt = await p.$eval('[data-testid="ari-approval-export"]', (e) => e.textContent);
  assert.match(receipt, /luonnos, ei hyväksytty/);
  await p.screenshot({ path: join(run.evidence, `${entry.mode}-${entry.width}-reopened.png`) });
  run.report.modes.push({
    ...entry,
    checks: [
      "a fresh server process and browser session keep the stop history and the aged approval",
      "the reopened export receipt still says luonnos, ei hyväksytty",
    ],
    ok: true,
  });
  await p.close();
}
await notebookJourney(run, reopen, { createCase, reopenCase });
// Per case while building: two stopped writes and one early approval.
if (run.report.ok) assert.equal(run.report.deliberateRefusals.length, reopen ? 0 : 12);
