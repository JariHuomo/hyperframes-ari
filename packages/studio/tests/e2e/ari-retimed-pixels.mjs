import { createRequire } from "node:module";
import assert from "node:assert/strict";
const sharp = createRequire(new URL("../../../studio-server/package.json", import.meta.url))(
  "sharp",
);
export async function verifyRetimedPixels(current) {
  // The real renders are opt-in (`ARI_SCENE_EXPORT=1`); without them there is
  // no video to measure and nothing here has anything to say.
  if (!current.afterExport) return;
  const result = [];
  for (const time of [0.5, 1.5, 3.5, 4.5]) {
    const local = 0.5 + (time % 3) * 0.5;
    const before = await markerLeft(current.beforeExport, time);
    const after = await markerLeft(current.afterExport, time);
    const expectedBefore = 100 + local * 200;
    const expectedAfter = time < 3 ? expectedBefore : 100 + ((local - 0.5) / 1.5) * 400;
    assert(
      Math.abs(before - expectedBefore) <= 2,
      `before ${time}: ${before} != ${expectedBefore}`,
    );
    assert(Math.abs(after - expectedAfter) <= 2, `after ${time}: ${after} != ${expectedAfter}`);
    result.push({ time, local, before, after, expectedBefore, expectedAfter });
  }
  current.pixelTimingProof = {
    tolerancePx: 2,
    reason: "H.264 chroma subsampling and fractional pixel edges",
    samples: result,
  };
}
async function markerLeft(output, time) {
  const sample = output.samples.find((s) => s.frame === Math.round(time * 30));
  assert(sample, `missing frame ${time}`);
  const { data, info } = await sharp(sample.image).raw().toBuffer({ resolveWithObject: true });
  for (let x = 0; x < info.width; x++) {
    const at = (500 * info.width + x) * info.channels;
    if (isRed(data, at)) return x;
  }
  throw new Error(`red marker missing at ${time}`);
}

function isRed(data, at) {
  return data[at] > 150 && data[at + 1] < 80 && data[at + 2] < 80;
}
