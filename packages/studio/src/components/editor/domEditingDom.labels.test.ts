// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { buildElementLabel } from "./domEditingDom";
it("preserves the explicitly authored Finnish label instead of humanizing its source identifier", () => {
  const element = document.createElement("h1");
  element.id = "pääviesti";
  element.setAttribute("data-label", "Pääviesti");
  expect(buildElementLabel(element)).toBe("Pääviesti");
  element.setAttribute("data-label", "  ");
  element.id = "headline";
  expect(buildElementLabel(element)).toBe("Headline");
});
