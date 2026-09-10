import { Hono } from "hono";
import { execFileSync } from "node:child_process";
import { registerAriReviewRoutes } from "./ariReview.js";
import type { RenderJobState, StudioApiAdapter } from "../types.js";
import { versionTestProject } from "../ari/versionTestProject.js";
import { saveProjectVersion } from "../ari/versionStore.js";
import { sourceRevision, projectVersionFiles } from "../ari/versionFiles.js";

/** One real project, one frozen version and a real short MP4 render, shared by
 * the review route tests so package and assessment tests exercise the same
 * server the browser talks to. */
export const reviewHtml =
  '<html><head></head><body><div data-composition-id="main" data-width="64" data-height="96" data-duration="0.1">a</div></body></html>';

function renderClip(output: string) {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=64x96:r=30:d=0.1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

export function reviewFixture(fail = false) {
  const dir = versionTestProject({ "index.html": reviewHtml });
  const { version } = saveProjectVersion(dir, {
    expectedRevision: sourceRevision(projectVersionFiles(dir)),
    expectedIndex: null,
    name: "Ensimmäinen",
  });
  const adapter = {
    listProjects: () => [],
    resolveProject: (id: string) => ({ id, dir }),
    bundle: async () => null,
    lint: () => ({ findings: [] }),
    runtimeUrl: "/api/runtime.js",
    rendersDir: () => dir,
    startRender: ({ outputPath }): RenderJobState => {
      if (fail) return { id: "r", status: "failed", progress: 0, outputPath, error: "no" };
      renderClip(outputPath);
      return { id: "r", status: "complete", progress: 1, outputPath };
    },
  } satisfies StudioApiAdapter;
  const app = new Hono();
  registerAriReviewRoutes(app, adapter);
  return { app, dir, version, adapter };
}

export const reviewJson = async (response: Response) =>
  (await response.json()) as Record<string, never>;
