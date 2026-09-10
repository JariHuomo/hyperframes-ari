import { resolveAriProject } from "../ari/resolveAriProject.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { StudioApiAdapter } from "../types.js";
import { readNotebook, saveNotebook } from "../ari/notebook.js";
export function registerAriNotebookRoutes(parent: Hono, adapter: StudioApiAdapter) {
  const api = new Hono();
  const base = "/ari/projects/:id/notebook";
  api.onError((error, c) => c.json({ ok: false, error: error.message }, 409));
  api.use(base, bodyLimit({ maxSize: 1024 * 1024 }));
  const root = (id: string) => resolveAriProject(adapter, id);
  api.get(base, async (c) => c.json(readNotebook(await root(c.req.param("id")))));
  api.post(base, async (c) =>
    c.json(saveNotebook(await root(c.req.param("id")), await c.req.json())),
  );
  parent.route("/", api);
}
