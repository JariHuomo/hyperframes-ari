import { createReviewOverview, type ReviewOverview } from "./reviewOverview.js";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { reviewDimensions, validateReviewManifest } from "./reviewValidation.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createFrozenVersionSnapshot } from "./versionSnapshot.js";
import { confinedPath } from "./conditionalFiles.js";
import { reviewAsset, type ReviewAsset } from "./reviewAssets.js";
import { probeReviewVideo, extractReviewFrame } from "./reviewMedia.js";
import {
  planReviewBoundaries,
  type ReviewBoundary,
  type ReviewCoverage,
} from "./reviewBoundaries.js";
import {
  captureBoundaryFrames,
  type BoundaryFrameAsset,
  type ReviewVideo,
} from "./reviewCapture.js";

export interface ReviewRenderer {
  /** Use the local Studio render adapter; input contains only verified frozen bytes. */
  (directory: string, output: string): Promise<void>;
}
const directory = ".ari-notebook/review-packages";
const settings = { fps: 30, format: "mp4", quality: "standard", entryFile: "index.html" } as const;
type Measured = Awaited<ReturnType<typeof probeReviewVideo>>["measured"];
export interface ReviewPackage {
  schema: 1;
  id: string;
  versionId: string;
  sourceRevision: string;
  versionName: string | null;
  /** The frozen version the boundaries were compared against, if any. */
  previousVersionId: string | null;
  previousVersionName: string | null;
  createdAt: number;
  settings: typeof settings;
  coverage: ReviewCoverage;
  /** Exact reasons the coverage is partial; empty when nothing was refused. */
  coverageNotes: string[];
  measured: Measured;
  previousMeasured: Measured | null;
  video: ReviewAsset;
  previousVideo: ReviewAsset | null;
  frames: (ReviewAsset & { frame: number; time: number })[];
  boundaryFrames: BoundaryFrameAsset[];
  boundaries: ReviewBoundary[];
  /** Optional only for packages created before overview export was added. */
  overview?: ReviewOverview;
}
export interface PrepareReviewOptions {
  /** Compare against this frozen version; without it coverage is `first-version`. */
  previousVersionId?: string | null;
}
function packagePath(root: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Tarkistuspaketin tunniste ei kelpaa.");
  return confinedPath(root, `${directory}/${id}`);
}
/** Render one frozen directory and verify it against that version's own root composition. */
async function renderSide(
  snapshot: { dir: string; files: Record<string, Buffer> },
  render: ReviewRenderer,
  staging: string,
  file: string,
) {
  const expected = reviewDimensions(snapshot.files["index.html"]?.toString() ?? "");
  const output = join(staging, file);
  await render(snapshot.dir, output);
  const { measured, raw } = await probeReviewVideo(output);
  if (measured.fps !== settings.fps)
    throw new Error("Tarkistusvideon kuvataajuus poikkeaa asetuksesta.");
  if (
    measured.width !== expected.width ||
    measured.height !== expected.height ||
    measured.frames !== expected.frames
  )
    throw new Error("Tarkistusvideo ei vastaa koko jäädytettyä aikajanaa.");
  return { measured, raw, video: { file, fps: measured.fps, frames: measured.frames } };
}
async function firstAndLast(staging: string, video: string, measured: Measured) {
  const frames: ReviewPackage["frames"] = [];
  for (const [path, frame] of [
    ["first.png", 0],
    ["last.png", measured.frames - 1],
  ] as const) {
    await extractReviewFrame(join(staging, video), frame, join(staging, path));
    frames.push({ ...reviewAsset(staging, path), frame, time: frame / measured.fps });
  }
  return frames;
}
/** Private staging followed by one directory rename. Readers never see partial packages. */
export async function prepareReviewPackage(
  root: string,
  versionId: string,
  render: ReviewRenderer,
  options: PrepareReviewOptions = {},
): Promise<ReviewPackage> {
  const snapshot = createFrozenVersionSnapshot(root, versionId);
  const previous = options.previousVersionId
    ? createFrozenVersionSnapshot(root, options.previousVersionId)
    : null;
  let staging: string | undefined;
  try {
    if (previous?.version.id === snapshot.version.id)
      throw new Error("Vertailuversion on oltava eri versio.");
    const plan = planReviewBoundaries(
      { versionId: snapshot.version.id, files: snapshot.files },
      previous ? { versionId: previous.version.id, files: previous.files } : null,
    );
    const parent = confinedPath(root, directory);
    mkdirSync(parent, { recursive: true });
    staging = mkdtempSync(join(parent, ".preparing-"));
    const current = await renderSide(snapshot, render, staging, "video.mp4");
    const videos = new Map<string, ReviewVideo>([[snapshot.version.id, current.video]]);
    const needsPrevious = previous !== null && plan.sampledVersions.includes(previous.version.id);
    const before = needsPrevious
      ? await renderSide(previous, render, staging, "previous.mp4")
      : null;
    if (before && previous) videos.set(previous.version.id, before.video);
    const frames = await firstAndLast(staging, "video.mp4", current.measured);
    const boundaryFrames = await captureBoundaryFrames(staging, plan.boundaries, videos);
    const overview = await createReviewOverview(staging, current.measured);
    const manifest: ReviewPackage = {
      overview,
      schema: 1,
      id: randomUUID(),
      versionId: snapshot.version.id,
      sourceRevision: snapshot.version.revision,
      versionName: snapshot.version.name,
      previousVersionId: previous?.version.id ?? null,
      previousVersionName: previous?.version.name ?? null,
      createdAt: Date.now(),
      settings,
      coverage: plan.coverage,
      coverageNotes: plan.notes,
      measured: current.measured,
      previousMeasured: before?.measured ?? null,
      video: reviewAsset(staging, "video.mp4"),
      previousVideo: before ? reviewAsset(staging, "previous.mp4") : null,
      frames,
      boundaryFrames,
      boundaries: plan.boundaries,
    };
    writeFileSync(
      join(staging, "ffprobe.json"),
      JSON.stringify({ current: current.raw, previous: before?.raw ?? null }, null, 2),
      { flag: "wx" },
    );
    writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2), {
      flag: "wx",
    });
    renameSync(staging, packagePath(root, manifest.id));
    staging = undefined;
    return manifest;
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    snapshot.dispose();
    previous?.dispose();
  }
}
function publishedAssets(manifest: ReviewPackage): ReviewAsset[] {
  return [
    manifest.video,
    ...(manifest.overview ? [manifest.overview] : []),
    ...(manifest.previousVideo ? [manifest.previousVideo] : []),
    ...manifest.frames,
    ...manifest.boundaryFrames,
  ];
}
export function readReviewPackage(root: string, id: string): ReviewPackage {
  const dir = packagePath(root, id);
  const manifest: ReviewPackage = JSON.parse(
    readFileSync(confinedPath(dir, "manifest.json"), "utf8"),
  );
  validateReviewManifest(manifest, id);
  for (const item of publishedAssets(manifest)) {
    const found = reviewAsset(dir, item.path);
    if (found.sha256 !== item.sha256 || found.bytes !== item.bytes)
      throw new Error("Tarkistusaineisto puuttuu tai on vioittunut.");
  }
  return manifest;
}
export function readReviewAsset(root: string, id: string, path: string) {
  const manifest = readReviewPackage(root, id);
  if (!publishedAssets(manifest).some((item) => item.path === path))
    throw new Error("Aineisto ei kuulu tarkistuspakettiin.");
  return readFileSync(confinedPath(packagePath(root, id), path));
}
