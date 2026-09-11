import {
  quoteCreativeFeedback,
  runCreativeFeedback,
  readAllCreativeFeedback,
  creativeFeedbackOptions,
} from "../ari/creativeFeedback.js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { StudioApiAdapter } from "../types.js";
import { resolveAriProject } from "../ari/resolveAriProject.js";
import { prepareReviewPackage, readReviewPackage, readReviewAsset } from "../ari/reviewPackage.js";
import { createReviewRenderer } from "../ari/reviewRenderer.js";
import { listReviewPackages } from "../ari/reviewList.js";
import { readReviewAssessments } from "../ari/reviewAssessmentsView.js";
import { saveNotebook } from "../ari/notebook.js";

/**
 * Ari · review package routes (D4)
 *
 * The visible UI and the discoverable agent tools reach the same service
 * through these four routes; neither owns a private path into the package
 * directory. Preparation renders and publishes, and the reader verifies every
 * asset before a byte is served, so a half-written package can never be shown.
 * Assets are served only when the verified manifest lists them.
 *
 * The two assessment routes sit BEFORE `/:pkg` on purpose: `assessments` is a
 * word, not a package id, and the first matching route wins. They store through
 * the project notebook's own conditional save, so an assessment never becomes a
 * second, parallel record of the same thing.
 */
const media: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png" };

export function registerAriReviewRoutes(parent: Hono, adapter: StudioApiAdapter) {
  const api = new Hono();
  const base = "/ari/projects/:id/review";
  api.onError((error, c) => c.json({ ok: false, error: error.message }, 409));
  api.use(`${base}/*`, bodyLimit({ maxSize: 64 * 1024 }));
  const root = (id: string) => resolveAriProject(adapter, id);

  api.get(base, async (c) =>
    c.json({ ok: true, packages: listReviewPackages(await root(c.req.param("id"))) }),
  );
  api.post(`${base}/prepare`, async (c) => {
    const input = await c.req.json();
    const versionId = readId(input.versionId, "Valitse jäädytetty versio.");
    const previousVersionId =
      input.previousVersionId === undefined || input.previousVersionId === null
        ? null
        : readId(input.previousVersionId, "Vertailuversion tunniste ei kelpaa.");
    // The renderer is a trusted server dependency; the client never supplies it.
    const manifest = await prepareReviewPackage(
      await root(c.req.param("id")),
      versionId,
      createReviewRenderer(adapter.startRender.bind(adapter)),
      { previousVersionId },
    );
    return c.json({ ok: true, package: manifest });
  });
  api.get(`${base}/assessments`, async (c) =>
    c.json(readReviewAssessments(await root(c.req.param("id")))),
  );
  api.post(`${base}/assessments`, async (c) => {
    const input = await c.req.json();
    const dir = await root(c.req.param("id"));
    // Conditional on the notebook token; a stale reviewer is told to re-read.
    saveNotebook(dir, { ...input, action: "assessment" });
    return c.json({ ...readReviewAssessments(dir), stage: "assessment_recorded" });
  });
  api.get(`${base}/:pkg/feedback/options`, (c) =>
    c.json({ ok: true, options: creativeFeedbackOptions() }),
  );
  api.post(`${base}/:pkg/feedback/quote`, async (c) => {
    const input = await c.req.json();
    // The reviewer is a closed id resolved server-side; model, price and key never cross the wire.
    return c.json({
      ok: true,
      quote: quoteCreativeFeedback(
        await root(c.req.param("id")),
        c.req.param("pkg"),
        input.reviewer,
      ),
    });
  });
  api.post(`${base}/:pkg/feedback/run`, async (c) => {
    const input = await c.req.json();
    const quoteId = readId(input.quoteId, "Palautepyynnön hinta puuttuu.");
    if (input.approved !== true) throw new Error("Hyväksy näytetty hinta ensin.");
    return c.json({
      ok: true,
      result: await runCreativeFeedback(
        await root(c.req.param("id")),
        quoteId,
        undefined,
        c.req.param("pkg"),
      ),
    });
  });
  api.get(`${base}/:pkg/feedback`, async (c) =>
    c.json({
      ok: true,
      results: readAllCreativeFeedback(await root(c.req.param("id")), c.req.param("pkg")),
    }),
  );
  api.get(`${base}/:pkg`, async (c) =>
    c.json({
      ok: true,
      package: readReviewPackage(await root(c.req.param("id")), c.req.param("pkg")),
    }),
  );
  api.get(`${base}/:pkg/asset`, async (c) => {
    const dir = await root(c.req.param("id"));
    const path = c.req.query("path") ?? "";
    const bytes = readReviewAsset(dir, c.req.param("pkg"), path);
    const type = media[path.slice(path.lastIndexOf("."))];
    if (!type) throw new Error("Aineiston tyyppi ei kuulu tarkistuspakettiin.");
    return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
  });
  parent.route("/", api);
}

function readId(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}
