import { expect, it } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readNotebook, saveNotebook } from "./notebook";
import { prepareReviewPackage } from "./reviewPackage";
import { ASSESSMENT_CATEGORIES } from "./reviewAssessments";
import { reviewFixture as fixture, reviewHtml as html } from "../routes/reviewTestFixture";
import { createReviewRenderer } from "./reviewRenderer";

const categories = [...ASSESSMENT_CATEGORIES];
/** The route wires the same renderer; this reaches the service directly. */
async function setup() {
  const { dir, version, adapter } = fixture();
  const save = (input: object) =>
    saveNotebook(dir, { expectedToken: readNotebook(dir).token, ...input });
  const manifest = await prepareReviewPackage(
    dir,
    version.id,
    createReviewRenderer(adapter.startRender.bind(adapter)),
    { previousVersionId: null },
  );
  const assess = (category: string) =>
    save({
      action: "assessment",
      packageId: manifest.id,
      category,
      reviewer: "Testiajo",
      reviewerType: "test_data",
      verdict: "ok",
      text: `${category} kunnossa`,
      wholeVideoWatched: true,
      checkedBoundaries: "all",
    });
  const decide = (extra: object = {}) =>
    save({
      action: "approval",
      versionId: version.id,
      packageId: manifest.id,
      decision: "approved",
      approver: "Testiajo",
      approverType: "test_data",
      note: "Katsottu kokonaan.",
      ...extra,
    });
  return { dir, version, manifest, save, assess, decide };
}

it("refuses an approval until all four categories have a stated position", async () => {
  const { dir, assess, decide, manifest } = await setup();
  expect(() => decide()).toThrow(/Viesti, Ulkoasu, Liike, Ääni[\s\S]*Tekninen mittaus ei riitä/);
  for (const category of categories.slice(0, 3)) assess(category);
  // A silent render measures no audio; that is not an audio judgement.
  expect(readNotebook(dir).notebook.assessments).toHaveLength(3);
  expect(() => decide()).toThrow(/Puuttuu: Ääni/);
  const approved = decide({
    notApplicable: [{ category: "audio", reason: "Mainoksessa ei ole ääntä." }],
  });
  const row = approved.approvals.at(-1)!;
  expect(row).toMatchObject({
    decision: "approved",
    packageId: manifest.id,
    approverType: "test_data",
    stale: false,
  });
  expect(row.notApplicable).toEqual([{ category: "audio", reason: "Mainoksessa ei ole ääntä." }]);
  expect(approved.currentApproval?.id).toBe(row.id);
  expect(approved.export).toMatchObject({ approved: true, release: "local_draft" });
  expect(approved.export.note).toMatch(/ei asiakastuotannon julkaisu/);
});

it("refuses an approval with no package at all and one bound to another version", async () => {
  const { decide, version } = await setup();
  expect(() => decide({ packageId: undefined })).toThrow(/vaatii luettavan tarkistuspaketin/);
  expect(() => decide({ versionId: `${version.id}-toinen` })).toThrow(/ei koske valittua versiota/);
});

it("keeps a rejected version rejected and reports the export as an unapproved draft", async () => {
  const { assess, decide } = await setup();
  for (const category of categories) assess(category);
  // A rejection needs no package and no assessments; it is the honest outcome
  // of looking at something and saying no.
  const rejected = decide({ decision: "rejected", note: "Hinta puuttuu ruudusta." });
  expect(rejected.approvals.at(-1)?.decision).toBe("rejected");
  expect(rejected.currentApproval).toBe(null);
  expect(rejected.export).toMatchObject({ approved: false, versionId: null });
  expect(rejected.export.note).toMatch(/Luonnos, ei hyväksytty/);
  expect(() => decide()).toThrow(/Hylättyä versiota ei voi merkitä hyväksytyksi/);
});

it("ages an approval when the sources move on, and keeps the row in history", async () => {
  const { dir, assess, decide } = await setup();
  for (const category of categories) assess(category);
  const approved = decide();
  const id = approved.approvals.at(-1)!.id;
  writeFileSync(join(dir, "index.html"), html.replace(">a<", ">b<"));
  const after = readNotebook(dir);
  const row = after.approvals.at(-1)!;
  expect(row.id).toBe(id);
  expect(row.stale).toBe(true);
  expect(row.staleReasons).toEqual(["source_changed"]);
  expect(after.currentApproval).toBe(null);
  expect(after.export).toMatchObject({ approved: false });
  expect(after.export.note).toMatch(/Luonnos, ei hyväksytty/);
});

it("ages an approval whose review package can no longer be read", async () => {
  const { dir, assess, decide, manifest } = await setup();
  for (const category of categories) assess(category);
  decide();
  rmSync(join(dir, ".ari-notebook/review-packages", manifest.id, "manifest.json"));
  const after = readNotebook(dir);
  expect(after.approvals.at(-1)?.staleReasons).toContain("package_unreadable");
  expect(after.currentApproval).toBe(null);
});

it("refuses a technical approver and an approval with no reason", async () => {
  const { assess, decide } = await setup();
  for (const category of categories) assess(category);
  expect(() => decide({ approverType: "technical" })).toThrow(/valinta ei kelpaa/);
  expect(() => decide({ note: "  " })).toThrow(/pakolliset tiedot/);
  expect(() => decide({ notApplicable: [{ category: "audio", reason: "" }] })).toThrow(
    /pakolliset tiedot/,
  );
});
