import { expect, it } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readVersionIndex } from "../ari/versionStore";
import { projectVersionFiles, sourceRevision } from "../ari/versionFiles";
import { readNotebook } from "../ari/notebook";
import {
  reviewFixture as fixture,
  reviewHtml as html,
  reviewJson as json,
} from "./reviewTestFixture";

const base = "/ari/projects/p/review";
type Row = {
  packageId: string;
  readable: boolean;
  sourceChanged: boolean;
  measured: { audio: boolean } | null;
  categories: {
    category: string;
    status: string;
    assessments: {
      id: string;
      reviewer: string;
      reviewerType: string;
      packageCoverage: string;
      checkedBoundaries: unknown;
      stale: boolean;
      staleReasons: string[];
    }[];
  }[];
};
const rows = (result: Record<string, never>) => result.packages as unknown as Row[];
const category = (row: Row, name: string) => row.categories.find((item) => item.category === name)!;

async function prepare(app: { request: typeof fetch }, versionId: string) {
  const prepared = await json(
    await app.request(`${base}/prepare`, { method: "POST", body: JSON.stringify({ versionId }) }),
  );
  expect(prepared.ok).toBe(true);
  return (prepared.package as { id: string }).id;
}
const read = async (app: { request: typeof fetch }) =>
  json(await app.request(`${base}/assessments`));
const post = (app: { request: typeof fetch }, body: object) =>
  app.request(`${base}/assessments`, { method: "POST", body: JSON.stringify(body) });
const entry = (packageId: string, token: string | null, extra: object = {}) => ({
  packageId,
  expectedToken: token,
  category: "message",
  reviewer: "Testiajo",
  reviewerType: "test_data",
  verdict: "ok",
  text: "Pääviesti luettavissa.",
  wholeVideoWatched: true,
  checkedBoundaries: "all",
  ...extra,
});

it("records attributed assessments, shows unassessed categories as missing and keeps them out of the ad", async () => {
  const { app, dir, version } = fixture();
  const id = await prepare(app, version.id);
  const indexToken = readVersionIndex(dir).token;
  const before = await read(app);
  expect(rows(before)).toHaveLength(1);
  for (const item of rows(before)[0]!.categories) expect(item.status).toBe("missing");
  const saved = await json(await post(app, entry(id, before.token as unknown as string)));
  expect(saved.stage).toBe("assessment_recorded");
  const row = rows(saved)[0]!;
  expect(category(row, "message").status).toBe("current");
  expect(category(row, "message").assessments[0]).toMatchObject({
    reviewer: "Testiajo",
    reviewerType: "test_data",
    packageCoverage: "first-version",
    stale: false,
  });
  // Three unassessed categories stay missing; a silent render never fills audio.
  expect(row.measured!.audio).toBe(false);
  for (const name of ["layout", "motion", "audio"])
    expect(category(row, name).status).toBe("missing");
  // Nothing about the ad moved: no source file, no version index, no operations.
  expect(projectVersionFiles(dir)).toEqual({ "index.html": Buffer.from(html) });
  expect(readVersionIndex(dir).token).toBe(indexToken);
  expect(readNotebook(dir).notebook.operations).toEqual([]);
});

it("refuses a stale token and loses neither session's assessment", async () => {
  const { app, version } = fixture();
  const id = await prepare(app, version.id);
  const first = await read(app);
  const second = await read(app);
  expect(second.token).toBe(first.token);
  await post(app, entry(id, first.token as unknown as string, { reviewer: "Istunto A" }));
  const conflict = await post(
    app,
    entry(id, second.token as unknown as string, { category: "layout", reviewer: "Istunto B" }),
  );
  expect(conflict.status).toBe(409);
  expect((await json(conflict)).error).toMatch(/Muistikirja muuttui/);
  const refreshed = await read(app);
  const retry = await json(
    await post(
      app,
      entry(id, refreshed.token as unknown as string, {
        category: "layout",
        reviewer: "Istunto B",
      }),
    ),
  );
  const row = rows(retry)[0]!;
  expect(category(row, "message").assessments.map((item) => item.reviewer)).toEqual(["Istunto A"]);
  expect(category(row, "layout").assessments.map((item) => item.reviewer)).toEqual(["Istunto B"]);
});

it("keeps an assessment in history and marks it stale after the ad's source changes", async () => {
  const { app, dir, version } = fixture();
  const id = await prepare(app, version.id);
  const before = await read(app);
  const saved = await json(await post(app, entry(id, before.token as unknown as string)));
  const recorded = category(rows(saved)[0]!, "message").assessments[0]!;
  writeFileSync(join(dir, "index.html"), html.replace(">a<", ">b<"));
  const after = await read(app);
  expect(after.revision).toBe(sourceRevision(projectVersionFiles(dir)));
  const row = rows(after)[0]!;
  expect(row.sourceChanged).toBe(true);
  expect(category(row, "message").status).toBe("stale");
  const still = category(row, "message").assessments[0]!;
  expect(still.id).toBe(recorded.id);
  expect(still.stale).toBe(true);
  expect(still.staleReasons).toEqual(["source_changed"]);
});

it("marks an assessment stale when its package can no longer be read", async () => {
  const { app, dir, version } = fixture();
  const id = await prepare(app, version.id);
  const before = await read(app);
  await post(app, entry(id, before.token as unknown as string));
  rmSync(join(dir, ".ari-notebook/review-packages", id, "manifest.json"));
  const row = rows(await read(app))[0]!;
  expect(row.packageId).toBe(id);
  expect(row.readable).toBe(false);
  const still = category(row, "message").assessments[0]!;
  expect(still.stale).toBe(true);
  expect(still.staleReasons).toContain("package_unreadable");
});

it("refuses a technical reviewer type, an unknown package and a boundary this package never had", async () => {
  const { app, dir, version } = fixture();
  const id = await prepare(app, version.id);
  const token = () => read(app).then((result) => result.token as unknown as string);
  for (const [body, message] of [
    [entry(id, null, { reviewerType: "technical" }), /valinta ei kelpaa/],
    [entry(id, null, { checkedBoundaries: [0] }), /ei kuulu tähän tarkistuspakettiin/],
    [entry(id, null, { wholeVideoWatched: "kyllä" }), /valinta ei kelpaa/],
    [entry(id, null, { reviewer: "  " }), /pakolliset tiedot/],
  ] as const) {
    const refused = await post(app, { ...body, expectedToken: await token() });
    expect(refused.status).toBe(409);
    expect((await json(refused)).error).toMatch(message);
  }
  const unknown = await post(app, entry("11111111-1111-1111-1111-111111111111", await token()));
  expect(unknown.status).toBe(409);
  // Nothing survived any refusal.
  const row = rows(await read(app))[0]!;
  for (const item of row.categories) expect(item.assessments).toEqual([]);
  writeFileSync(join(dir, ".ari-notebook/review-packages", id, "first.png"), "tampered");
  const tampered = await post(app, entry(id, await token()));
  expect(tampered.status).toBe(409);
  expect((await json(tampered)).error).toMatch(/vioittunut/);
});
