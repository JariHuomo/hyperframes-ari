import { parseHTML } from "linkedom";
import type { ReviewPackage } from "./reviewPackage.js";
import type { ReviewBoundary, ReviewCoverage } from "./reviewBoundaries.js";

const coverages: ReviewCoverage[] = [
  "whole-video-first-last-only",
  "first-version",
  "changed-motion-boundaries",
  "changed-motion-boundaries-partial",
];
export function reviewDimensions(html: string) {
  const { document } = parseHTML(html);
  const root = document.querySelector("[data-composition-id]");
  const values = ["data-width", "data-height", "data-duration"].map((attr) =>
    Number(root?.getAttribute(attr)),
  );
  if (!values.every((v) => Number.isFinite(v) && v > 0))
    throw new Error("Tarkistettavan version koko tai kesto puuttuu.");
  return { width: values[0]!, height: values[1]!, frames: Math.ceil(values[2]! * 30) };
}
export function validateReviewManifest(value: ReviewPackage, id: string) {
  const binding = [value.versionId, value.sourceRevision];
  if (
    !binding.every((v) => typeof v === "string" && v.length > 0) ||
    value.id !== id ||
    value.schema !== 1
  )
    throw new Error("Tarkistuspaketin versiosidonta on vioittunut.");
  validateMedia(value);
  if (
    !coverages.includes(value.coverage) ||
    !Array.isArray(value.coverageNotes) ||
    value.settings?.fps !== 30 ||
    value.settings?.format !== "mp4"
  )
    throw new Error("Tarkistuspaketin kattavuus tai asetukset ovat vioittuneet.");
  validateBoundaries(value);
}
function validateMedia(value: ReviewPackage) {
  const m = value.measured;
  if (
    !m ||
    ![m.width, m.height, m.frames, m.fps, m.duration].every((v) => Number.isFinite(v) && v > 0)
  )
    throw new Error("Tarkistuspaketin mittaukset ovat vioittuneet.");
  if (value.video?.path !== "video.mp4" || value.frames?.length !== 2)
    throw new Error("Tarkistuspaketin aineistot ovat vioittuneet.");
  const expected = [
    { path: "first.png", frame: 0 },
    { path: "last.png", frame: m.frames - 1 },
  ];
  value.frames.forEach((item, index) => {
    const bound = expected[index]!;
    if (item.path !== bound.path || item.frame !== bound.frame || item.time !== item.frame / m.fps)
      throw new Error("Tarkistuspaketin ruutunumerot ovat vioittuneet.");
  });
}
/** Every boundary sample must name a published frame of its OWN version's video. */
function validateBoundaries(value: ReviewPackage) {
  const { boundaryFrames: frames, boundaries } = value;
  if (!Array.isArray(frames) || !Array.isArray(boundaries))
    throw new Error("Tarkistuspaketin rajat ovat vioittuneet.");
  if (boundaries.length && value.coverage === "whole-video-first-last-only")
    throw new Error("Tarkistuspaketin kattavuus ei vastaa rajoja.");
  const byPath = indexBoundaryFrames(value);
  for (const boundary of boundaries) validateBoundary(boundary, byPath, value);
}
/** Published boundary frames by path, refusing a renamed, duplicated or retimed one. */
function indexBoundaryFrames(value: ReviewPackage) {
  const byPath = new Map<string, ReviewPackage["boundaryFrames"][number]>();
  for (const frame of value.boundaryFrames) {
    const valid =
      /^boundary-\d+\.png$/.test(frame.path) &&
      !byPath.has(frame.path) &&
      frame.time === frame.frame / frameRateOf(value, frame.versionId);
    if (!valid) throw new Error("Tarkistuspaketin rajaruudut ovat vioittuneet.");
    byPath.set(frame.path, frame);
  }
  return byPath;
}
/** The fps of the video a sample of `versionId` must have come from; NaN when unknown. */
function frameRateOf(value: ReviewPackage, versionId: string): number {
  if (versionId === value.versionId) return value.measured.fps;
  const previous = value.previousMeasured;
  return versionId === value.previousVersionId && previous ? previous.fps : Number.NaN;
}
function validateBoundary(
  boundary: ReviewBoundary,
  byPath: Map<string, { frame: number; versionId: string }>,
  value: ReviewPackage,
) {
  const versions = [value.versionId, value.previousVersionId];
  if (!versions.includes(boundary.versionId) || boundary.samples?.length !== 3)
    throw new Error("Tarkistusrajan versiosidonta on vioittunut.");
  for (const sample of boundary.samples)
    if (!sampleMatches(sample, boundary, byPath))
      throw new Error("Tarkistusrajan näyte on vioittunut.");
}
/** A sample is either an image of its own version's published frame, or no image at all. */
function sampleMatches(
  sample: ReviewBoundary["samples"][number],
  boundary: ReviewBoundary,
  byPath: Map<string, { frame: number; versionId: string }>,
): boolean {
  if (sample.status === "outside-video") return sample.path === null;
  const frame = sample.path === null ? undefined : byPath.get(sample.path);
  return frame?.frame === sample.frame && frame.versionId === boundary.versionId;
}
