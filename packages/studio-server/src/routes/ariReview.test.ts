import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readVersionIndex } from "../ari/versionStore";
import { projectVersionFiles } from "../ari/versionFiles";
import {
  reviewFixture as fixture,
  reviewHtml as html,
  reviewJson as json,
} from "./reviewTestFixture";

it("prepares, lists, reads and serves only manifest-listed assets", async () => {
  const { app, dir, version } = fixture();
  const indexToken = readVersionIndex(dir).token;
  const prepared = await json(
    await app.request("/ari/projects/p/review/prepare", {
      method: "POST",
      body: JSON.stringify({ versionId: version.id }),
    }),
  );
  expect(prepared.ok).toBe(true);
  const id = (prepared.package as { id: string }).id;
  const listed = await json(await app.request("/ari/projects/p/review"));
  expect((listed.packages as { id: string }[]).map((row) => row.id)).toEqual([id]);
  const read = await json(await app.request(`/ari/projects/p/review/${id}`));
  expect(read.package).toEqual(prepared.package);
  const asset = await app.request(`/ari/projects/p/review/${id}/asset?path=video.mp4`);
  expect(asset.headers.get("Content-Type")).toBe("video/mp4");
  expect((await asset.arrayBuffer()).byteLength).toBeGreaterThan(0);
  const frame = await app.request(`/ari/projects/p/review/${id}/asset?path=first.png`);
  expect(frame.headers.get("Content-Type")).toBe("image/png");
  for (const path of ["manifest.json", "ffprobe.json", "../index.html"]) {
    const refused = await app.request(
      `/ari/projects/p/review/${id}/asset?path=${encodeURIComponent(path)}`,
    );
    expect(refused.status).toBe(409);
  }
  // Preparation is confined to the package directory.
  expect(readVersionIndex(dir).token).toBe(indexToken);
  expect(projectVersionFiles(dir)).toEqual({ "index.html": Buffer.from(html) });
});

it("refuses a missing version id and publishes nothing when the render fails", async () => {
  const { app, version } = fixture(true);
  const missing = await app.request("/ari/projects/p/review/prepare", {
    method: "POST",
    body: JSON.stringify({}),
  });
  expect(missing.status).toBe(409);
  expect((await json(missing)).error).toMatch(/Valitse jäädytetty versio/);
  const failed = await app.request("/ari/projects/p/review/prepare", {
    method: "POST",
    body: JSON.stringify({ versionId: version.id }),
  });
  expect(failed.status).toBe(409);
  expect((await json(await app.request("/ari/projects/p/review"))).packages).toEqual([]);
});

it("refuses an unknown package id and a package whose media was altered", async () => {
  const { app, dir, version } = fixture();
  const prepared = await json(
    await app.request("/ari/projects/p/review/prepare", {
      method: "POST",
      body: JSON.stringify({ versionId: version.id }),
    }),
  );
  const id = (prepared.package as { id: string }).id;
  expect((await app.request("/ari/projects/p/review/not-a-package")).status).toBe(409);
  writeFileSync(join(dir, ".ari-notebook/review-packages", id, "first.png"), "tampered");
  const read = await app.request(`/ari/projects/p/review/${id}`);
  expect(read.status).toBe(409);
  expect((await json(read)).error).toMatch(/vioittunut/);
  // The listing still shows the row, and says the manifest itself is intact.
  const listed = await json(await app.request("/ari/projects/p/review"));
  expect((listed.packages as { readable: boolean }[])[0]!.readable).toBe(true);
});
