// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { makeSelection } from "../hooks/domSelectionTestHarness";
import { domEditSelectionsTargetSame, replaceDomEditGroupSelection } from "./domEditHelpers";
describe("selection identity after assigning an animation target id", () => {
  it("replaces the same hf-id rather than growing a phantom multiselection", () => {
    const before = {
      ...makeSelection("Offer", document.createElement("div")),
      sourceFile: "scenes/title.html",
      hfId: "offer",
      id: undefined,
      selector: ".offer",
    };
    const after = {
      ...before,
      element: document.createElement("div"),
      id: "offer",
      selector: "#offer",
    };
    expect(domEditSelectionsTargetSame(before, after)).toBe(true);
    expect(replaceDomEditGroupSelection([before], after)).toEqual([after]);
    expect(domEditSelectionsTargetSame(before, { ...after, sourceFile: "scenes/other.html" })).toBe(
      false,
    );
    expect(domEditSelectionsTargetSame(before, { ...after, hfId: "different" })).toBe(false);
  });
});
