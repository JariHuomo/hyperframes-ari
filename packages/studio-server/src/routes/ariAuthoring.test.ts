// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, rmSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerAriAuthoringRoutes } from "./ariAuthoring";
import { createProjectSignature } from "../helpers/projectSignature";
import type { StudioApiAdapter } from "../types";
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function setup(creation = true) {
  const root = mkdtempSync(join(tmpdir(), "ari-routes-"));
  dirs.push(root);
  const api = new Hono();
  const adapter: StudioApiAdapter = {
    authoringRoot: creation ? root : undefined,
    listProjects: () => [],
    resolveProject: (id) => (existsSync(join(root, id)) ? { id, dir: join(root, id) } : null),
    bundle: async () => null,
    lint: () => ({ findings: [] }),
    runtimeUrl: "/runtime.js",
    rendersDir: () => root,
    startRender: () => {
      throw new Error("No rendering in this test");
    },
  };
  registerAriAuthoringRoutes(api, adapter);
  const post = (path: string, body: object) =>
    api.request(path, { method: "POST", body: JSON.stringify(body) });
  return { root, api, post, adapter };
}
it("serves a location-bound creation receipt and explicit source absence, creation and deletion", async () => {
  const h = setup();
  const input = { name: "demo", template: "blank" };
  const proposed = await (await h.post("/ari/projects/propose", input)).json();
  const created = await h.post("/ari/projects/create", {
    ...input,
    location: proposed.project.dir,
  });
  expect(created.status).toBe(200);
  const receipt = await created.json();
  expect(receipt).toMatchObject({ ok: true, stage: "saved", affectsProjects: 1 });
  const get = () =>
    h.api.request("/ari/projects/demo/source?path=empty.html").then((r) => r.json());
  expect(await get()).toMatchObject({ exists: false, content: null, version: null });
  const result = await h.post("/ari/projects/demo/source-transaction", {
    files: [{ path: "empty.html", content: "", expectedVersion: null }],
  });
  expect(result.status).toBe(200);
  const empty = await get();
  expect(empty).toMatchObject({ exists: true, content: "" });
  expect(
    (
      await h.post("/ari/projects/demo/source-transaction", {
        files: [{ path: "empty.html", content: "oops", expectedVersion: null }],
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await h.post("/ari/projects/demo/source-transaction", {
        files: [{ path: "empty.html", content: null, expectedVersion: empty.version }],
      })
    ).status,
  ).toBe(200);
  expect(await get()).toMatchObject({ exists: false });
  expect(readFileSync(join(h.root, "demo/index.html"), "utf8")).toContain("__timelines");
});
it("fails closed on unsupported hosts and invalid project IDs", async () => {
  const h = setup(false);
  expect((await h.post("/ari/projects/create", { name: "demo", template: "blank" })).status).toBe(
    409,
  );
  expect((await h.api.request("/ari/projects/a%2Fb/images")).status).toBe(400);
});
it("bounds request bytes and does not create a project from oversized JSON", async () => {
  const h = setup();
  const response = await h.api.request("/ari/projects/create", {
    method: "POST",
    body: " ".repeat(4097),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, error: "Tiedosto on liian suuri." });
});

it("invalidates cached source signatures before create, update and undo without watcher events", async () => {
  const h = setup();
  const input = { name: "demo", template: "blank" };
  const proposal = await (await h.post("/ari/projects/propose", input)).json();
  await h.post("/ari/projects/create", { ...input, location: proposal.project.dir });
  let cached: string | undefined;
  h.adapter.getProjectSignature = (dir) => (cached ??= createProjectSignature(dir));
  h.adapter.invalidateProjectSignature = (dir) => {
    expect(realpathSync(dir)).toBe(proposal.project.dir);
    cached = undefined;
  };
  const signature = () => h.adapter.getProjectSignature!(proposal.project.dir);
  const original = signature();
  const transact = (content: string | null, expectedVersion: string | null) =>
    h.post("/ari/projects/demo/source-transaction", {
      files: [{ path: "scene.html", content, expectedVersion }],
    });
  const created = await (await transact("scene", null)).json();
  expect(created.ok).toBe(true);
  const added = signature();
  expect(added).not.toBe(original);
  const updated = await (await transact("updated scene", created.files[0].version)).json();
  expect(updated.ok).toBe(true);
  expect(signature()).not.toBe(added);
  const removed = await (await transact(null, updated.files[0].version)).json();
  expect(removed.ok).toBe(true);
  expect(signature()).toBe(original);
});
