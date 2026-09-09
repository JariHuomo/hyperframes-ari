import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { bootstrapGsap } from "./bootstrapGsap";

const cdn = "https://example.test/gsap.js";
describe("GSAP bootstrap placement", () => {
  it("keeps the first scene animation inside the rendered template", () => {
    const html =
      '<template id="card"><section data-composition-id="card" data-no-timeline><h1>Hello</h1></section></template>';
    const { document } = parseHTML(bootstrapGsap(html, cdn));
    const template = document.querySelector("template");
    expect(template?.querySelectorAll("script")).toHaveLength(2);
    expect(template?.querySelector("script:not([src])")?.textContent).toContain(
      'window.__timelines["card"]',
    );
    expect(document.querySelector("[data-no-timeline]")).toBeNull();
    expect(template?.textContent).toContain("Hello");
  });
  it("keeps standalone scripts in the body", () => {
    const result = bootstrapGsap(
      '<!doctype html><html><head><title>Ad</title></head><body><main data-composition-id="ad" data-no-timeline></main></body></html>',
      cdn,
    );
    const { document } = parseHTML(result);
    expect(document.body.querySelectorAll("script")).toHaveLength(2);
    expect(document.querySelector("title")?.textContent).toBe("Ad");
  });
  it("encodes the composition id as JavaScript data", () => {
    const result = bootstrapGsap(
      "<template><div data-composition-id='a\"b'></div></template>",
      cdn,
    );
    expect(result).toContain('window.__timelines["a\\"b"]');
  });
});
