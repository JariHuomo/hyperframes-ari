import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Hono } from "hono";

/**
 * GSAP plugins the studio may have to inject into a preview it did not author.
 *
 * They used to be pulled from jsdelivr at preview time, which made the editor
 * quietly require the internet: with the network blocked, the aborted script
 * raised a page error and the soft reload that follows an edit lost its
 * timeline. `gsap` is already a dependency of this package, so the same file is
 * served from disk on the studio's own origin instead.
 *
 * Only this fixed map may be served — the path never reaches the filesystem.
 */
const VENDOR_SCRIPTS: Record<string, string> = {
  "gsap.min.js": "gsap/dist/gsap.min.js",
  "MotionPathPlugin.min.js": "gsap/dist/MotionPathPlugin.min.js",
  "CustomEase.min.js": "gsap/dist/CustomEase.min.js",
};

export const VENDOR_SCRIPT_BASE = "/api/vendor/gsap";
export function vendorScriptUrl(file: keyof typeof VENDOR_SCRIPTS | string): string {
  return `${VENDOR_SCRIPT_BASE}/${file}`;
}

const require_ = createRequire(import.meta.url);
const cache = new Map<string, string>();

export function readVendorScript(file: string): string | null {
  const specifier = VENDOR_SCRIPTS[file];
  if (!specifier) return null;
  const cached = cache.get(file);
  if (cached !== undefined) return cached;
  try {
    const source = readFileSync(require_.resolve(specifier), "utf8");
    cache.set(file, source);
    return source;
  } catch {
    return null;
  }
}

export function registerVendorScriptRoutes(api: Hono): void {
  api.get("/vendor/gsap/:file", (c) => {
    const source = readVendorScript(c.req.param("file"));
    if (source === null) return c.json({ error: "unknown vendor script" }, 404);
    return c.body(source, 200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });
}
