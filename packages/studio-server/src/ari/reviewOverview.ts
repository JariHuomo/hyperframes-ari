import sharp, { type OverlayOptions } from "sharp";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { extractReviewFrame } from "./reviewMedia.js";
import { reviewAsset, type ReviewAsset } from "./reviewAssets.js";

export interface ReviewOverview extends ReviewAsset {
  width: number;
  height: number;
  samples: { frame: number; time: number }[];
}

/** A bounded chronological contact sheet, including the exact first and last frame. */
export async function createReviewOverview(
  dir: string,
  measured: { frames: number; fps: number; width: number; height: number },
): Promise<ReviewOverview> {
  const count = Math.min(12, measured.frames);
  const samples = Array.from({ length: count }, (_, i) => {
    const frame = count === 1 ? 0 : Math.round((i * (measured.frames - 1)) / (count - 1));
    return { frame, time: frame / measured.fps };
  });
  const columns = Math.min(4, count),
    cellWidth = 360;
  const pictureHeight = Math.round((cellWidth * measured.height) / measured.width);
  const cellHeight = pictureHeight + 38,
    header = 72;
  const width = columns * cellWidth,
    height = header + Math.ceil(count / columns) * cellHeight;
  if (pictureHeight > 1440 || height > 6000)
    throw new Error("Mainoksen kuvasuhde on liian kapea kuvakoosteelle.");
  const overlays: OverlayOptions[] = [];
  const text = (label: string, w: number, h: number) =>
    Buffer.from(
      `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#111827"/><text x="12" y="26" fill="white" font-family="sans-serif" font-size="18">${label}</text></svg>`,
    );
  overlays.push({
    input: text(`MAINOKSEN KUVAKOOSTE · ${count} näyteruutua · luonnos`, width, header),
    left: 0,
    top: 0,
  });
  for (const [i, sample] of samples.entries()) {
    const temporary = join(dir, `overview-sample-${i}.png`);
    try {
      await extractReviewFrame(join(dir, "video.mp4"), sample.frame, temporary);
      const input = await sharp(temporary)
        .resize(cellWidth, pictureHeight, { fit: "contain" })
        .png()
        .toBuffer();
      const left = (i % columns) * cellWidth,
        top = header + Math.floor(i / columns) * cellHeight;
      overlays.push({ input, left, top });
      overlays.push({
        input: text(`${sample.time.toFixed(2)} s · ruutu ${sample.frame}`, cellWidth, 38),
        left,
        top: top + pictureHeight,
      });
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  await sharp({ create: { width, height, channels: 3, background: "#111827" } })
    .composite(overlays)
    .png()
    .toFile(join(dir, "overview.png"));
  return { ...reviewAsset(dir, "overview.png"), width, height, samples };
}
