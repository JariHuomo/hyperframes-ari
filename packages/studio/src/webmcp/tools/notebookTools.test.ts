import { afterEach, expect, it, vi } from "vitest";
import { notebookTools } from "./notebookTools";
afterEach(() => vi.unstubAllGlobals());
const context = () => ({ signal: new AbortController().signal });
it("exposes bounded read/write commands with conditional tokens and author categories", async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ ok: true, token: "new", sourceChanged: false })),
  );
  vi.stubGlobal("fetch", fetcher);
  const tools = notebookTools(() => "active");
  expect(tools.map((t) => t.name)).toEqual([
    "studio_notebook",
    "studio_update_notebook",
    "studio_resume_work",
  ]);
  const input = { action: "brief", expectedToken: "old", goal: "Tavoite", texts: "Teksti" };
  expect(await tools[1]!.execute(input, context())).toMatchObject({
    ok: true,
    projectId: "active",
    token: "new",
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/ari/projects/active/notebook",
    expect.objectContaining({ body: JSON.stringify(input), method: "POST" }),
  );
  await tools[0]!.execute({}, context());
  expect(fetcher).toHaveBeenLastCalledWith("/api/ari/projects/active/notebook", undefined);
});
it("reports conflicts without successful source-write receipts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "Muistikirja muuttui" }), { status: 409 }),
    ),
  );
  expect(await notebookTools(() => "p")[1]!.execute({}, context())).toMatchObject({
    ok: false,
    reason: "Muistikirja muuttui",
  });
});
it("refuses missing projects, aborted work and malformed responses", async () => {
  const fetcher = vi.fn(async () => new Response("null"));
  vi.stubGlobal("fetch", fetcher);
  expect(await notebookTools(() => null)[0]!.execute({}, context())).toMatchObject({ ok: false });
  const controller = new AbortController();
  controller.abort();
  expect(
    await notebookTools(() => "p")[0]!.execute({}, { signal: controller.signal }),
  ).toMatchObject({ ok: false });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await notebookTools(() => "p")[0]!.execute({}, context())).toMatchObject({ ok: false });
});

/** D6–D7 are notebook commands, not new tools; the stop and the decision reach
 * the same conditional route the rest of the notebook uses. */
it("carries the stop and the local approval through the one notebook command", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, token: "new" })));
  vi.stubGlobal("fetch", fetcher);
  const write = notebookTools(() => "active")[1]!;
  const actions = (write.inputSchema as { properties: { action: { enum: string[] } } }).properties
    .action.enum;
  expect(actions).toEqual(expect.arrayContaining(["stop_work", "resume_work", "approval"]));
  const stop = {
    action: "stop_work",
    expectedToken: "old",
    by: "Ulkoinen agentti",
    byType: "external_agent",
    reason: "Odotetaan hintaa",
  };
  expect(await write.execute(stop, context())).toMatchObject({ ok: true });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/ari/projects/active/notebook",
    expect.objectContaining({ body: JSON.stringify(stop), method: "POST" }),
  );
  const decision = {
    action: "approval",
    expectedToken: "new",
    versionId: "v1",
    packageId: "p1",
    decision: "approved",
    approver: "Ulkoinen agentti",
    approverType: "external_agent",
    note: "Katsottu kokonaan.",
    notApplicable: [{ category: "audio", reason: "Ei ääntä." }],
  };
  expect(await write.execute(decision, context())).toMatchObject({ ok: true });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/ari/projects/active/notebook",
    expect.objectContaining({ body: JSON.stringify(decision) }),
  );
});
