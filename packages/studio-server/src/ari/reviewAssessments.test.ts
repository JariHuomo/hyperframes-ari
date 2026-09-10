import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { versionTestProject } from "./versionTestProject";
import { saveProjectVersion } from "./versionStore";
import { projectVersionFiles, sourceRevision } from "./versionFiles";
import { prepareReviewPackage } from "./reviewPackage";
import { readNotebook, saveNotebook } from "./notebook";
import { readReviewAssessments } from "./reviewAssessmentsView";
import { bindAssessment, describeAssessments, parseAssessment } from "./reviewAssessments";

const html =
  '<html><head></head><body><div data-composition-id="main" data-width="64" data-height="96" data-duration="0.1">a</div></body></html>';
const notebookPath = ".ari-notebook/notebook.json";

async function fixture() {
  const root = versionTestProject({ "index.html": html });
  const { version } = saveProjectVersion(root, {
    expectedRevision: sourceRevision(projectVersionFiles(root)),
    expectedIndex: null,
    name: "Ensimmäinen",
  });
  const manifest = await prepareReviewPackage(root, version.id, async (_dir, output) => {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x96:r=30:d=0.1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      output,
    ]);
  });
  const save = (input: object, finish?: () => void) =>
    saveNotebook(
      root,
      {
        expectedToken: readNotebook(root).token,
        action: "assessment",
        packageId: manifest.id,
        category: "motion",
        reviewer: "Testiajo",
        reviewerType: "test_data",
        verdict: "fix",
        text: "Liike alkaa liian myöhään.",
        wholeVideoWatched: true,
        checkedBoundaries: "all",
        ...input,
      },
      finish,
    );
  return { root, manifest, save };
}

it("copies the binding from the verified manifest and refuses a mismatched claim", async () => {
  const { manifest } = await fixture();
  const input = {
    category: "layout",
    reviewer: "Tarkistaja",
    reviewerType: "external_agent",
    verdict: "ok",
    text: "Asettelu kestää.",
    wholeVideoWatched: false,
    checkedBoundaries: [],
  };
  const bound = bindAssessment(manifest, input);
  expect(bound).toMatchObject({
    packageId: manifest.id,
    versionId: manifest.versionId,
    packageRevision: manifest.sourceRevision,
    packageCoverage: manifest.coverage,
  });
  expect(() => bindAssessment(manifest, { ...input, versionId: "toinen" })).toThrow(
    "ei vastaa tarkistuspaketin versiota",
  );
  // Indexes are deduplicated and sorted so a claim reads the same every time.
  const many = { ...manifest, boundaries: [1, 2, 3].map(() => ({})) } as typeof manifest;
  expect(
    bindAssessment(many, { ...input, checkedBoundaries: [2, 0, 2] }).checkedBoundaries,
  ).toEqual([0, 2]);
});

it("survives a fresh read and keeps earlier assessments when a later save fails midway", async () => {
  const { root, manifest, save } = await fixture();
  const first = save({});
  expect(first.notebook.assessments).toHaveLength(1);
  const before = readFileSync(join(root, notebookPath));
  expect(() =>
    save({ category: "message", reviewer: "Katkos" }, () => {
      throw new Error("historian kirjaus epäonnistui");
    }),
  ).toThrow("historian kirjaus");
  // Byte-exact restore: the failed row is gone and the first one is untouched.
  expect(readFileSync(join(root, notebookPath))).toEqual(before);
  const reopened = readNotebook(root);
  expect(reopened.notebook.assessments).toHaveLength(1);
  expect(reopened.notebook.assessments[0]).toMatchObject({
    packageId: manifest.id,
    reviewerType: "test_data",
    category: "motion",
  });
  const view = readReviewAssessments(root);
  expect(view.packages[0]!.categories.map((item) => item.status)).toEqual([
    "missing",
    "missing",
    "current",
    "missing",
  ]);
});

it("reads a notebook written before assessments existed as having none", async () => {
  const { root, save } = await fixture();
  save({});
  const stored = JSON.parse(readFileSync(join(root, notebookPath), "utf8"));
  delete stored.assessments;
  writeFileSync(join(root, notebookPath), JSON.stringify(stored, null, 2) + "\n");
  expect(readNotebook(root).notebook.assessments).toEqual([]);
  expect(
    readReviewAssessments(root).packages[0]!.categories.every((item) => item.status === "missing"),
  ).toBe(true);
});

it("always reports four categories and refuses a stored row it cannot trust", () => {
  const row = {
    id: "a",
    packageId: "p",
    versionId: "v",
    packageRevision: "r",
    packageCoverage: "first-version",
    category: "audio" as const,
    reviewer: "Ihminen",
    reviewerType: "human" as const,
    createdAt: "2026-09-10T00:00:00.000Z",
    wholeVideoWatched: true,
    checkedBoundaries: "all" as const,
    verdict: "ok" as const,
    text: "Ääni kuulostaa hyvältä.",
  };
  expect(parseAssessment(row)).toEqual(row);
  expect(() => parseAssessment({ ...row, reviewerType: "technical" })).toThrow();
  expect(() => parseAssessment({ ...row, verdict: "hyväksytty" })).toThrow();
  const described = describeAssessments([row], [{ id: "p", readable: true }], "r");
  expect(described[0]!.categories.map((item) => item.category)).toEqual([
    "message",
    "layout",
    "motion",
    "audio",
  ]);
  expect(described[0]!.categories.at(-1)!.status).toBe("current");
  expect(
    describeAssessments([row], [{ id: "p", readable: true }], "muu")[0]!.categories.at(-1),
  ).toMatchObject({ status: "stale" });
});
