import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { versionTestProject } from "./versionTestProject";
import { createReviewRenderer } from "./reviewRenderer";
import type { RenderJobState } from "../types";

it("uses the Studio local adapter, preserves HTML structure and blocks script networking", async () => {
  const dir = versionTestProject({
    "index.html": "<html><head></head><body>render me</body></html>",
    "scenes/card.html": "<html><head></head><body>scene</body></html>",
  });
  let finished: RenderJobState | undefined;
  await createReviewRenderer((opts) => {
    expect(opts.project.dir).toBe(dir);
    expect(opts.telemetryOptOut).toBe(true);
    expect(opts.fps).toEqual({ num: 30, den: 1 });
    for (const file of ["index.html", "scenes/card.html"]) {
      const html = readFileSync(join(dir, file), "utf8");
      expect(html).toContain('<head><meta http-equiv="Content-Security-Policy"');
      expect(html).toContain("connect-src 'none'");
      expect(html).toContain("</head><body>");
    }
    finished = { id: "test", status: "rendering", progress: 0, outputPath: opts.outputPath };
    setTimeout(() => {
      finished!.status = "complete";
    }, 1);
    return finished;
  })(dir, join(dir, "out.mp4"));
  expect(finished?.status).toBe("complete");
});
it("fails closed on unsupported HTML before starting a renderer", async () => {
  const dir = versionTestProject({ "index.html": "fragment" });
  await expect(
    createReviewRenderer(() => {
      throw new Error("must not render");
    })(dir, "unused"),
  ).rejects.toThrow("head");
});
it("refuses an adapter render failure", async () => {
  const dir = versionTestProject({ "index.html": "<html><head></head><body></body></html>" });
  await expect(
    createReviewRenderer(() => ({
      id: "test",
      status: "failed",
      progress: 0,
      outputPath: "unused",
    }))(dir, "unused"),
  ).rejects.toThrow("epäonnistui");
});
