import { expect, it } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { versionTestProject } from "./versionTestProject";
import { saveProjectVersion } from "./versionStore";
import { sourceRevision, projectVersionFiles } from "./versionFiles";
import { prepareReviewPackage } from "./reviewPackage";
import { listReviewPackages } from "./reviewList";

const html =
  '<html><head></head><body><div data-composition-id="main" data-width="64" data-height="96" data-duration="0.1">a</div></body></html>';
function fixture() {
  const root = versionTestProject({ "index.html": html });
  const { version } = saveProjectVersion(root, {
    expectedRevision: sourceRevision(projectVersionFiles(root)),
    expectedIndex: null,
    name: "Ensimmäinen",
  });
  return { root, version };
}
const render = (_dir: string, output: string) => {
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
  return Promise.resolve();
};

it("lists published packages newest first without touching private staging", async () => {
  const { root, version } = fixture();
  expect(listReviewPackages(root)).toEqual([]);
  const first = await prepareReviewPackage(root, version.id, render);
  const second = await prepareReviewPackage(root, version.id, render);
  mkdirSync(join(root, ".ari-notebook/review-packages/.preparing-abc"), { recursive: true });
  const rows = listReviewPackages(root);
  expect(rows.map((row) => row.id)).toEqual(
    [second, first].sort((a, b) => b.createdAt - a.createdAt).map((m) => m.id),
  );
  expect(rows[0]).toMatchObject({
    versionId: version.id,
    versionName: "Ensimmäinen",
    previousVersionId: null,
    coverage: "first-version",
    boundaryCount: 0,
    readable: true,
  });
  expect(rows[0]!.measured).toMatchObject({ width: 64, height: 96, fps: 30 });
});

it("marks a damaged package unreadable instead of failing the whole listing", async () => {
  const { root, version } = fixture();
  const good = await prepareReviewPackage(root, version.id, render);
  const broken = await prepareReviewPackage(root, version.id, render);
  writeFileSync(
    join(root, ".ari-notebook/review-packages", broken.id, "manifest.json"),
    JSON.stringify({ ...broken, versionId: "" }),
  );
  const rows = listReviewPackages(root);
  expect(rows.find((row) => row.id === good.id)?.readable).toBe(true);
  const damaged = rows.find((row) => row.id === broken.id);
  expect(damaged?.readable).toBe(false);
  expect(damaged?.error).toMatch(/versiosidonta/);
});

it("stays empty when nothing was ever prepared and after the directory is removed", async () => {
  const { root, version } = fixture();
  await prepareReviewPackage(root, version.id, render);
  rmSync(join(root, ".ari-notebook/review-packages"), { recursive: true, force: true });
  expect(listReviewPackages(root)).toEqual([]);
});
