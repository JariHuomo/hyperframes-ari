import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

export function ariControls(page) {
  return {
    button: (name) => page.locator(`button::-p-text(${name})`),
    fill: (label, value) => page.locator(`[aria-label="${label}"]`).fill(value),
  };
}
export async function prepareDownload(page, directory, timeoutMs) {
  mkdirSync(directory, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: directory,
    eventsEnabled: true,
  });
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("download timed out")), timeoutMs);
    cdp.on("Browser.downloadProgress", (event) => {
      if (event.state === "completed") {
        clearTimeout(timer);
        resolve(event);
      } else if (event.state === "canceled") {
        clearTimeout(timer);
        reject(new Error("download canceled"));
      }
    });
  });
  return { completed };
}
export function probeVideo(video) {
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
    { encoding: "utf8" },
  );
  assert.equal(probe.status, 0, probe.stderr);
  return JSON.parse(probe.stdout);
}

export async function downloadExport(page, directory, completed, timeoutMs) {
  const { button } = ariControls(page);
  await button("Vie video · MP4").click();
  const selector = '[aria-label="Videon vienti"] a[download]';
  await page.waitForSelector(selector, { timeout: timeoutMs });
  const filename = await page.$eval(selector, (element) => element.download);
  await page.locator(selector).click();
  const event = await completed;
  const video = join(directory, filename);
  assert(existsSync(video));
  return { filename, event, video };
}
