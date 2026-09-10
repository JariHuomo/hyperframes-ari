import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { readVendorScript, registerVendorScriptRoutes, vendorScriptUrl } from "./vendorScripts.js";

function app(): Hono {
  const api = new Hono();
  registerVendorScriptRoutes(api);
  return api;
}

describe("vendor gsap scripts", () => {
  it("serves the plugin the preview injects, from this server's own dependency", async () => {
    const res = await app().request("/vendor/gsap/MotionPathPlugin.min.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    const body = await res.text();
    expect(body).toContain("MotionPathPlugin");
    expect(body.length).toBeGreaterThan(1000);
  });

  it("serves gsap itself, so the preview's error fallback stays local too", async () => {
    const res = await app().request("/vendor/gsap/gsap.min.js");
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(1000);
  });

  it("serves only the named files — the path never reaches the filesystem", async () => {
    for (const path of [
      "/vendor/gsap/package.json",
      "/vendor/gsap/..%2F..%2Fpackage.json",
      "/vendor/gsap/CustomBounce.min.js",
    ]) {
      const res = await app().request(path);
      expect(res.status).toBe(404);
    }
    expect(readVendorScript("../../package.json")).toBeNull();
  });

  it("addresses the scripts on this origin, never a CDN", () => {
    expect(vendorScriptUrl("MotionPathPlugin.min.js")).toBe(
      "/api/vendor/gsap/MotionPathPlugin.min.js",
    );
  });
});
