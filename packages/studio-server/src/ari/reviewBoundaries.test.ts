import { expect, it } from "vitest";
import { planReviewBoundaries, boundaryFrames, isInsideVideo } from "./reviewBoundaries";
import { readReviewStructure } from "./reviewStructure";

const host = (id: string, start: number, playbackStart: number, rate: number) =>
  `<div id="${id}" class="clip" data-composition-src="scenes/card.html" data-label="${id}" data-start="${start}" data-duration="2" data-playback-start="${playbackStart}" data-playback-rate="${rate}"></div>`;
const index = `<html><head></head><body><div id="main" data-composition-id="main" data-width="1080" data-height="1920" data-duration="6">${host("a", 0, 0, 1)}${host("b", 2, 0.5, 1.5)}</div></body></html>`;
const card = (script: string) =>
  `<html><head></head><body><div id="card" data-composition-id="card" data-width="1080" data-height="1920" data-duration="2"><div id="m"></div><div id="n"></div></div><script>const tl=gsap.timeline({paused:true});${script}</script></body></html>`;
const files = (script: string): Record<string, Buffer> => ({
  "index.html": Buffer.from(index),
  "scenes/card.html": Buffer.from(card(script)),
});
const before = files("tl.to('#m',{x:100,duration:1},0.25);tl.to('#n',{opacity:1,duration:0.5},1);");
const after = files("tl.to('#m',{x:100,duration:1.5},0.25);");
const plan = (current = after, previous: Record<string, Buffer> | null = before) =>
  planReviewBoundaries(
    { versionId: "now", files: current },
    previous ? { versionId: "then", files: previous } : null,
  );
const find = (change: string, edge: string, host: string) =>
  plan().boundaries.find(
    (b) => b.change === change && b.edge === edge && b.instance.hostPath === host,
  );

it("resolves every instance of a repeated scene, including a retimed one", () => {
  const structure = readReviewStructure(files("tl.to('#m',{x:1,duration:1},0);"));
  const instances = structure.compositions.get("scenes/card.html")!.instances;
  expect(structure.notes).toEqual([]);
  expect(instances.map((i) => [i.hostPath, i.anchor, i.playbackStart, i.playbackRate])).toEqual([
    ["a", 0, 0, 1],
    ["b", 2, 0.5, 1.5],
  ]);
  // The retimed instance stops when its own local clock reaches the scene duration.
  expect(instances[1]!.visibleEnd).toBeCloseTo(3, 9);
});
it("reports a changed motion's edges in master time for both instances", () => {
  expect(find("changed", "start", "a")).toMatchObject({ localTime: 0.25, masterTime: 0.25 });
  expect(find("changed", "end", "a")).toMatchObject({ localTime: 1.75, masterTime: 1.75 });
  const retimed = find("changed", "end", "b")!;
  expect(retimed.masterTime).toBeCloseTo(2 + (1.75 - 0.5) / 1.5, 9);
  expect(retimed.instance).toMatchObject({ index: 2, count: 2 });
});
it("keeps an edge that its instance never reaches, marked instead of dropped", () => {
  const start = find("changed", "start", "b")!;
  expect(start.withinInstance).toBe(false);
  expect(start.masterTime).toBeCloseTo(2 + (0.25 - 0.5) / 1.5, 9);
  expect(find("changed", "start", "a")!.withinInstance).toBe(true);
});
it("samples a removed motion from the previous version's video", () => {
  const removed = plan().boundaries.filter((b) => b.change === "removed");
  expect(removed.map((b) => b.versionId)).toEqual(["then", "then", "then", "then"]);
  expect(removed.map((b) => b.motionId).every((id) => id.length > 0)).toBe(true);
  expect(removed.find((b) => b.instance.hostPath === "a" && b.edge === "start")!.masterTime).toBe(
    1,
  );
  expect(plan().sampledVersions).toEqual(["now", "then"]);
});
it("reports an added motion from the current version only", () => {
  const added = plan(files("tl.to('#m',{x:1,duration:1},0);"), files("")).boundaries;
  expect(added.map((b) => [b.change, b.versionId, b.edge, b.masterTime])).toEqual([
    ["added", "now", "start", 0],
    ["added", "now", "end", 1],
    ["added", "now", "start", 2 + (0 - 0.5) / 1.5],
    ["added", "now", "end", 2 + (1 - 0.5) / 1.5],
  ]);
  expect(plan(files("tl.to('#m',{x:1,duration:1},0);"), files("")).sampledVersions).toEqual([
    "now",
  ]);
});
it("declares first-version coverage without a previous version", () => {
  const first = plan(after, null);
  expect(first).toMatchObject({ coverage: "first-version", boundaries: [], notes: [] });
});
it("never claims complete coverage over a structure it cannot read", () => {
  const broken = files("tl.to('#m',{x:1,duration:1},0);");
  broken["index.html"] = Buffer.from(
    index.replace('data-playback-rate="1.5"', 'data-playback-rate="x"'),
  );
  const result = planReviewBoundaries(
    { versionId: "now", files: broken },
    { versionId: "then", files: before },
  );
  expect(result.coverage).toBe("changed-motion-boundaries-partial");
  expect(result.notes[0]).toContain("ajoitus ei ole vakio");
  expect(plan().coverage).toBe("changed-motion-boundaries");
});
it("rounds a boundary to a frame and marks samples outside the video", () => {
  expect(boundaryFrames(0.25, 30).map((s) => s.frame)).toEqual([7, 8, 9]);
  expect(boundaryFrames(0, 30).map((s) => s.frame)).toEqual([-1, 0, 1]);
  expect(boundaryFrames(5.9833333, 30).map((s) => s.frame)).toEqual([178, 179, 180]);
  expect([-1, 180].map((frame) => isInsideVideo(frame, 180))).toEqual([false, false]);
  expect([0, 179].map((frame) => isInsideVideo(frame, 180))).toEqual([true, true]);
});
