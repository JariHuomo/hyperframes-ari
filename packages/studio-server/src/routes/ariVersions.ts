import {
  prepareSourceOperation,
  reconcileSourceOperations,
  writeSourceOperation,
} from "../ari/operationJournal.js";
import { resolveAriProject } from "../ari/resolveAriProject.js";
import { projectVersionPreview } from "../ari/versionPreview.js";
import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import type { StudioApiAdapter } from "../types.js";
import {
  readVersionIndex,
  readProjectVersion,
  prepareVersionRestore,
  saveProjectVersion,
  deleteProjectVersion,
} from "../ari/versionStore.js";
import { isVersionProjectPath, projectVersionFiles, sourceRevision } from "../ari/versionFiles.js";
import {
  parseVersionHistory,
  decodeHistoryBytes,
  prepareHistoryBaseline,
} from "../ari/versionHistory.js";
import {
  commitConditionalFiles,
  confinedPath,
  readOptionalBytes,
} from "../ari/conditionalFiles.js";
import { fileContentVersion } from "../helpers/fileVersion.js";

export function registerAriVersionRoutes(parent: Hono, adapter: StudioApiAdapter) {
  const api = new Hono();
  api.onError((error, c) => c.json({ ok: false, error: error.message }, 409));
  const base = "/ari/projects/:id/versions";
  api.use(`${base}/*`, bodyLimit({ maxSize: 48 * 1024 * 1024 }));
  const root = (id: string) => resolveAriProject(adapter, id);
  api.get(`${base}/operations`, async (c) => {
    const dir = await root(c.req.param("id"));
    return c.json({
      ok: true,
      operations: reconcileSourceOperations(dir, readVersionIndex(dir).index.operations ?? []),
    });
  });
  api.post(`${base}/operations/write`, async (c) => {
    const dir = await root(c.req.param("id"));
    const input = await c.req.json();
    adapter.invalidateProjectSignature?.(dir);
    return c.json({ ok: true, files: writeSourceOperation(dir, input.id, input.path) });
  });
  api.post(`${base}/operations`, async (c) => {
    const dir = await root(c.req.param("id"));
    return c.json({ ok: true, ...prepareSourceOperation(dir, await c.req.json()) });
  });
  api.get(`${base}/index`, async (c) => {
    const dir = await root(c.req.param("id"));
    const { index, token } = readVersionIndex(dir);
    return c.json({
      ok: true,
      ...index,
      indexToken: token,
      revision: sourceRevision(projectVersionFiles(dir)),
    });
  });
  api.get(`${base}/read/:version`, async (c) => {
    const { version, files } = readProjectVersion(
      await root(c.req.param("id")),
      c.req.param("version"),
    );
    return c.json({
      ok: true,
      version,
      files: Object.fromEntries(
        Object.entries(files).map(([path, bytes]) => [path, bytes.toString("base64")]),
      ),
    });
  });
  api.get(`${base}/preview/:version`, async (c) =>
    c.json(await projectVersionPreview(await root(c.req.param("id")), c.req.param("version"))),
  );
  api.get(`${base}/restore/:version`, async (c) =>
    c.json({
      ok: true,
      ...prepareVersionRestore(await root(c.req.param("id")), c.req.param("version")),
    }),
  );
  api.post(`${base}/save`, async (c) => {
    const dir = await root(c.req.param("id"));
    const input = await c.req.json();
    validateSaveRequest(input);
    const history = input.history === undefined ? undefined : parseVersionHistory(input.history);
    const beforeFiles = prepareHistoryBaseline(dir, history);
    return c.json({ ok: true, ...saveProjectVersion(dir, { ...input, history, beforeFiles }) });
  });
  api.post(`${base}/delete/:version`, async (c) => {
    const input = await c.req.json();
    return c.json({
      ok: true,
      ...deleteProjectVersion(
        await root(c.req.param("id")),
        c.req.param("version"),
        input.expectedIndex,
      ),
    });
  });
  // Binary I/O is restricted to the same project and conditional history writes.
  api.get(`${base}/file`, async (c) => {
    const dir = await root(c.req.param("id")),
      path = c.req.query("path") ?? "";
    assertActivePath(path);
    const bytes = readOptionalBytes(confinedPath(dir, path));
    return c.json({ ok: true, content: bytes?.toString("base64") ?? null });
  });
  api.post(`${base}/file`, async (c) => {
    const dir = await root(c.req.param("id")),
      input = await c.req.json();
    assertActivePath(input.path);
    const before = decodeHistoryBytes(input.before, "base64"),
      content = decodeHistoryBytes(input.content, "base64");
    adapter.invalidateProjectSignature?.(dir);
    return c.json({
      ok: true,
      files: commitConditionalFiles(dir, [
        {
          path: input.path,
          content,
          expectedVersion: before === null ? null : fileContentVersion(before),
        },
      ]),
    });
  });
  parent.route("/", api);
}
function assertActivePath(path: string) {
  if (typeof path !== "string" || !isVersionProjectPath(path))
    throw new Error("Tiedostoa ei voi palauttaa tällä toiminnolla.");
}

function validateSaveRequest(input: {
  expectedRevision?: unknown;
  expectedIndex?: unknown;
  name?: unknown;
}) {
  if (
    typeof input.expectedRevision !== "string" ||
    !(input.expectedIndex === null || typeof input.expectedIndex === "string")
  )
    throw new Error("Version tiedot puuttuvat.");
  if (
    input.name !== undefined &&
    (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80)
  )
    throw new Error("Anna versiolle 1–80 merkin nimi.");
}
