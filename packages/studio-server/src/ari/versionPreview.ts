import { posix } from "node:path";
import { parseHTML } from "linkedom";
import { bundleToSingleHtml } from "@hyperframes/core/compiler";
import { createFrozenVersionSnapshot } from "./versionSnapshot.js";
import type { VersionBytes } from "./versionFiles.js";
import { createStudioManualEditsRenderBodyScript } from "../helpers/manualEditsRenderScript.js";
import { createStudioMotionRenderBodyScript } from "../helpers/studioMotionRenderScript.js";

const mime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  css: "text/css",
  js: "text/javascript",
};
function inlineResources(html: string, files: VersionBytes) {
  const data = (reference: string): string => {
    if (!reference || reference.startsWith("data:") || reference.startsWith("#")) return reference;
    const path = posix.normalize(
      decodeURIComponent(reference.split(/[?#]/)[0]!).replace(/^\//, ""),
    );
    const bytes = files[path];
    if (!bytes) throw new Error(`Vertailun aineisto puuttuu: ${reference}`);
    return `data:${mime[path.split(".").pop()!] ?? "application/octet-stream"};base64,${bytes.toString("base64")}`;
  };
  const css = (text: string) =>
    text.replace(
      /url\(\s*["']?([^"')]+)["']?\s*\)/g,
      (_, ref: string) => `url("${data(ref.trim())}")`,
    );
  const { document } = parseHTML(html);
  for (const el of document.querySelectorAll("[src], [poster], link[href]")) {
    for (const attr of ["src", "poster", "href"]) {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, data(value));
    }
  }
  for (const el of document.querySelectorAll("style")) el.textContent = css(el.textContent ?? "");
  for (const el of document.querySelectorAll("[style]"))
    el.setAttribute("style", css(el.getAttribute("style")!));
  return document.toString();
}

/** No live project URL reaches this sandbox: all resources are verified frozen bytes. */
export async function projectVersionPreview(root: string, id: string) {
  const { version, files, dir, dispose } = createFrozenVersionSnapshot(root, id);
  try {
    let html = await bundleToSingleHtml(dir, { runtime: "inline" });
    html = inlineResources(html, files);
    const { document } = parseHTML(html);
    const rootElement = document.querySelector("[data-composition-id]");
    const width = Number(rootElement?.getAttribute("data-width"));
    const height = Number(rootElement?.getAttribute("data-height"));
    const duration = Number(rootElement?.getAttribute("data-duration"));
    if (![width, height, duration].every((v) => Number.isFinite(v) && v > 0))
      throw new Error("Version koko tai kesto puuttuu.");
    const scripts = [
      createStudioManualEditsRenderBodyScript(
        files[".hyperframes/studio-manual-edits.json"]?.toString() ?? "",
        { activeCompositionPath: "index.html" },
      ),
      createStudioMotionRenderBodyScript(
        files[".hyperframes/studio-motion.json"]?.toString() ?? "",
        { activeCompositionPath: "index.html" },
      ),
      `(${previewTransport.toString()})(${width},${height});`,
    ]
      .filter(Boolean)
      .map((body) => `<script>${body!.replace(/<\/script/gi, "<\\/script")}</script>`)
      .join("");
    const policy =
      "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
    html = html.replace(
      /<head[^>]*>/i,
      (head) => `${head}<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    );
    html = html.replace("</body>", `${scripts}</body>`);
    return { ok: true, version, width, height, duration, html };
  } finally {
    dispose();
  }
}

function previewTransport(width: number, height: number) {
  const win = window as Window & {
    __player?: { pause(): void; seek(time: number): void };
    __playerReady?: boolean;
  };
  const send = (event: string, extra = {}) =>
    parent.postMessage({ ariVersion: event, ...extra }, "*");
  function fit() {
    // Scale the viewport, never replace an authored element's transform.
    const style = document.documentElement.style;
    style.zoom = String(Math.min(innerWidth / width, innerHeight / height));
    style.width = `${width}px`;
    style.height = `${height}px`;
    style.overflow = "hidden";
  }
  addEventListener("resize", fit);
  addEventListener("securitypolicyviolation", () =>
    send("error", { reason: "Versio yritti käyttää tallentamatonta aineistoa." }),
  );
  addEventListener("error", () => send("error", { reason: "Version toisto epäonnistui." }), true);
  addEventListener("message", (event) => {
    if (event.source !== parent || event.data?.ariVersion !== "seek") return;
    const time = event.data.time;
    if (typeof time !== "number" || !Number.isFinite(time) || time < 0) return;
    win.__player?.pause();
    win.__player?.seek(time);
    fit();
    send("seeked", { time });
  });
  const timer = setInterval(() => {
    if (!win.__playerReady) return;
    clearInterval(timer);
    win.__player?.pause();
    win.__player?.seek(0);
    fit();
    send("ready");
  }, 25);
  setTimeout(() => {
    clearInterval(timer);
    if (!win.__playerReady) send("error", { reason: "Version aikajana ei valmistunut." });
  }, 10000);
}
