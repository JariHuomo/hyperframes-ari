import { expect, it } from "vitest";
import { validateReviewManifest, reviewDimensions } from "./reviewValidation";
import type { ReviewPackage } from "./reviewPackage";

const measured = { width: 64, height: 96, fps: 30, frames: 6, duration: 0.2, audio: false };
const base = (): ReviewPackage =>
  structuredClone({
    schema: 1,
    id: "package",
    versionId: "now",
    sourceRevision: "revision",
    versionName: null,
    previousVersionId: "then",
    previousVersionName: null,
    createdAt: 0,
    settings: { fps: 30, format: "mp4", quality: "standard", entryFile: "index.html" },
    coverage: "changed-motion-boundaries",
    coverageNotes: [],
    measured,
    previousMeasured: measured,
    video: { path: "video.mp4", sha256: "a", bytes: 1 },
    previousVideo: { path: "previous.mp4", sha256: "b", bytes: 1 },
    frames: [
      { path: "first.png", sha256: "c", bytes: 1, frame: 0, time: 0 },
      { path: "last.png", sha256: "d", bytes: 1, frame: 5, time: 5 / 30 },
    ],
    boundaryFrames: [
      { path: "boundary-0.png", sha256: "e", bytes: 1, frame: 2, time: 2 / 30, versionId: "then" },
    ],
    boundaries: [
      {
        motionId: "m",
        sourceFile: "scenes/card.html",
        target: "#m",
        change: "removed",
        edge: "start",
        versionId: "then",
        instance: { hostPath: "a", label: "A", index: 1, count: 1 },
        localTime: 0.1,
        masterTime: 0.1,
        withinInstance: true,
        samples: [
          {
            position: "before",
            frame: 2,
            time: 2 / 30,
            status: "captured",
            path: "boundary-0.png",
          },
          { position: "at", frame: 2, time: 2 / 30, status: "reused", path: "boundary-0.png" },
          { position: "after", frame: 6, time: 0.2, status: "outside-video", path: null },
        ],
      },
    ],
  } as ReviewPackage);

it("accepts a complete boundary manifest", () => {
  expect(() => validateReviewManifest(base(), "package")).not.toThrow();
  expect(
    reviewDimensions(
      '<div data-composition-id="m" data-width="64" data-height="96" data-duration="0.2"></div>',
    ),
  ).toEqual({ width: 64, height: 96, frames: 6 });
});
it.each([
  ["identity", (v: ReviewPackage) => (v.versionId = ""), "versiosidonta on vioittunut"],
  ["coverage", (v: ReviewPackage) => (v.coverage = "muu" as never), "kattavuus tai asetukset"],
  ["notes", (v: ReviewPackage) => (v.coverageNotes = null as never), "kattavuus tai asetukset"],
  ["measurements", (v: ReviewPackage) => (v.measured.fps = 0), "mittaukset ovat vioittuneet"],
  [
    "legacy coverage with boundaries",
    (v: ReviewPackage) => (v.coverage = "whole-video-first-last-only"),
    "kattavuus ei vastaa rajoja",
  ],
  [
    "missing boundary list",
    (v: ReviewPackage) => (v.boundaries = null as never),
    "rajat ovat vioittuneet",
  ],
  ["renamed frame", (v: ReviewPackage) => (v.boundaryFrames[0]!.path = "video.mp4"), "rajaruudut"],
  [
    "duplicate frame",
    (v: ReviewPackage) => v.boundaryFrames.push({ ...v.boundaryFrames[0]! }),
    "rajaruudut",
  ],
  ["retimed frame", (v: ReviewPackage) => (v.boundaryFrames[0]!.time = 9), "rajaruudut"],
  [
    "frame from an unbound version",
    (v: ReviewPackage) => (v.boundaryFrames[0]!.versionId = "muu"),
    "rajaruudut",
  ],
  [
    "frame from a version with no measured video",
    (v: ReviewPackage) => (v.previousMeasured = null),
    "rajaruudut",
  ],
  [
    "boundary from an unbound version",
    (v: ReviewPackage) => (v.boundaries[0]!.versionId = "muu"),
    "rajan versiosidonta",
  ],
  ["dropped sample", (v: ReviewPackage) => v.boundaries[0]!.samples.pop(), "rajan versiosidonta"],
  [
    "outside-video sample that still claims an image",
    (v: ReviewPackage) => (v.boundaries[0]!.samples[2]!.path = "boundary-0.png"),
    "näyte on vioittunut",
  ],
  [
    "sample naming an unpublished frame",
    (v: ReviewPackage) => (v.boundaries[0]!.samples[0]!.path = "boundary-7.png"),
    "näyte on vioittunut",
  ],
  [
    "sample naming another frame number",
    (v: ReviewPackage) => (v.boundaries[0]!.samples[0]!.frame = 3),
    "näyte on vioittunut",
  ],
  [
    "sample taken from the other version's video",
    (v: ReviewPackage) => (v.boundaryFrames[0]!.versionId = v.versionId),
    "näyte on vioittunut",
  ],
])("refuses %s", (_name, damage, message) => {
  const manifest = base();
  damage(manifest);
  expect(() => validateReviewManifest(manifest, "package")).toThrow(message);
});
