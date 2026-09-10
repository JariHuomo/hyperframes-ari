import { copyElementStyles } from "./elementStyleCopy";
import type { HyperFramesElement } from "@hyperframes/sdk";
import { rewriteElementMotion } from "./elementMotionCopy";

export function elementKind(element: HyperFramesElement) {
  if (element.attributes["data-composition-id"] || element.attributes["data-composition-src"])
    return null;
  if (element.attributes["data-ari-element"]) return element.attributes["data-ari-element"];
  if (element.tag.toLowerCase() === "img") return "image";
  if (element.text) return "text";
  if (element.tag.toLowerCase() === "div" && !element.children.length) return "background";
  return null;
}

/** Structural edits use the SDK's stamped source, without its broad GSAP deletion cascade. */
export function editElementSource(source: string, target: string, duplicate: boolean) {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const node = Array.from(doc.querySelectorAll("[data-hf-id]")).find(
    (el) => el.getAttribute("data-hf-id") === target,
  );
  if (!node) throw new Error("Kohde puuttuu.");
  if (node.children.length)
    throw new Error("Sisäkkäisen elementtiryhmän kopiointi tai poisto ei vielä ole tuettu.");
  let copy: Element | null = null;
  let copiedTarget = target;
  if (duplicate) {
    const cloned = node.cloneNode(true);
    if (!(cloned instanceof Element)) throw new Error("Kopiointi epäonnistui.");
    copy = cloned;
    const ids = new Set(
      Array.from(doc.querySelectorAll("[id], [data-hf-id]")).flatMap((el) => [
        el.id,
        el.getAttribute("data-hf-id"),
      ]),
    );
    let index = 1;
    while (ids.has(`${target}-copy-${index}`)) index++;
    copiedTarget = `${target}-copy-${index}`;
    copy.setAttribute("data-hf-id", copiedTarget);
    if (node.id) copy.id = copiedTarget;
    copyElementStyles(doc, node, copiedTarget);
    copy.setAttribute(
      "data-label",
      `${node.getAttribute("data-label") || node.id || "Elementti"} (kopio)`,
    );
  }
  rewriteElementMotion(doc, node, copy);
  if (copy) node.after(copy);
  else node.remove();
  return {
    target: copiedTarget,
    after: `${doc.doctype ? "<!DOCTYPE html>\n" : ""}${doc.documentElement.outerHTML}`,
  };
}
