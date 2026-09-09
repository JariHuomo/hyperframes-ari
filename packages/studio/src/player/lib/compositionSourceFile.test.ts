// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { withCompositionSourceFiles } from "./compositionSourceFile";
import type { ClipManifestClip } from "./playbackTypes";

const clip = (over: Partial<ClipManifestClip>): ClipManifestClip =>
  ({
    id: null,
    label: "Clip",
    start: 0,
    duration: 1,
    track: 0,
    kind: "element",
    tagName: "div",
    compositionId: null,
    parentCompositionId: null,
    compositionSrc: null,
    assetUrl: null,
    ...over,
  }) as ClipManifestClip;

function preview(html: string): Document {
  const doc = document.implementation.createHTMLDocument("preview");
  doc.body.innerHTML = html;
  return doc;
}

describe("withCompositionSourceFiles", () => {
  it("recovers the source path the inliner renamed to data-composition-file", () => {
    // Exactly what the compiler leaves behind for a nested scene host.
    const doc = preview(
      `<div data-hf-id="headline-host-b" data-composition-id="headline-card-b"
            data-composition-file="scenes/headline-card.html"></div>`,
    );
    const [filled] = withCompositionSourceFiles(
      [clip({ id: "headline-host-b", compositionId: "headline-card-b", kind: "composition" })],
      doc,
    );

    expect(filled!.compositionSrc).toBe("scenes/headline-card.html");
  });

  it("keeps a source the runtime already reported", () => {
    const doc = preview(`<div data-hf-id="host" data-composition-file="scenes/other.html"></div>`);
    const [filled] = withCompositionSourceFiles(
      [clip({ id: "host", compositionSrc: "scenes/headline-card.html" })],
      doc,
    );

    expect(filled!.compositionSrc).toBe("scenes/headline-card.html");
  });

  it("falls back to the composition id when the host has no data-hf-id", () => {
    const doc = preview(
      `<div data-composition-id="pack-grid" data-composition-file="scenes/pack-grid.html"></div>`,
    );
    const [filled] = withCompositionSourceFiles(
      [clip({ id: null, compositionId: "pack-grid" })],
      doc,
    );

    expect(filled!.compositionSrc).toBe("scenes/pack-grid.html");
  });

  it("leaves an ordinary element alone and survives a missing preview document", () => {
    const doc = preview(`<div data-hf-id="brand"></div>`);

    expect(withCompositionSourceFiles([clip({ id: "brand" })], doc)[0]!.compositionSrc).toBeNull();
    expect(withCompositionSourceFiles([clip({ id: "brand" })], null)[0]!.compositionSrc).toBeNull();
  });

  it("gives two hosts of the same scene the same source", () => {
    const doc = preview(
      `<div data-hf-id="a" data-composition-file="scenes/headline-card.html"></div>
       <div data-hf-id="b" data-composition-file="scenes/headline-card.html"></div>`,
    );
    const filled = withCompositionSourceFiles([clip({ id: "a" }), clip({ id: "b" })], doc);

    expect(filled.map((one) => one.compositionSrc)).toEqual([
      "scenes/headline-card.html",
      "scenes/headline-card.html",
    ]);
  });
});
