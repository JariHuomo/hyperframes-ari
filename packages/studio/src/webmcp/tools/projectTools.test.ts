import { afterEach, expect, it, vi } from "vitest";
import { projectTools } from "./projectTools";
afterEach(() => vi.unstubAllGlobals());
const execute = (name: string, input: object = {}, id: string | null = "demo") =>
  projectTools(() => id)
    .find((tool) => tool.name === name)!
    .execute(input, { signal: new AbortController().signal });
it("exposes creation review, creation, opening and copied-image tools", () => {
  expect(projectTools(() => null).map((tool) => tool.name)).toEqual([
    "studio_projects",
    "studio_prepare_project",
    "studio_create_project",
    "studio_open_project",
    "studio_import_images",
    "studio_images",
  ]);
});
it("keeps successful image receipts when another selected image fails", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, asset: { path: "assets/imports/a.png" }, version: "actual" }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Väärä kuva" }), { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  const result = await execute("studio_import_images", {
    files: [
      { name: "good.png", base64: "YWJj" },
      { name: "bad.png", base64: "YWJj" },
    ],
  });
  expect(result).toMatchObject({
    ok: true,
    partial: true,
    results: [
      { ok: true, version: "actual" },
      { ok: false, error: "Väärä kuva" },
    ],
  });
  expect(fetch.mock.calls[0][0]).toBe("/api/ari/projects/demo/images?name=good.png");
});
it("does not read arbitrary paths or import without a project", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    await execute("studio_import_images", { files: [{ name: "x.png", path: "/secret" }] }),
  ).toMatchObject({ ok: false, partial: false, stage: "not_saved", results: [{ ok: false }] });
  expect(await execute("studio_import_images", { files: [] }, null)).toMatchObject({ ok: false });
  expect(fetch).not.toHaveBeenCalled();
});
it("carries the reviewed location unchanged to the server and returns the real receipt", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ok: true, version: "actual", stage: "saved" })),
    );
  vi.stubGlobal("fetch", fetch);
  const input = { name: "demo", template: "blank", location: "/allowed/demo" };
  expect(await execute("studio_create_project", input)).toMatchObject({
    ok: true,
    version: "actual",
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
});
it("refuses a project switch to an ID outside the listing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [{ id: "allowed" }] }))),
  );
  expect(await execute("studio_open_project", { id: "other" })).toMatchObject({
    ok: false,
    reason: "Projektia ei löydy.",
  });
});

it("stops the remaining batch after cancellation while retaining the completed receipt", async () => {
  const controller = new AbortController();
  const fetch = vi.fn().mockImplementation(async () => {
    controller.abort();
    return new Response(JSON.stringify({ ok: true, version: "saved-first" }));
  });
  vi.stubGlobal("fetch", fetch);
  const importer = projectTools(() => "demo").find((tool) => tool.name === "studio_import_images")!;
  const result = await importer.execute(
    {
      files: [
        { name: "one.png", base64: "YWJj" },
        { name: "two.png", base64: "YWJj" },
      ],
    },
    { signal: controller.signal },
  );
  expect(result).toMatchObject({
    partial: true,
    results: [
      { ok: true, version: "saved-first" },
      { ok: false, error: expect.stringContaining("keskeytettiin") },
    ],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
