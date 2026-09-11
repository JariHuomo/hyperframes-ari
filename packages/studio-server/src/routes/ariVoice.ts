import type { Hono } from "hono";
import type { StudioApiAdapter } from "../types.js";
import {
  generateVoiceWorkflow,
  quoteVoiceWorkflow,
  readVoiceWorkflow,
  updateVoicePresentationWorkflow,
} from "../ari/voiceProject.js";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Puheäänen käsittely ei onnistunut.";

async function body(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 64 * 1024) throw new Error("Pyyntö on liian suuri.");
  const text = await request.text();
  if (Buffer.byteLength(text) > 64 * 1024) throw new Error("Pyyntö on liian suuri.");
  return JSON.parse(text);
}

export function registerAriVoiceRoutes(api: Hono, adapter: StudioApiAdapter) {
  async function projectRoot(id: string, invalidate = false) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(id)) throw new Error("Projekti ei kelpaa.");
    const project = await adapter.resolveProject(id);
    if (!project) throw new Error("Projektia ei löydy.");
    if (invalidate) adapter.invalidateProjectSignature?.(project.dir);
    return project.dir;
  }
  api.get("/ari/projects/:id/voice", async (c) => {
    try {
      const dir = await projectRoot(c.req.param("id"));
      return c.json(readVoiceWorkflow(dir));
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 400);
    }
  });
  api.post("/ari/projects/:id/voice/quote", async (c) => {
    try {
      const dir = await projectRoot(c.req.param("id"));
      return c.json(quoteVoiceWorkflow(dir, await body(c.req.raw)));
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 400);
    }
  });
  api.post("/ari/projects/:id/voice/generate", async (c) => {
    try {
      const dir = await projectRoot(c.req.param("id"), true);
      return c.json(await generateVoiceWorkflow(dir, await body(c.req.raw)));
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 409);
    }
  });
  api.post("/ari/projects/:id/voice/presentation", async (c) => {
    try {
      const dir = await projectRoot(c.req.param("id"), true);
      return c.json(updateVoicePresentationWorkflow(dir, await body(c.req.raw)));
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 409);
    }
  });
}
