// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { findElementForSelection } from "./domEditingElement";
it("does not retarget a deleted stable identity through a shared class", () => {
  const doc = new DOMParser().parseFromString(
    '<p class="headline" data-hf-id="original">Original</p>',
    "text/html",
  );
  expect(findElementForSelection(doc, { hfId: "deleted-copy", selector: ".headline" })).toBeNull();
  expect(findElementForSelection(doc, { id: "deleted-copy", selector: ".headline" })).toBeNull();
});
it("resolves the selected host and refuses a missing host without changing source identity", () => {
  const doc = new DOMParser().parseFromString(
    '<div id="first"><p data-hf-id="shared"></p></div><div id="second"><p data-hf-id="shared"></p></div>',
    "text/html",
  );
  expect(
    findElementForSelection(doc, { hfId: "shared", instanceId: "second" })?.parentElement?.id,
  ).toBe("second");
  expect(findElementForSelection(doc, { hfId: "shared", instanceId: "missing" })).toBeNull();
});
