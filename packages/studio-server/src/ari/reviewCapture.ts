import { join } from "node:path";
import { extractReviewFrame } from "./reviewMedia.js";
import { reviewAsset, type ReviewAsset } from "./reviewAssets.js";
import {
  boundaryFrames,
  isInsideVideo,
  type ReviewBoundary,
  type ReviewBoundarySample,
} from "./reviewBoundaries.js";

/**
 * Ari · boundary frame capture (D4)
 *
 * Turns planned boundary times into real PNGs pulled from the version's OWN
 * video. A frame outside that video is published as `outside-video` with no
 * image, and a frame a previous sample already captured is published as
 * `reused` pointing at the same bytes — the reviewer sees both facts.
 */
export interface ReviewVideo {
  readonly file: string;
  readonly fps: number;
  readonly frames: number;
}
export interface BoundaryFrameAsset extends ReviewAsset {
  frame: number;
  time: number;
  versionId: string;
}
export async function captureBoundaryFrames(
  staging: string,
  boundaries: ReviewBoundary[],
  videos: Map<string, ReviewVideo>,
): Promise<BoundaryFrameAsset[]> {
  const captured = new Map<string, BoundaryFrameAsset>();
  for (const boundary of boundaries) {
    const video = videos.get(boundary.versionId);
    if (!video) throw new Error("Tarkistusrajalta puuttuu oman versionsa video.");
    const samples: ReviewBoundarySample[] = [];
    for (const { position, frame } of boundaryFrames(boundary.masterTime, video.fps)) {
      const time = frame / video.fps;
      if (!isInsideVideo(frame, video.frames)) {
        samples.push({ position, frame, time, status: "outside-video", path: null });
        continue;
      }
      const key = `${boundary.versionId}:${frame}`;
      const existing = captured.get(key);
      if (existing) {
        samples.push({ position, frame, time, status: "reused", path: existing.path });
        continue;
      }
      const path = `boundary-${captured.size}.png`;
      await extractReviewFrame(join(staging, video.file), frame, join(staging, path));
      captured.set(key, {
        ...reviewAsset(staging, path),
        frame,
        time,
        versionId: boundary.versionId,
      });
      samples.push({ position, frame, time, status: "captured", path });
    }
    boundary.samples = samples;
  }
  return [...captured.values()];
}
