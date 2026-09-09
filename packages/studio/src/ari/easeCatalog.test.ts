import { describe, expect, it } from "vitest";
import { parseEase } from "../webmcp/easeContract";
import { ARI_EASE_GROUPS, UPSTREAM_PRESET_EASES, ariEaseLabel, contractEase } from "./easeCatalog";

const options = ARI_EASE_GROUPS.flatMap((group) => group.options);

describe("ARI_EASE_GROUPS", () => {
  it("offers only curves the closed contract accepts", () => {
    // A preset the contract refuses would be a button that always fails.
    for (const option of options) {
      const parsed = parseEase(option.ease);
      expect(parsed.ok, `${option.ease}: ${parsed.ok ? "" : parsed.reason}`).toBe(true);
    }
  });

  it("offers each ease exactly once, under a Finnish name", () => {
    expect(new Set(options.map((option) => option.ease)).size).toBe(options.length);
    for (const option of options) expect(option.label.trim()).not.toBe("");
  });

  it("keeps the six planned groups in order", () => {
    expect(ARI_EASE_GROUPS.map((group) => group.title)).toEqual([
      "Tasainen",
      "Pehmeä",
      "Napakka",
      "Palautuva",
      "Jousi",
      "Heilahdus",
    ]);
  });

  it("covers every upstream preset, so nothing is lost by grouping", () => {
    const offered = new Set(options.map((option) => option.ease));
    for (const ease of UPSTREAM_PRESET_EASES) expect(offered.has(ease)).toBe(true);
  });

  it("spells back eases with their explicit overshoot", () => {
    expect(contractEase("back.out")).toBe("back.out(1.7)");
    // parseEase would refuse the bare spelling; that is why the mapping exists.
    expect(parseEase("back.out").ok).toBe(false);
  });

  it("names a known ease and admits an unknown one", () => {
    expect(ariEaseLabel("power2.out")).toBe("Pehmeä");
    expect(ariEaseLabel("back.out")).toBe("Palautuva");
    expect(ariEaseLabel("custom(M0,0 C0.1,0.2 0.3,0.4 1,1)")).toBeNull();
  });
});
