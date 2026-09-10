import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export async function probeReviewVideo(path: string) {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    path,
  ]);
  const raw = JSON.parse(stdout);
  const video = raw.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  if (!video) throw new Error("Tarkistusvideo puuttuu.");
  const [num, den] = String(video.avg_frame_rate).split("/").map(Number);
  const measured = {
    width: Number(video.width),
    height: Number(video.height),
    fps: num! / den!,
    frames: Number(video.nb_read_frames),
    duration: Number(video.duration ?? raw.format.duration),
    audio: raw.streams.some((s: { codec_type: string }) => s.codec_type === "audio"),
  };
  if (
    ![measured.width, measured.height, measured.fps, measured.frames, measured.duration].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new Error("Tarkistusvideon mittaus epäonnistui.");
  return { measured, raw };
}
export async function extractReviewFrame(video: string, frame: number, output: string) {
  await exec("ffmpeg", [
    "-v",
    "error",
    "-i",
    video,
    "-vf",
    `select=eq(n\\,${frame})`,
    "-frames:v",
    "1",
    "-y",
    output,
  ]);
}
