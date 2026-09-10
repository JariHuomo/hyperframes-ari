import { afterEach, expect, it, vi } from "vitest";
import { reviewTools } from "./reviewTools";
afterEach(() => vi.unstubAllGlobals());
const context = () => ({ signal: new AbortController().signal });
const manifest = {
  id: "11111111-1111-4111-8111-111111111111",
  versionId: "v2",
  versionName: "Jälkeen",
  previousVersionId: "v1",
  previousVersionName: "Ennen",
  coverage: "changed-motion-boundaries",
  coverageNotes: [],
  video: { path: "video.mp4" },
  previousVideo: { path: "previous.mp4" },
  frames: [{ path: "first.png", frame: 0, time: 0 }],
  boundaryFrames: [{ path: "boundary-1.png", frame: 42, time: 1.4, versionId: "v1" }],
  boundaries: [],
};

it("prepares, lists and reads through one service and never claims viewing or approval", async () => {
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/review")
      ? new Response(JSON.stringify({ ok: true, packages: [{ id: manifest.id, readable: true }] }))
      : new Response(JSON.stringify({ ok: true, package: manifest })),
  );
  vi.stubGlobal("fetch", fetcher);
  const tools = reviewTools(() => "ad");
  expect(tools.map((t) => t.name)).toEqual([
    "studio_prepare_review_package",
    "studio_list_review_packages",
    "studio_read_review_package",
    "studio_record_review_assessment",
    "studio_read_review_assessments",
  ]);
  expect(tools.map((t) => t.annotations?.readOnlyHint)).toEqual([false, true, true, false, true]);
  const prepared = await tools[0]!.execute({ versionId: "v2", previousVersionId: "v1" }, context());
  expect(prepared).toMatchObject({ ok: true, projectId: "ad", viewed: false, approved: false });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/ari/projects/ad/review/prepare",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ versionId: "v2", previousVersionId: "v1" }),
    }),
  );
  expect(Reflect.get(prepared, "assetUrls")).toMatchObject({
    video: `/api/ari/projects/ad/review/${manifest.id}/asset?path=video.mp4`,
    previousVideo: `/api/ari/projects/ad/review/${manifest.id}/asset?path=previous.mp4`,
  });
  expect(await tools[1]!.execute({}, context())).toMatchObject({
    ok: true,
    packages: [{ id: manifest.id }],
  });
  expect(await tools[2]!.execute({ packageId: manifest.id }, context())).toMatchObject({
    ok: true,
    viewed: false,
  });
  expect(fetcher).toHaveBeenLastCalledWith(`/api/ari/projects/ad/review/${manifest.id}`, undefined);
});

it("sends no previous version when none was chosen", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, package: manifest })));
  vi.stubGlobal("fetch", fetcher);
  await reviewTools(() => "ad")[0]!.execute(
    { versionId: "v2", previousVersionId: "  " },
    context(),
  );
  expect(fetcher).toHaveBeenCalledWith(
    "/api/ari/projects/ad/review/prepare",
    expect.objectContaining({
      body: JSON.stringify({ versionId: "v2", previousVersionId: null }),
    }),
  );
});

it("reports a refused preparation as a failure, not as a ready package", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "Renderöinti epäonnistui." }), {
          status: 409,
        }),
    ),
  );
  expect(await reviewTools(() => "ad")[0]!.execute({ versionId: "v2" }, context())).toEqual({
    ok: false,
    kind: "failed",
    reason: "Renderöinti epäonnistui.",
  });
});

it("refuses a missing project, aborted work and missing identifiers", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, package: manifest })));
  vi.stubGlobal("fetch", fetcher);
  expect(await reviewTools(() => null)[1]!.execute({}, context())).toMatchObject({ ok: false });
  const controller = new AbortController();
  controller.abort();
  expect(
    await reviewTools(() => "ad")[1]!.execute({}, { signal: controller.signal }),
  ).toMatchObject({ ok: false });
  expect(await reviewTools(() => "ad")[0]!.execute({}, context())).toMatchObject({
    ok: false,
    reason: "Kenttä versionId puuttuu.",
  });
  expect(await reviewTools(() => "ad")[2]!.execute({}, context())).toMatchObject({
    ok: false,
    reason: "Kenttä packageId puuttuu.",
  });
  expect(fetcher).not.toHaveBeenCalled();
});

it("records and reads assessments over the same service and never reports an approval", async () => {
  const view = {
    ok: true,
    token: "t1",
    revision: "r1",
    packages: [{ packageId: manifest.id, categories: [{ category: "audio", status: "missing" }] }],
  };
  const fetcher = vi.fn(async () => new Response(JSON.stringify(view)));
  vi.stubGlobal("fetch", fetcher);
  const tools = reviewTools(() => "ad");
  expect(await tools[4]!.execute({}, context())).toMatchObject({
    ok: true,
    projectId: "ad",
    approved: false,
    packages: view.packages,
  });
  expect(fetcher).toHaveBeenCalledWith("/api/ari/projects/ad/review/assessments", undefined);
  const recorded = await tools[3]!.execute(
    {
      packageId: manifest.id,
      expectedToken: "t1",
      category: "motion",
      reviewer: "Testiajo",
      reviewerType: "test_data",
      verdict: "fix",
      text: "Liike nykii.",
      wholeVideoWatched: true,
      checkedBoundaries: "all",
    },
    context(),
  );
  expect(recorded).toMatchObject({ ok: true, approved: false });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/ari/projects/ad/review/assessments",
    expect.objectContaining({ method: "POST" }),
  );
  expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toMatchObject({
    packageId: manifest.id,
    expectedToken: "t1",
    reviewerType: "test_data",
  });
  // `technical` is not offered: a measurement can never be entered as a judgement.
  expect(Reflect.get(tools[3]!.inputSchema.properties!.reviewerType!, "enum")).toEqual([
    "human",
    "external_agent",
    "test_data",
  ]);
  expect(await reviewTools(() => "ad")[3]!.execute({}, context())).toMatchObject({
    ok: false,
    reason: "Kenttä packageId puuttuu.",
  });
});
