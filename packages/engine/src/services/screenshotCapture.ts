import { type Page } from "puppeteer-core";
import { type CaptureOptions } from "../types.js";
export const cdpSessionCache = new WeakMap<Page, import("puppeteer-core").CDPSession>();

export async function getCdpSession(page: Page): Promise<import("puppeteer-core").CDPSession> {
  let client = cdpSessionCache.get(page);
  if (!client) {
    client = await page.createCDPSession();
    cdpSessionCache.set(page, client);
  }
  return client;
}

export function shouldDefaultCaptureBeyondViewport(
  browserVersion: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  // Regular Chrome's viewport-bound screenshot path can expose a compositor
  // surface shorter than the page viewport on affected macOS builds. In that
  // case Chrome fills the clipped area with the page background. Headless shell
  // reports as HeadlessChrome and keeps the faster viewport-bound path.
  return platform === "darwin" && browserVersion.startsWith("Chrome/");
}

/**
 * BeginFrame result with screenshot data and damage detection.
 */
export interface BeginFrameResult {
  buffer: Buffer;
  hasDamage: boolean;
}

/**
 * Issue a single no-output BeginFrame and race it against `timeoutMs`.
 *
 * On SwiftShader, compositions with many promoted layers (multi-group nested
 * opacity caption animations) can stall the FIRST BeginFrame indefinitely —
 * tested to 30 minutes without completion (style-7/8/10/15-prod). The
 * auto-worker calibration path catches this with its own capped protocol
 * timeout, but renders with an explicit `--workers N` skip calibration and
 * would hang for the full protocol timeout (and never succeed). This probe
 * gives the producer a cheap liveness signal right after session init:
 * `false` means route the render through screenshot capture instead.
 *
 * Healthy comps complete the probe in well under a second on GPU and within
 * a few seconds on SwiftShader. A protocol error also resolves `false` —
 * the safe direction (screenshot capture always works).
 */
export async function probeBeginFrameLiveness(
  page: Page,
  timeoutMs: number,
  // BeginFrame frameTimeTicks must be monotonic per session. The capture loop
  // sends `session.beginFrameTimeTicks + frameIndex * interval`, where the
  // base carries a 10-interval cushion above the warmup loop's last tick —
  // callers probing an initialized session should pass a tick INSIDE that
  // cushion (e.g. base − 5·interval) so warmup < probe < first capture stays
  // monotonic. Omit both params only for a session that will not issue
  // further BeginFrames.
  frameTimeTicks?: number,
  intervalMs?: number,
): Promise<boolean> {
  const client = await getCdpSession(page);
  const params: { frameTimeTicks?: number; interval?: number } = {};
  if (typeof frameTimeTicks === "number") params.frameTimeTicks = frameTimeTicks;
  if (typeof intervalMs === "number") params.interval = intervalMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      client
        .send("HeadlessExperimental.beginFrame", params)
        .then(() => true)
        .catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Capture a frame using HeadlessExperimental.beginFrame.
 *
 * This is an atomic operation: one CDP call runs a single layout-paint-composite
 * cycle and returns the screenshot + hasDamage boolean. Replaces the separate
 * settle → screenshot pipeline with a single deterministic render cycle.
 *
 * Requires chrome-headless-shell with --enable-begin-frame-control and
 * --deterministic-mode flags.
 */
// Cache the last valid screenshot buffer per page for hasDamage=false frames.
// When Chrome reports no visual change, we reuse the previous frame rather than
// attempting Page.captureScreenshot (which times out in beginFrame mode since
// the compositor is paused).
const lastFrameCache = new WeakMap<Page, Buffer>();

const PENDING_FRAME_RETRIES = 5;

async function sendBeginFrame(
  client: import("puppeteer-core").CDPSession,
  params: Parameters<typeof client.send<"HeadlessExperimental.beginFrame">>[1],
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.send("HeadlessExperimental.beginFrame", params);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isPending = msg.includes("Another frame is pending");
      if (isPending && attempt < PENDING_FRAME_RETRIES) {
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        continue;
      }
      if (isPending) {
        throw new Error(
          `[BeginFrame] Frame still pending after ${PENDING_FRAME_RETRIES} retries — CPU overloaded by parallel renders. ` +
            `Reduce concurrent renders or use --docker for isolation.`,
        );
      }
      throw err;
    }
  }
}

export async function beginFrameCapture(
  page: Page,
  options: CaptureOptions,
  frameTimeTicks: number,
  interval: number,
): Promise<BeginFrameResult> {
  const client = await getCdpSession(page);

  const isPng = options.format === "png";
  const screenshot = {
    format: isPng ? "png" : "jpeg",
    quality: isPng ? undefined : (options.quality ?? 80),
    optimizeForSpeed: true,
  } as const;

  const result = await sendBeginFrame(client, { frameTimeTicks, interval, screenshot });

  let buffer: Buffer;
  if (result.screenshotData) {
    buffer = Buffer.from(result.screenshotData, "base64");
    lastFrameCache.set(page, buffer);
  } else {
    const cached = lastFrameCache.get(page);
    if (cached) {
      buffer = cached;
    } else {
      // Frame 0 always has damage, so this path is near-unreachable.
      // Force a composite with a tiny time advance.
      const fallback = await sendBeginFrame(client, {
        frameTimeTicks: frameTimeTicks + 0.001,
        interval,
        screenshot,
      });
      buffer = fallback.screenshotData
        ? Buffer.from(fallback.screenshotData, "base64")
        : Buffer.alloc(0);
      if (buffer.length > 0) lastFrameCache.set(page, buffer);
    }
  }

  return {
    buffer,
    hasDamage: result.hasDamage,
  };
}

/**
 * Retains the macOS Chrome compositor safeguard; otherwise tests whether actual
 * rendered content is taller than the requested
 * capture height. `captureBeyondViewport` exists for exactly one reason
 * (#1094): a native `<video>` surface whose content genuinely overflows the
 * viewport-bound capture path clips its bottom edge to black. A video that
 * fits entirely inside its composition's declared viewport doesn't have that
 * problem — ground-truth measurement beats the coarser "has a video, so
 * always request beyond-viewport" heuristic, which also unnecessarily routes
 * every video render through a CDP capture path prone to producing phantom
 * duplicate content on SwiftShader (#2550).
 *
 * Callers measure once after page settle. Hyperframes compositions have a
 * fixed-height, overflow-clipped render surface; timeline animation may move
 * pixels within that surface but must not grow document flow during capture.
 */
export async function pageContentExceedsCaptureHeight(
  page: Page,
  requestedHeight: number,
): Promise<boolean> {
  // The compositor defect is independent of DOM overflow: a 1920px element
  // can still paint only 1833px on macOS Chrome's viewport-bound path.
  if (shouldDefaultCaptureBeyondViewport(await page.browser().version())) return true;
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  // Small tolerance for subpixel layout rounding, not a real overflow signal.
  return scrollHeight > requestedHeight + 1;
}

/**
 * Capture a screenshot using standard Page.captureScreenshot CDP call.
 * Fallback for environments where BeginFrame is unavailable (macOS, Windows).
 *
 * For `format: "png"` captures we disable Chrome's `optimizeForSpeed` fast
 * path. The fast path uses a zero-alpha-aware codec that crushes real alpha
 * values to 0 or 255 (verified empirically; CDP docs don't document this) —
 * exactly the same caveat called out on `captureScreenshotWithAlpha` /
 * `captureAlphaPng`. Keeping the fast path for opaque jpeg captures is fine.
 */
export async function pageScreenshotCapture(page: Page, options: CaptureOptions): Promise<Buffer> {
  const client = await getCdpSession(page);
  const isPng = options.format === "png";
  const dpr = options.deviceScaleFactor ?? 1;
  const clip = { x: 0, y: 0, width: options.width, height: options.height, scale: dpr };
  const result = await client.send("Page.captureScreenshot", {
    format: isPng ? "png" : "jpeg",
    quality: isPng ? undefined : (options.quality ?? 80),
    fromSurface: true,
    // Use Chrome's faster viewport-bound screenshot path by default. Callers
    // opt into the beyond-viewport path only for known compositor edge cases,
    // such as native video surfaces in tall portrait renders.
    captureBeyondViewport: options.captureBeyondViewport ?? false,
    optimizeForSpeed: !isPng,
    clip,
  });
  return Buffer.from(result.data, "base64");
}

/**
 * Capture a screenshot with transparent background (PNG + alpha channel).
 *
 * Used in the two-pass HDR compositing pipeline — captures DOM content
 * (text, graphics, SDR overlays) with transparency where the background shows,
 * so it can be overlaid on top of native HDR video frames in FFmpeg.
 *
 * Sets and restores the background color override on every call. For sessions
 * that capture many frames, prefer calling initTransparentBackground() once
 * at session init, then captureAlphaPng() per frame to avoid the 2× CDP
 * round-trip overhead.
 */
export async function captureScreenshotWithAlpha(
  page: Page,
  width: number,
  height: number,
): Promise<Buffer> {
  const client = await getCdpSession(page);
  // Force transparent background so the screenshot has a real alpha channel
  await client.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  try {
    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      // Preserve the #1094 tall-portrait edge-clipping guard on HDR alpha captures.
      captureBeyondViewport: true,
      optimizeForSpeed: false, // `true` uses a zero-alpha-aware fast path that crushes real alpha values — observed empirically, CDP docs don't spell it out
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return Buffer.from(result.data, "base64");
  } finally {
    // Restore opaque background even if captureScreenshot throws, otherwise
    // subsequent opaque captures keep a transparent background.
    await client.send("Emulation.setDefaultBackgroundColorOverride", {}).catch(() => {});
  }
}

/**
 * Set the page background to transparent once for a dedicated HDR DOM session.
 *
 * Call this once after session initialization. Then use captureAlphaPng() per
 * frame instead of captureScreenshotWithAlpha() to skip the per-frame CDP
 * background override round-trips.
 *
 * Only use on sessions that are exclusively dedicated to transparent capture
 * (e.g., the HDR two-pass DOM layer session) — the background will stay
 * transparent for the lifetime of the session.
 *
 * NOTE on the injected stylesheet: `Emulation.setDefaultBackgroundColorOverride`
 * only replaces the *default* page background. Compositions almost always set
 * `body { background: ... }` and `#root { background: ... }`, which paint over
 * the override and ruin alpha capture for layered HDR compositing — the
 * composition root's full-frame background paints across the entire viewport
 * and wipes out HDR content captured beneath it.
 *
 * We force `html`, `body`, and any element marked as a composition root
 * (`[data-composition-id]`) to transparent. In HDR layered compositing the HDR
 * video itself is the backdrop, so DOM layers must only contribute their
 * foreground UI pixels — never a page-spanning solid backdrop.
 */
const TRANSPARENT_BG_STYLE_ID = "__hf_transparent_bg__";

export async function initTransparentBackground(page: Page): Promise<void> {
  const client = await getCdpSession(page);
  await client.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  await page.evaluate((styleId: string) => {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent =
      "html,body,[data-composition-id]{background:transparent !important;background-color:transparent !important;background-image:none !important;}";
    document.head.appendChild(style);
  }, TRANSPARENT_BG_STYLE_ID);
}

/**
 * Capture a transparent-background PNG screenshot without setting the
 * background color override. Requires initTransparentBackground() to have
 * been called once on this session.
 *
 * Faster than captureScreenshotWithAlpha() for per-frame use in the HDR
 * two-pass compositing loop.
 */
export async function captureAlphaPng(page: Page, width: number, height: number): Promise<Buffer> {
  const client = await getCdpSession(page);
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    // Preserve the #1094 tall-portrait edge-clipping guard on HDR alpha captures.
    captureBeyondViewport: true,
    optimizeForSpeed: false, // must be false to preserve alpha
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  return Buffer.from(result.data, "base64");
}
