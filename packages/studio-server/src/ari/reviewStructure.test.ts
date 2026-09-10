import { expect, it } from "vitest";
import { readReviewStructure, instanceLocalToMaster } from "./reviewStructure";

const composition = (id: string, duration: number, body: string) =>
  `<html><head></head><body><div id="${id}" data-composition-id="${id}" data-width="64" data-height="96" data-duration="${duration}">${body}</div></body></html>`;
const host = (id: string, src: string, attrs: string) =>
  `<div id="${id}" class="clip" data-composition-src="${src}" ${attrs}></div>`;
const files = (extra: Record<string, string> = {}): Record<string, Buffer> =>
  Object.fromEntries(
    Object.entries({
      "index.html": composition(
        "main",
        6,
        host(
          "outer",
          "scenes/outer.html",
          'data-start="1" data-duration="4" data-playback-rate="2"',
        ),
      ),
      "scenes/outer.html": composition(
        "outer",
        4,
        host(
          "inner",
          "inner.html",
          'data-start="1" data-duration="2" data-playback-start="0.5" data-playback-rate="1.5"',
        ),
      ),
      "scenes/inner.html": composition("inner", 3, "<div id='m'></div>"),
      ...extra,
    }).map(([path, html]) => [path, Buffer.from(html)]),
  );

it("chains every level's rate and offset into one master transform", () => {
  const structure = readReviewStructure(files());
  expect(structure.notes).toEqual([]);
  const inner = structure.compositions.get("scenes/inner.html")!.instances[0]!;
  // outer: anchor 1, rate 2. inner starts at outer-local 1 => master 1 + 1/2.
  expect(inner).toMatchObject({
    hostPath: "outer>inner",
    anchor: 1.5,
    playbackStart: 0.5,
    playbackRate: 3,
    visibleStart: 1.5,
  });
  // Its own 3 s clamp is reached before the 2 s host window ends: 1.5 + (3 - 0.5) / 3.
  expect(inner.visibleEnd).toBeCloseTo(1.5 + 2.5 / 3, 9);
  expect(instanceLocalToMaster(inner, 0.5)).toBe(1.5);
  expect(instanceLocalToMaster(inner, 2)).toBeCloseTo(2, 9);
  expect(instanceLocalToMaster(inner, 0.4)).toBeNull();
  expect(instanceLocalToMaster(inner, 3.1)).toBeNull();
});
it("refuses a missing, circular or non-constant scene instead of guessing", () => {
  const missing = files();
  delete missing["scenes/inner.html"];
  expect(readReviewStructure(missing).notes).toEqual([
    "Kooste scenes/inner.html puuttuu jäädytetystä versiosta.",
  ]);
  const cyclic = files({
    "scenes/inner.html": composition("inner", 3, host("back", "outer.html", 'data-duration="1"')),
  });
  expect(readReviewStructure(cyclic).notes[0]).toContain("kehämäinen");
  const broken = files({
    "scenes/outer.html": composition(
      "outer",
      4,
      host("inner", "inner.html", 'data-start="1" data-duration="0"'),
    ),
  });
  expect(readReviewStructure(broken).notes).toEqual(["Kohtauksen outer>inner ajoitus ei kelpaa."]);
  expect(readReviewStructure(files()).compositions.size).toBe(3);
});
