// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { previewHasSourceContent, waitForPreviewSourceContent } from "./selectionSourcePresence";

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument("preview");
  doc.body.innerHTML = html;
  Object.defineProperty(doc, "readyState", { value: "complete", configurable: true });
  return doc;
}

describe("previewHasSourceContent", () => {
  it("is false for an empty document, whatever the file", () => {
    const doc = docWith("");
    expect(previewHasSourceContent(doc, "scenes/headline-card.html", "index.html")).toBe(false);
    expect(previewHasSourceContent(doc, undefined, "index.html")).toBe(false);
  });

  it("is true for the active composition once the body holds anything", () => {
    const doc = docWith('<div id="root"></div>');
    expect(previewHasSourceContent(doc, "index.html", "index.html")).toBe(true);
    expect(previewHasSourceContent(doc, undefined, "index.html")).toBe(true);
  });

  it("is false while the nested scene has not mounted yet", () => {
    const doc = docWith('<div id="root"><section data-hf-id="host"></section></div>');
    expect(previewHasSourceContent(doc, "scenes/headline-card.html", "index.html")).toBe(false);
  });

  it("is true once a host names that file, raw or url-shaped", () => {
    const raw = docWith('<div data-composition-src="scenes/headline-card.html"></div>');
    expect(previewHasSourceContent(raw, "scenes/headline-card.html", "index.html")).toBe(true);
    const url = docWith('<div data-composition-file="/scenes/headline-card.html?v=3"></div>');
    expect(previewHasSourceContent(url, "scenes/headline-card.html", "index.html")).toBe(true);
  });

  it("does not accept a different scene as proof", () => {
    const doc = docWith('<div data-composition-src="scenes/pack-grid.html"></div>');
    expect(previewHasSourceContent(doc, "scenes/headline-card.html", "index.html")).toBe(false);
  });
});

describe("waitForPreviewSourceContent", () => {
  const active = "index.html";
  const source = "scenes/headline-card.html";

  it("returns the document the scene finally mounted in", async () => {
    const empty = docWith('<div id="root"></div>');
    const mounted = docWith(`<div data-composition-src="${source}"></div>`);
    let reads = 0;
    const found = await waitForPreviewSourceContent({
      getDocument: () => (++reads < 3 ? empty : mounted),
      sourceFile: source,
      activeCompositionPath: active,
      stale: () => false,
      intervalMs: 1,
      timeoutMs: 50,
      wait: async () => {},
    });
    expect(found).toBe(mounted);
    expect(reads).toBe(3);
  });

  it("gives up when the scene never mounts, so the caller may clear", async () => {
    const empty = docWith('<div id="root"></div>');
    const found = await waitForPreviewSourceContent({
      getDocument: () => empty,
      sourceFile: source,
      activeCompositionPath: active,
      stale: () => false,
      intervalMs: 1,
      timeoutMs: 5,
      wait: async () => {},
    });
    expect(found).toBeNull();
  });

  it("stops the moment a newer selection supersedes this one", async () => {
    const mounted = docWith(`<div data-composition-src="${source}"></div>`);
    let reads = 0;
    const found = await waitForPreviewSourceContent({
      getDocument: () => {
        reads++;
        return mounted;
      },
      sourceFile: source,
      activeCompositionPath: active,
      stale: () => true,
      intervalMs: 1,
      timeoutMs: 50,
      wait: async () => {},
    });
    expect(found).toBeNull();
    expect(reads).toBe(0);
  });

  it("survives a preview whose document cannot be read yet", async () => {
    const mounted = docWith(`<div data-composition-src="${source}"></div>`);
    let reads = 0;
    const found = await waitForPreviewSourceContent({
      getDocument: () => (++reads < 2 ? null : mounted),
      sourceFile: source,
      activeCompositionPath: active,
      stale: () => false,
      intervalMs: 1,
      timeoutMs: 50,
      wait: async () => {},
    });
    expect(found).toBe(mounted);
  });
});
