import { verifyRetimedPixels } from "./ari-retimed-pixels.mjs";
import { exportFaultAcceptance } from "./ari-export-faults.mjs";
/** Separate authored regression fixture: playback-start + constant rate, never the UI-built ad. */
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { acceptanceRun, tool } from "./ari-acceptance-browser.mjs";
import { exportSceneAcceptance } from "./ari-scene-export.mjs";
const { root, evidence, report, pageFor, run } = await acceptanceRun(
  process.env.ARI_RETIMED_EVIDENCE ?? "screenshots/2026-09-10-a5/retimed",
  { hash: "?v=1&t=0&tab=design&rc=0", tool: "studio_edit_scene" },
);
await run(async () => {
  const name = `a5-retimed-${Date.now()}`;
  const dir = join(root, "packages/studio/data/projects", name);
  cpSync(join(import.meta.dirname, "fixtures/ari-retimed"), dir, { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  cpSync(
    createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"),
    join(dir, "assets/gsap.min.js"),
  );
  const p = await pageFor(name, 1440, 900);
  const current = { mode: "retimed", width: 1440, project: name, checks: [] };
  report.modes.push(current);
  const original = readFileSync(join(dir, "scenes/card.html"), "utf8");
  const list = await tool(p, "studio_scenes", { sourceFile: "index.html" });
  assert(list.ok, JSON.stringify(list));
  const second = list.rows[1];
  const args = {
    sourceFile: "index.html",
    action: "detach",
    target: second.target,
    fileName: "own.html",
  };
  const plan = await tool(p, "studio_prepare_scene", args);
  assert(plan.ok, JSON.stringify(plan));
  current.receipt = await tool(p, "studio_edit_scene", {
    ...args,
    reviewVersion: plan.reviewVersion,
  });
  assert(current.receipt.ok, JSON.stringify(current.receipt));
  assert.equal(readFileSync(join(dir, "scenes/own.html"), "utf8"), original);
  current.runtime = await verifyRetimedRuntime(p);
  current.final = await tool(p, "studio_scenes", { sourceFile: "index.html" });
  current.final.sampleTimes = [0.5, 1.5, 3.5, 4.5];
  await exportSceneAcceptance({ p, current, root, evidence });
  current.beforeExport = current.export;
  const own = await tool(p, "studio_elements", { sourceFile: "scenes/own.html" });
  const marker = own.elements.find((e) => e.name === "Mittapalkki");
  assert(marker);
  assert((await tool(p, "studio_select", { handle: marker.handle, instance: "second" })).ok);
  const inspected = await tool(p, "studio_inspect");
  current.inspected = inspected;
  // Existing inspect lists the authored GSAP animation; the id is read, never guessed.
  const animations = inspected.animations ?? inspected.gsap?.animations;
  assert(animations?.length, JSON.stringify(inspected));
  const edit = await tool(p, "studio_update_animation", {
    handle: marker.handle,
    instance: "second",
    animationId: animations[0].animationId,
    position: 0.5,
    duration: 1.5,
    ease: "none",
  });
  assert(edit.ok, JSON.stringify(edit));
  current.motionEdit = edit;
  assert.equal(readFileSync(join(dir, "scenes/card.html"), "utf8"), original);
  current.mode = "retimed-after";
  await exportSceneAcceptance({ p, current, root, evidence });
  current.checks.push(
    "playback-start 0.5 and rate 0.5 runtime match; independent copy motion edit retains original bytes",
  );
  current.afterExport = current.export;
  await verifyRetimedPixels(current);
  await exportFaultAcceptance({ p, current, root, evidence, marker });
  current.ok = true;
  await p.close();
});

async function verifyRetimedRuntime(p) {
  const runtime = [];
  for (const time of [0.5, 1.5, 3.5, 4.5]) {
    assert((await tool(p, "studio_seek", { time })).ok);
    const frame = await (await p.$("pierce/iframe")).contentFrame();
    const item = await frame.evaluate(() =>
      Object.fromEntries(
        Object.entries(window.__timelines)
          .filter(([, tl]) => typeof tl.time === "function")
          .map(([key, tl]) => [key, tl.time()]),
      ),
    );
    const host = time < 3 ? "first" : "second";
    assert(Math.abs(item[host] - (0.5 + (time % 3) * 0.5)) < 0.001, JSON.stringify(item));
    runtime.push({ time, host, local: item[host] });
  }
  return runtime;
}
