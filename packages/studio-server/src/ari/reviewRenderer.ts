import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StudioApiAdapter } from "../types.js";
import type { ReviewRenderer } from "./reviewPackage.js";

/** Network requests from authored scripts are blocked before any script executes. */
function constrainHtml(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) constrainHtml(path);
    else if (entry.name.endsWith(".html")) {
      const html = readFileSync(path, "utf8");
      const policy =
        "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' data:; style-src 'self' 'unsafe-inline' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
      if (!/<head(?:\s[^>]*)?>/i.test(html))
        throw new Error("Tarkistus tarvitsee HTML-lähteen head-osion.");
      writeFileSync(
        path,
        html.replace(
          /<head(?:\s[^>]*)?>/i,
          (head) => head + `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
        ),
      );
    }
  }
}
/** Same startRender seam as Studio export, with an isolated frozen input directory. */
export function createReviewRenderer(startRender: StudioApiAdapter["startRender"]): ReviewRenderer {
  return async (dir, outputPath) => {
    constrainHtml(dir);
    const state = startRender({
      project: { id: "review", dir, title: "Tarkistus" },
      outputPath,
      format: "mp4",
      fps: { num: 30, den: 1 },
      quality: "standard",
      jobId: "review",
      composition: "index.html",
      telemetryOptOut: true,
    });
    while (state.status === "rendering") await new Promise((resolve) => setTimeout(resolve, 25));
    if (state.status !== "complete") {
      state.cancel?.();
      // Carry the adapter's reason: without it a failed preparation is
      // indistinguishable from every other failed preparation.
      throw new Error(
        `Tarkistusvideon renderöinti epäonnistui.${state.error ? ` ${state.error}` : ""}`,
      );
    }
  };
}
