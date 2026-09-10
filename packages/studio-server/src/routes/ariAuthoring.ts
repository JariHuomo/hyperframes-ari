import type { Hono } from "hono";
import type { StudioApiAdapter } from "../types.js";
import { projectProposal, createAdProject } from "../ari/adProjects.js";
import { imageShelf, importImage, IMAGE_MAX_BYTES, IMAGE_MAX_PIXELS } from "../ari/imageImport.js";
import {
  commitConditionalFiles,
  confinedPath,
  readOptionalBytes,
  type ConditionalFile,
} from "../ari/conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";

async function boundedBody(request: Request, limit: number): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("Tiedosto on liian suuri.");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Tiedosto on liian suuri.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Tallennus ei onnistunut.";
const nullableString = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;
function parseFiles(input: unknown): ConditionalFile[] {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw new Error("Valitse 1–20 tiedostoa.");
  return input.map((file: unknown) => {
    if (!file || typeof file !== "object") throw new Error("Tiedoston tiedot puuttuvat.");
    const path = Reflect.get(file, "path"),
      expectedVersion = Reflect.get(file, "expectedVersion"),
      content = Reflect.get(file, "content");
    if (
      typeof path !== "string" ||
      !/\.(html|css|js|json)$/.test(path) ||
      !nullableString(expectedVersion) ||
      !nullableString(content)
    )
      throw new Error("Tiedoston tiedot eivät kelpaa.");
    return { path, expectedVersion, content: content === null ? null : Buffer.from(content) };
  });
}
export function registerAriAuthoringRoutes(api: Hono, adapter: StudioApiAdapter) {
  api.get("/ari/projects/options", (c) =>
    c.json({
      ok: true,
      root: adapter.authoringRoot ?? null,
      templates: ["blank", "product"],
      duration: 7,
      width: 1080,
      height: 1920,
      maxBytes: IMAGE_MAX_BYTES,
      maxPixels: IMAGE_MAX_PIXELS,
    }),
  );
  api.post("/ari/projects/propose", async (c) => {
    try {
      if (!adapter.authoringRoot)
        throw new Error("Uuden mainoksen luonti ei ole käytössä tässä studiossa.");
      return c.json({
        ok: true,
        project: projectProposal(
          adapter.authoringRoot,
          JSON.parse((await boundedBody(c.req.raw, 4096)).toString()),
        ),
      });
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 400);
    }
  });
  api.post("/ari/projects/create", async (c) => {
    try {
      if (!adapter.authoringRoot)
        throw new Error("Uuden mainoksen luonti ei ole käytössä tässä studiossa.");
      return c.json(
        await createAdProject(
          adapter.authoringRoot,
          JSON.parse((await boundedBody(c.req.raw, 4096)).toString()),
        ),
      );
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 409);
    }
  });
  // Resolve all authoring paths through a closed ID before consulting host adapters.
  api.use("/ari/projects/:id/*", async (c, next) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(c.req.param("id") ?? ""))
      return c.json({ ok: false, error: "Projekti ei kelpaa." }, 400);
    await next();
  });
  api.get("/ari/projects/:id/images", async (c) => {
    try {
      const project = await adapter.resolveProject(c.req.param("id"));
      if (!project) throw new Error("Projektia ei löydy.");
      return c.json({ ok: true, projectId: project.id, assets: await imageShelf(project.dir) });
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 400);
    }
  });
  api.post("/ari/projects/:id/images", async (c) => {
    try {
      const project = await adapter.resolveProject(c.req.param("id"));
      if (!project) throw new Error("Projektia ei löydy.");
      const bytes = await boundedBody(c.req.raw, IMAGE_MAX_BYTES);
      return c.json({
        ...(await importImage(project.dir, c.req.query("name") ?? "", bytes)),
        projectId: project.id,
      });
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 400);
    }
  });
  api.get("/ari/projects/:id/source", async (c) => {
    try {
      const project = await adapter.resolveProject(c.req.param("id"));
      if (!project) throw new Error("Projektia ei löydy.");
      const path = c.req.query("path") ?? "";
      const bytes = readOptionalBytes(confinedPath(project.dir, path));
      return c.json({
        ok: true,
        path,
        exists: bytes !== null,
        content: bytes?.toString() ?? null,
        version: bytes === null ? null : fileContentVersion(bytes),
      });
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 400);
    }
  });
  api.post("/ari/projects/:id/source-transaction", async (c) => {
    try {
      const project = await adapter.resolveProject(c.req.param("id"));
      if (!project) throw new Error("Projektia ei löydy.");
      const input = JSON.parse((await boundedBody(c.req.raw, 2 * 1024 * 1024)).toString());
      // Invalidate before the synchronous transaction, including its compensation path.
      // A new project's watcher may not yet be ready; stale ETags must never survive a save.
      adapter.invalidateProjectSignature?.(project.dir);
      return c.json({
        ok: true,
        stage: "saved",
        projectId: project.id,
        files: commitConditionalFiles(project.dir, parseFiles(input.files)),
        affectsProjects: 1,
      });
    } catch (error) {
      return c.json({ ok: false, error: message(error) }, 409);
    }
  });
}
