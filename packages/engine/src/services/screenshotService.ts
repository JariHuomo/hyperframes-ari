// fallow-ignore-file code-duplication complexity
import { type Page } from "puppeteer-core";
import { COLOR_GRADING_SOURCE_HIDDEN_ATTR } from "@hyperframes/core/color-grading";
import {
  HF_COLOR_GRADING_CANVAS_ID_PREFIX,
  MEDIA_RENDER_ID_ATTR,
  MEDIA_VISUAL_STYLE_PROPERTIES,
  RENDER_FRAME_ID_PREFIX,
  RENDER_FRAME_ID_SUFFIX,
  renderFrameIdForRenderId,
} from "@hyperframes/core";

export {
  beginFrameCapture,
  pageScreenshotCapture,
  getCdpSession,
  cdpSessionCache,
  probeBeginFrameLiveness,
  initTransparentBackground,
  captureAlphaPng,
  captureScreenshotWithAlpha,
  shouldDefaultCaptureBeyondViewport,
  pageContentExceedsCaptureHeight,
  type BeginFrameResult,
} from "./screenshotCapture.js";
/**
 * Stylesheet ID used by applyDomLayerMask / removeDomLayerMask. Exposed so
 * tests can assert presence/absence of the mask between captures.
 */
export const DOM_LAYER_MASK_STYLE_ID = "__hf_dom_layer_mask__";
const DOM_LAYER_MASK_HIDDEN_ATTR = "data-hf-dom-layer-mask-hidden";
const DOM_LAYER_MASK_PREV_VISIBILITY_ATTR = "data-hf-dom-layer-mask-prev-visibility";
const DOM_LAYER_MASK_PREV_PRIORITY_ATTR = "data-hf-dom-layer-mask-prev-priority";
/**
 * Mask the DOM so a single layer screenshot captures ONLY the layer's pixels.
 *
 * The HDR layered compositor walks z-ordered layers and blits each one over a
 * shared canvas. DOM layers are full-page screenshots — a naive screenshot
 * captures every painted pixel on the page, which means root background +
 * static overlays + sibling-scene content all overwrite previously composited
 * HDR content beneath. The mask narrows each screenshot to the elements that
 * actually belong to this layer.
 *
 * Strategy:
 *
 * 1. Inject a stylesheet that hides every body descendant
 *    (`body * { visibility: hidden !important }`) and re-shows the layer's
 *    elements (and their descendants, injected `__render_frame_*` siblings,
 *    and media color-grading canvases) via `visibility: visible !important`. CSS `visibility: visible`
 *    on a descendant overrides an ancestor's `visibility: hidden`, so deep
 *    layer elements remain visible even though intermediate parents are
 *    hidden by the mass-hide rule.
 * 2. Inline-hide each `extraHideId` (and its render-frame/color-grading siblings) with
 *    `visibility: hidden !important`, while first recording its previous
 *    inline visibility. Inline `!important` beats stylesheet `!important`,
 *    so this overrides the show rule for elements that fall under a show
 *    selector but should NOT paint — typically other-layer elements that are
 *    descendants of a container layer (for example HDR videos and other-layer
 *    SDR videos are descendants of `#root` when we capture the root DOM layer).
 * 3. Inline-hide timed descendants of shown elements that were hidden before
 *    the mask was installed. This covers idless child clips and same-layer
 *    descendants that the `extraHideIds` id list cannot represent.
 *
 * Only `visibility` is set on extraHideIds — never `opacity`. CSS opacity is
 * multiplicative through the descendant chain and a descendant cannot escape
 * an ancestor's `opacity: 0`. If `#root` is in `extraHideIds` and we set
 * `opacity: 0` on it, every descendant — including `#vid-5-b` and its
 * `__render_frame_vid-5-b__` IMG — becomes invisible even with
 * `visibility: visible !important`. `visibility` does NOT have this problem:
 * a descendant with `visibility: visible` overrides an ancestor's
 * `visibility: hidden`.
 *
 * Layout is preserved (visibility doesn't trigger reflow), so border-radius
 * clipping, overflow:hidden, and absolute positioning continue to apply to
 * the visible layer elements. Opacity is also preserved — an ancestor at
 * `opacity: 0` (e.g. an inactive scene during a transition) still
 * propagates to its descendants, which is the desired behavior during
 * cross-scene blends.
 *
 * Idempotent across calls: an existing mask stylesheet is removed before a
 * new one is installed, so consecutive `applyDomLayerMask` invocations leave
 * exactly one stylesheet attached.
 */
export async function applyDomLayerMask(
  page: Page,
  showIds: string[],
  extraHideIds: string[],
): Promise<void> {
  await page.evaluate(
    // fallow-ignore-next-line complexity
    (args: {
      show: string[];
      hide: string[];
      renderIdAttr: string;
      renderFramePrefix: string;
      renderFrameSuffix: string;
      styleId: string;
      hiddenAttr: string;
      prevVisibilityAttr: string;
      prevPriorityAttr: string;
      canvasIdPrefix: string;
    }) => {
      const existing = document.getElementById(args.styleId);
      if (existing) existing.remove();

      // Affixes come from core's renderFrameSibling, so the runtime readers and
      // this lookup cannot drift apart on the id format.
      const renderFrameId = (id: string) =>
        `${args.renderFramePrefix}${id}${args.renderFrameSuffix}`;

      const restoreMaskedElements = () => {
        const masked = document.querySelectorAll(`[${args.hiddenAttr}="1"]`);
        for (const node of masked) {
          if (!(node instanceof HTMLElement)) continue;
          const prevVisibility = node.getAttribute(args.prevVisibilityAttr);
          const prevPriority = node.getAttribute(args.prevPriorityAttr);
          if (prevVisibility === null) {
            node.style.removeProperty("visibility");
          } else {
            node.style.setProperty("visibility", prevVisibility, prevPriority ?? "");
          }
          node.removeAttribute(args.hiddenAttr);
          node.removeAttribute(args.prevVisibilityAttr);
          node.removeAttribute(args.prevPriorityAttr);
        }
      };
      restoreMaskedElements();

      const rememberAndHideElement = (el: HTMLElement) => {
        if (el.getAttribute(args.hiddenAttr) !== "1") {
          const prevVisibility = el.style.getPropertyValue("visibility");
          const prevPriority =
            typeof el.style.getPropertyPriority === "function"
              ? el.style.getPropertyPriority("visibility")
              : "";
          if (prevVisibility) {
            el.setAttribute(args.prevVisibilityAttr, prevVisibility);
          } else {
            el.removeAttribute(args.prevVisibilityAttr);
          }
          if (prevPriority) {
            el.setAttribute(args.prevPriorityAttr, prevPriority);
          } else {
            el.removeAttribute(args.prevPriorityAttr);
          }
          el.setAttribute(args.hiddenAttr, "1");
        }
        el.style.setProperty("visibility", "hidden", "important");
      };

      const hiddenTimedDescendants: HTMLElement[] = [];
      const rememberHiddenTimedDescendants = (root: Element) => {
        for (const node of root.querySelectorAll("[data-start]")) {
          if (!(node instanceof HTMLElement)) continue;
          const computed = window.getComputedStyle(node);
          if (computed.visibility !== "hidden" && computed.display !== "none") continue;
          hiddenTimedDescendants.push(node);
        }
      };

      const showSelectors: string[] = [];
      for (const id of args.show) {
        const el = window.__hfMediaEl?.(id) ?? document.getElementById(id);
        if (el) rememberHiddenTimedDescendants(el);
        // Address the element by its render id when it has one. `#id` must not
        // be used as an extra fallback here: an id is duplicated exactly when
        // two compositions share it, so `#id` would also unhide the other
        // scene's element — the collision this render id exists to resolve.
        if (el?.hasAttribute(args.renderIdAttr)) {
          const attrEscaped = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          const byRenderId = `[${args.renderIdAttr}="${attrEscaped}"]`;
          showSelectors.push(byRenderId, `${byRenderId} *`);
        } else {
          const escaped = CSS.escape(id);
          showSelectors.push(`#${escaped}`, `#${escaped} *`);
        }
        const renderEscaped = CSS.escape(renderFrameId(id));
        showSelectors.push(`#${renderEscaped}`, `#${renderEscaped} *`);
        const colorGradingEscaped = CSS.escape(`${args.canvasIdPrefix}${id}`);
        showSelectors.push(`#${colorGradingEscaped}`, `#${colorGradingEscaped} *`);
      }

      const massHideRule = "body *{visibility:hidden !important;}";
      const showRule =
        showSelectors.length === 0
          ? ""
          : `${showSelectors.join(",")}{visibility:visible !important;}`;

      const style = document.createElement("style");
      style.id = args.styleId;
      style.textContent = `${massHideRule}\n${showRule}`;
      document.head.appendChild(style);

      for (const el of hiddenTimedDescendants) {
        rememberAndHideElement(el);
      }

      for (const id of args.hide) {
        const el = window.__hfMediaEl?.(id) ?? document.getElementById(id);
        if (el instanceof HTMLElement) {
          rememberAndHideElement(el);
        }
        const img = document.getElementById(renderFrameId(id));
        if (img) {
          rememberAndHideElement(img);
        }
        const colorGradingCanvas = document.getElementById(`${args.canvasIdPrefix}${id}`);
        if (colorGradingCanvas instanceof HTMLElement) {
          rememberAndHideElement(colorGradingCanvas);
        }
      }
    },
    {
      show: showIds,
      hide: extraHideIds,
      renderIdAttr: MEDIA_RENDER_ID_ATTR,
      renderFramePrefix: RENDER_FRAME_ID_PREFIX,
      renderFrameSuffix: RENDER_FRAME_ID_SUFFIX,
      styleId: DOM_LAYER_MASK_STYLE_ID,
      hiddenAttr: DOM_LAYER_MASK_HIDDEN_ATTR,
      prevVisibilityAttr: DOM_LAYER_MASK_PREV_VISIBILITY_ATTR,
      prevPriorityAttr: DOM_LAYER_MASK_PREV_PRIORITY_ATTR,
      canvasIdPrefix: HF_COLOR_GRADING_CANVAS_ID_PREFIX,
    },
  );
}
/**
 * Tear down the mask installed by applyDomLayerMask.
 *
 * Removes the mask stylesheet and restores the inline `visibility` values
 * temporarily overwritten for hidden timed descendants, `extraHideIds`, and
 * their render-frame/color-grading siblings.
 *
 * IMPORTANT: We do NOT strip inline `opacity` here. applyDomLayerMask only
 * ever sets `visibility` (never `opacity`), so any inline opacity present on
 * a wrapper was put there by user animation code (typically GSAP) and must
 * survive across per-layer captures. GSAP's seek with suppress-events does
 * not re-apply tweens when the timeline is already at the target time, so if
 * we strip opacity here and then seek to the same time for the next layer,
 * GSAP won't put it back and the wrapper will render fully opaque.
 */
export async function removeDomLayerMask(page: Page, _extraHideIds: string[]): Promise<void> {
  await page.evaluate(
    (args: {
      styleId: string;
      hiddenAttr: string;
      prevVisibilityAttr: string;
      prevPriorityAttr: string;
    }) => {
      const style = document.getElementById(args.styleId);
      if (style) style.remove();
      const masked = document.querySelectorAll(`[${args.hiddenAttr}="1"]`);
      for (const node of masked) {
        if (!(node instanceof HTMLElement)) continue;
        const prevVisibility = node.getAttribute(args.prevVisibilityAttr);
        const prevPriority = node.getAttribute(args.prevPriorityAttr);
        if (prevVisibility === null) {
          node.style.removeProperty("visibility");
        } else {
          node.style.setProperty("visibility", prevVisibility, prevPriority ?? "");
        }
        node.removeAttribute(args.hiddenAttr);
        node.removeAttribute(args.prevVisibilityAttr);
        node.removeAttribute(args.prevPriorityAttr);
      }
    },
    {
      styleId: DOM_LAYER_MASK_STYLE_ID,
      hiddenAttr: DOM_LAYER_MASK_HIDDEN_ATTR,
      prevVisibilityAttr: DOM_LAYER_MASK_PREV_VISIBILITY_ATTR,
      prevPriorityAttr: DOM_LAYER_MASK_PREV_PRIORITY_ATTR,
    },
  );
}
/**
 * Pre-create hidden `__render_frame__` sibling `<img>`s for every
 * `video[data-start]` in the page. Idempotent — videos that already
 * have a sibling are skipped.
 *
 * `injectVideoFramesBatch` creates the sibling on the fly the first time
 * it paints a given videoId (the `isNewImage = !hasImg` branch below).
 * Under chrome-headless-shell's deterministic + `HeadlessExperimental.
 * BeginFrame` mode, the immediately-next BeginFrame captures before the
 * freshly-inserted `<img>` layer lands in the compositor's layer tree;
 * the layer arrives a frame later. That single frame paints only the
 * body background + previously-composed overlays.
 *
 * Called from `initializeSession`: in the screenshot path at the end (that
 * capture path flushes paint, so timing doesn't matter), and in the BeginFrame
 * path followed by one explicit visual `HeadlessExperimental.beginFrame`
 * (`noDisplayUpdates: false`) that composites the new layers before the first
 * capture — the warmup ticks are `noDisplayUpdates: true` and don't paint.
 * Every subsequent `injectVideoFramesBatch` then takes the `hasImg = true` path
 * (just an `img.src` update). The `isNewImage` branch stays as a fallback for
 * callers that don't run through `initializeSession`.
 */
export async function ensureRenderFrameSiblings(page: Page): Promise<void> {
  await page.evaluate(
    (prefix: string, suffix: string) => {
      for (const video of Array.from(
        document.querySelectorAll<HTMLVideoElement>("video[data-start]"),
      )) {
        const next = video.nextElementSibling;
        if (next !== null && next.classList.contains("__render_frame__")) continue;
        const img = document.createElement("img");
        img.classList.add("__render_frame__");
        // Derive from the render id, not `video.id` — two scenes can share an
        // element id, and two siblings sharing an id would collide in turn.
        // `||`, not `??`: `__hfMediaId` returns "" for an element with neither
        // id, and core's reader treats that as "no id" rather than a key.
        img.id = `${prefix}${window.__hfMediaId?.(video) || video.id}${suffix}`;
        img.style.pointerEvents = "none";
        img.style.position = "absolute";
        img.style.visibility = "hidden";
        video.parentNode?.insertBefore(img, video.nextSibling);
      }
    },
    RENDER_FRAME_ID_PREFIX,
    RENDER_FRAME_ID_SUFFIX,
  );
}

/**
 * Returns the subset of `updates.videoId`s that were actually painted in
 * this call. Videos skipped because of a hidden visual ancestor are NOT
 * included — the caller relies on this to avoid recording a `lastInjected`
 * cache entry for a frame that never reached the page, which would otherwise
 * short-circuit the next inject at the same frameIndex and leave the host's
 * first visible frame blank.
 */
export async function injectVideoFramesBatch(
  page: Page,
  updates: Array<{ videoId: string; dataUri: string }>,
): Promise<string[]> {
  if (updates.length === 0) return [];
  return await page.evaluate(
    // fallow-ignore-next-line complexity
    async (
      items: Array<{ videoId: string; dataUri: string; frameId: string }>,
      visualProperties: string[],
      colorGradingSourceHiddenAttr: string,
    ) => {
      const injectedIds: string[] = [];
      const pendingDecodes: Array<Promise<void>> = [];
      const replacementLayoutProperties = new Set([
        "width",
        "height",
        "top",
        "left",
        "right",
        "bottom",
        "inset",
      ]);
      // Walk ancestors looking for a host that the page has hidden. The
      // runtime hides `[data-composition-src]` and `[data-start]` hosts that
      // fall outside their time window; a nested `<video data-start>` inside
      // such a host still appears "active" in the raw time-window check (its
      // own `data-start`/`data-end` cover the whole clip), so without this
      // guard we would paint a full-bleed replacement frame over a sibling
      // host that *is* visible.
      //
      // `display: none` is always a skip signal — a `display: none` ancestor
      // takes its whole subtree out of layout, and a child `<img>` cannot
      // escape that. `visibility: hidden`, by contrast, is escapable: a
      // descendant with `visibility: visible` overrides an ancestor's
      // `visibility: hidden` per the CSS spec, and the replacement `<img>`
      // intentionally sets `visibility: visible`. We therefore only treat
      // `visibility: hidden` as a skip signal on sub-composition hosts
      // (`[data-composition-src]` / `[data-composition-file]`), which is the
      // scenario this guard exists for. Plain `[data-start]` containers may
      // be hidden with `visibility: hidden` while still wanting their inner
      // video's final-state frame to paint through (e.g. a GSAP timeline
      // shorter than the host's authored data-duration, where the runtime
      // truncates visibility but the replacement <img> must hold its last
      // frame) — those must NOT be skipped here.
      // fallow-ignore-next-line code-duplication
      const isVisualAncestorHidden = (el: HTMLElement): boolean => {
        let parent = el.parentElement;
        while (parent !== null && parent !== document.documentElement) {
          const computed = window.getComputedStyle(parent);
          if (computed.display === "none") return true;
          if (
            computed.visibility === "hidden" &&
            (parent.hasAttribute("data-composition-src") ||
              parent.hasAttribute("data-composition-file"))
          ) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      };
      for (const item of items) {
        const video = (window.__hfMediaEl?.(item.videoId) ??
          document.getElementById(item.videoId)) as HTMLVideoElement | null;
        if (!video) continue;

        let img = video.nextElementSibling as HTMLImageElement | null;
        const hasImg = img !== null && img.classList.contains("__render_frame__");

        if (isVisualAncestorHidden(video)) {
          // Don't paint a frame over a hidden host — if an existing replacement
          // <img> is still around from when the host was visible, hide it so it
          // doesn't bleed through a sibling host that *is* visible on this seek.
          //
          // Use `!important` so the inline hide survives `applyDomLayerMask`'s
          // stylesheet `#${showId} *{visibility:visible !important}` when the
          // sub-comp host happens to land in the active layer's `show` set —
          // important stylesheet beats non-important inline, but important
          // inline beats important stylesheet.
          if (hasImg && img) img.style.setProperty("visibility", "hidden", "important");
          continue;
        }

        const isNewImage = !hasImg;
        const computedStyle = window.getComputedStyle(video);
        // Read the GSAP-controlled opacity directly from the native <video>.
        // We hide the <video> below with `visibility: hidden` only (never
        // `opacity: 0`), so its computed opacity is preserved across seeks
        // and accurately reflects the user's intent on every frame.
        const opacityParsed = parseFloat(computedStyle.opacity);
        const computedOpacity = video.hasAttribute(colorGradingSourceHiddenAttr)
          ? 1
          : Number.isNaN(opacityParsed)
            ? 1
            : opacityParsed;

        if (isNewImage) {
          img = document.createElement("img");
          img.classList.add("__render_frame__");
          img.id = item.frameId;
          img.style.pointerEvents = "none";
          video.parentNode?.insertBefore(img, video.nextSibling);
        }
        if (!img) continue;

        for (const property of visualProperties) {
          // Opacity is handled explicitly via `computedOpacity` below — copying
          // via the generic loop would race against the opacity:0 hide applied
          // to the <video> at the end of this function. GSAP may animate
          // opacity either on a wrapper (the <img> inherits via the stacking
          // context) or directly on the <video> (we must copy it to the <img>
          // since they are siblings). Reading computedStyle.opacity before
          // hiding the <video> handles both cases correctly.
          if (property === "opacity") continue;
          // Layout is set from the video's used box below. Copying authored
          // opposing constraints such as `inset: 0` / `right: 0` onto the
          // replacement <img> can overconstrain replaced-image sizing and make
          // some Chrome capture paths resample the frame anisotropically.
          if (replacementLayoutProperties.has(property)) {
            continue;
          }
          const value = computedStyle.getPropertyValue(property);
          if (value) {
            img.style.setProperty(property, value);
          }
        }

        // Always use absolute positioning so the <img> overlays the <video>
        // instead of flowing below it. With position:relative, both elements
        // stack vertically — the <img> lands below the video and gets clipped
        // by any overflow:hidden ancestor (e.g., border-radius wrappers).
        //
        // Apply this after visual style copying so the measured used box is
        // the final authority for replacement frame geometry.
        {
          const videoRect = video.getBoundingClientRect();
          const offsetLeft = Number.isFinite(video.offsetLeft) ? video.offsetLeft : 0;
          const offsetTop = Number.isFinite(video.offsetTop) ? video.offsetTop : 0;
          const offsetWidth = video.offsetWidth > 0 ? video.offsetWidth : videoRect.width;
          const offsetHeight = video.offsetHeight > 0 ? video.offsetHeight : videoRect.height;
          img.style.position = "absolute";
          img.style.inset = "auto";
          img.style.left = `${offsetLeft}px`;
          img.style.top = `${offsetTop}px`;
          img.style.right = "auto";
          img.style.bottom = "auto";
          img.style.width = `${offsetWidth}px`;
          img.style.height = `${offsetHeight}px`;
        }
        img.style.objectFit = computedStyle.objectFit;
        img.style.objectPosition = computedStyle.objectPosition;
        img.style.zIndex = computedStyle.zIndex;

        img.decoding = "sync";
        if (img.getAttribute("src") !== item.dataUri) {
          img.src = item.dataUri;
          pendingDecodes.push(
            img
              .decode()
              .catch(() => undefined)
              .then(() => undefined),
          );
        }
        img.style.opacity = String(computedOpacity);
        img.style.visibility = "visible";
        // Hide the native <video> with visibility only — never clobber inline
        // opacity, so subsequent reads (and queryElementStacking) see the real
        // GSAP-controlled value.
        video.style.setProperty("visibility", "hidden", "important");
        video.style.setProperty("pointer-events", "none", "important");
        injectedIds.push(item.videoId);
      }
      if (pendingDecodes.length > 0) {
        await Promise.all(pendingDecodes);
      }
      if (injectedIds.length > 0) {
        const redraw = (window as Window & { __hf?: { colorGrading?: { redraw?: () => void } } })
          .__hf?.colorGrading?.redraw;
        redraw?.();
      }
      return injectedIds;
    },
    // Build the sibling id with core's function rather than a template here,
    // so the id the readers look up has exactly one definition.
    updates.map((update) => ({ ...update, frameId: renderFrameIdForRenderId(update.videoId) })),
    [...MEDIA_VISUAL_STYLE_PROPERTIES],
    COLOR_GRADING_SOURCE_HIDDEN_ATTR,
  );
}

export async function syncVideoFrameVisibility(
  page: Page,
  activeVideoIds: string[],
): Promise<void> {
  await page.evaluate(
    // fallow-ignore-next-line complexity
    (ids: string[], colorGradingSourceHiddenAttr: string) => {
      // Mirror the ancestor-visibility guard from `injectVideoFramesBatch`.
      // See that copy for the full rationale on why `visibility: hidden` is
      // narrowed to sub-composition hosts only — keep these two functions in
      // sync so the inactive-arm decision matches the inject-time decision.
      const isVisualAncestorHidden = (el: HTMLElement): boolean => {
        let parent = el.parentElement;
        while (parent !== null && parent !== document.documentElement) {
          const computed = window.getComputedStyle(parent);
          if (computed.display === "none") return true;
          if (
            computed.visibility === "hidden" &&
            (parent.hasAttribute("data-composition-src") ||
              parent.hasAttribute("data-composition-file"))
          ) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      };
      const active = new Set(ids);
      const setColorGradingVisibility = (
        window as Window & {
          __hf?: {
            colorGrading?: { setSourceVisibility?: (target: Element, visible: boolean) => boolean };
          };
        }
      ).__hf?.colorGrading?.setSourceVisibility;
      const videos = Array.from(
        document.querySelectorAll("video[data-start]"),
      ) as HTMLVideoElement[];
      for (const video of videos) {
        const img = video.nextElementSibling as HTMLElement | null;
        const hasImg = img && img.classList.contains("__render_frame__");
        const ancestorHidden = isVisualAncestorHidden(video);
        const visible = active.has(video.id) && !ancestorHidden;
        if (visible) {
          // Active video: show injected <img>, hide native <video>.
          // Do NOT clobber inline opacity here — GSAP-controlled opacity must
          // survive until injectVideoFramesBatch reads it via getComputedStyle.
          // visibility:hidden alone hides the native element without affecting
          // its computed opacity.
          video.style.setProperty("visibility", "hidden", "important");
          video.style.setProperty("pointer-events", "none", "important");
          if (hasImg) {
            if (video.hasAttribute(colorGradingSourceHiddenAttr)) img.style.opacity = "1";
            img.style.visibility = "visible";
          }
        } else {
          // Inactive (or ancestor-hidden) video: hide both. Use visibility only
          // (never opacity) so we never clobber GSAP-controlled inline opacity.
          // Use `!important` on the <img> hide so `applyDomLayerMask`'s
          // important stylesheet rule (`#${showId} *{visibility:visible !important}`)
          // cannot revive a stale frame when the sub-comp host lands in the
          // active layer's `show` set — same mask-defense reasoning as the
          // `isVisualAncestorHidden` branch in `injectVideoFramesBatch`.
          video.style.removeProperty("display");
          video.style.setProperty("visibility", "hidden", "important");
          video.style.setProperty("pointer-events", "none", "important");
          if (hasImg) {
            img.style.setProperty("visibility", "hidden", "important");
          }
        }
        setColorGradingVisibility?.(video, visible);
      }
    },
    activeVideoIds,
    COLOR_GRADING_SOURCE_HIDDEN_ATTR,
  );
}
