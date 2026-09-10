/**
 * The GSAP script tags a preview may need that its own HTML never asked for.
 *
 * Split out of routes/preview.ts so the route file stays under the sprint's
 * 600-line ceiling; the behaviour is unchanged apart from where the scripts come
 * from — this server's own `gsap` dependency instead of a CDN (vendorScripts.ts).
 */
import { VENDOR_SCRIPT_BASE, vendorScriptUrl } from "./vendorScripts.js";

// Served from this server's own `gsap` dependency, not jsdelivr: a preview that
// reaches a CDN makes the editor need the internet, and with the network blocked
// the aborted script raised a page error and cost the next soft reload its
// timeline. See routes/vendorScripts.ts.
const GSAP_CDN_SCRIPT = `<script src="${vendorScriptUrl("gsap.min.js")}"></script>`;
const GSAP_CUSTOM_EASE_CDN_SCRIPT = `<script src="${vendorScriptUrl("CustomEase.min.js")}"></script>`;
const GSAP_MOTION_PATH_CDN_SCRIPT = `<script src="${vendorScriptUrl("MotionPathPlugin.min.js")}"></script>`;

function parseStudioMotionManifestContent(content: string): {
  hasMotion: boolean;
  hasCustomEase: boolean;
} {
  try {
    const parsed = JSON.parse(content) as {
      motions?: Array<{ customEase?: unknown }>;
    };
    const motions = Array.isArray(parsed.motions) ? parsed.motions : [];
    return {
      hasMotion: motions.length > 0,
      hasCustomEase: motions.some((motion) => Boolean(motion?.customEase)),
    };
  } catch {
    return { hasMotion: false, hasCustomEase: false };
  }
}

function injectScriptTagIntoHead(html: string, scriptTag: string): string {
  if (html.includes("</head>")) return html.replace("</head>", `${scriptTag}\n</head>`);
  return `${scriptTag}\n${html}`;
}

function htmlHasGsap(html: string): boolean {
  // Only match GSAP references outside <template> elements — scripts inside
  // templates are inert when cloned and don't make GSAP globally available.
  const outsideTemplates = html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");
  return (
    /<script\b[^>]*src=["'][^"']*gsap/i.test(outsideTemplates) ||
    /\/\*\s*inlined:.*gsap/i.test(outsideTemplates) ||
    /\b(GreenSock|_gsScope)\b/.test(outsideTemplates) ||
    /\bgsap\.(config|defaults|registerPlugin|version)\b/.test(outsideTemplates)
  );
}

function htmlHasCustomEase(html: string): boolean {
  return (
    /<script\b[^>]*src=["'][^"']*CustomEase/i.test(html) ||
    /\bwindow\.CustomEase\b/.test(html) ||
    /\bCustomEase\s*=\s*/.test(html)
  );
}

// A composition that drives motion via GSAP's `motionPath` (e.g. a studio-created
// motion path written into the single-source timeline) needs MotionPathPlugin
// registered before the timeline first renders — otherwise the initial seek
// throws "Invalid property motionPath ... Missing plugin?". Detect it anywhere in
// the bundle (the plugin registers globally, so sub-composition usage counts too).
function htmlUsesMotionPath(html: string): boolean {
  return /motionPath\s*[:{]/.test(html);
}

function htmlHasMotionPathPlugin(html: string): boolean {
  return (
    /<script\b[^>]*src=["'][^"']*MotionPathPlugin/i.test(html) ||
    /\bwindow\.MotionPathPlugin\b/.test(html) ||
    /\bMotionPathPlugin\s*=\s*/.test(html)
  );
}

export function injectMotionPathPluginIfNeeded(html: string): string {
  if (!htmlUsesMotionPath(html) || htmlHasMotionPathPlugin(html)) return html;
  // The plugin registers onto an already-loaded gsap, so it must come AFTER the
  // core gsap script — which often lives at body-end, not <head>. Insert it
  // directly after the gsap script tag; only fall back to <head> if none is found
  // (e.g. gsap is inlined).
  const gsapScript = /<script\b[^>]*\bsrc=["'][^"']*\/gsap(\.min)?\.js["'][^>]*>\s*<\/script>/i;
  const match = html.match(gsapScript);
  if (match) {
    const pluginTag = GSAP_MOTION_PATH_CDN_SCRIPT;
    const end = html.indexOf(match[0]) + match[0].length;
    return html.slice(0, end) + "\n" + pluginTag + html.slice(end);
  }
  return injectScriptTagIntoHead(html, GSAP_MOTION_PATH_CDN_SCRIPT);
}

export function injectStudioMotionDependencies(html: string, manifestContent: string): string {
  const manifest = parseStudioMotionManifestContent(manifestContent);
  if (!manifest.hasMotion) return html;
  let next = html;
  if (!htmlHasGsap(next)) next = injectScriptTagIntoHead(next, GSAP_CDN_SCRIPT);
  if (manifest.hasCustomEase && !htmlHasCustomEase(next)) {
    next = injectScriptTagIntoHead(next, GSAP_CUSTOM_EASE_CDN_SCRIPT);
  }
  return next;
}

const GSAP_CDN_FALLBACK_SCRIPT = `<script data-hf-gsap-fallback>
(function(){
  var cdnBase="${VENDOR_SCRIPT_BASE}/";
  var loaded={};
  function loadFallback(file){
    if(loaded[file])return loaded[file];
    return loaded[file]=new Promise(function(ok,fail){
      var s=document.createElement("script");
      s.src=cdnBase+file;s.onload=ok;s.onerror=fail;
      document.head.appendChild(s);
    });
  }
  document.addEventListener("error",function(e){
    var t=e.target;
    if(!t||t.tagName!=="SCRIPT"||!t.src)return;
    var m=t.src.match(/gsap[^/]*\\/dist\\/(.+\\.js)/);
    if(m)loadFallback(m[1]);
  },true);
})();
</script>`;

export function injectGsapCdnFallback(html: string): string {
  if (html.includes("data-hf-gsap-fallback")) return html;
  if (html.includes("<head>")) return html.replace("<head>", "<head>" + GSAP_CDN_FALLBACK_SCRIPT);
  return GSAP_CDN_FALLBACK_SCRIPT + html;
}
