/** Ari fork: a templated scene only renders scripts inside its template. */
import { parseHTML } from "linkedom";

export function bootstrapGsap(html: string, gsapCdn: string): string {
  const { document } = parseHTML(html);
  const template = document.querySelector("template");
  const scope = template ?? document;
  const root = scope.querySelector("[data-composition-id]");
  const compositionId = root?.getAttribute("data-composition-id") ?? "main";
  // This scene is animated now. Keeping the static marker would misdescribe it.
  root?.removeAttribute("data-no-timeline");
  const target = template ?? document.querySelector("body") ?? document.documentElement;
  if (!target) throw new Error("Cannot add an animation without a composition document.");
  const dependency = document.createElement("script");
  dependency.setAttribute("src", gsapCdn);
  const script = document.createElement("script");
  const key = JSON.stringify(compositionId).replace(/</g, "\\u003c");
  script.textContent = [
    "window.__timelines = window.__timelines || {};",
    "const tl = gsap.timeline({ paused: true });",
    `window.__timelines[${key}] = tl;`,
  ].join("\n");
  target.appendChild(dependency);
  target.appendChild(script);
  return document.toString();
}
