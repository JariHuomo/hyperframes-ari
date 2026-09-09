import { describe, expect, it } from "vitest";
import { STUDIO_GSAP_EASE_OPTIONS } from "../components/editor/studioMotionTypes";
import { easeCurveOf, easeMatches, normalizeEase, parseEase } from "./easeContract";

function ok(input: unknown) {
  const parsed = parseEase(input);
  if (!parsed.ok) throw new Error(`expected ${String(input)} to parse: ${parsed.reason}`);
  return parsed;
}

describe("parseEase presets", () => {
  it("accepts every ease Studio itself offers, with numbers", () => {
    for (const option of STUDIO_GSAP_EASE_OPTIONS) {
      const parsed = ok(option);
      expect(parsed.kind).toBe("named");
      expect(parsed.ease).toBe(option);
      expect(parsed.points).toHaveLength(4);
      expect(parsed.points?.every(Number.isFinite)).toBe(true);
    }
  });

  it("normalises a listed name's spacing instead of refusing it", () => {
    expect(ok("elastic.out(1,0.45)").ease).toBe("elastic.out(1, 0.45)");
    expect(ok("  power2.out  ").ease).toBe("power2.out");
  });

  it("refuses a GSAP token Studio does not list", () => {
    // back.out exists in GSAP, but the Studio list carries back.out(1.7); the
    // contract is the list, not "whatever GSAP might accept".
    expect(parseEase("back.out").ok).toBe(false);
    expect(parseEase("power2.uot").ok).toBe(false);
  });
});

describe("parseEase custom cubics", () => {
  it("accepts a cubic and rounds it the way the persist paths do", () => {
    const parsed = ok("custom(M0,0 C0.2150,0.61 0.355,1 1,1)");
    expect(parsed.kind).toBe("custom");
    expect(parsed.ease).toBe("custom(M0,0 C0.215,0.61 0.355,1 1,1)");
    expect(parsed.points).toEqual([0.215, 0.61, 0.355, 1]);
  });

  it("allows Y overshoot, because that is what a bezier ease is for", () => {
    const parsed = ok("custom(M0,0 C0.34,1.56 0.64,-0.5 1,1)");
    expect(parsed.points).toEqual([0.34, 1.56, 0.64, -0.5]);
  });

  it("refuses an X control point outside the segment", () => {
    for (const bad of ["custom(M0,0 C1.2,0.61 0.355,1 1,1)", "custom(M0,0 C0.2,0.6 -0.1,1 1,1)"]) {
      const parsed = parseEase(bad);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.reason).toMatch(/X-ohjauspiste/);
    }
    expect(ok("custom(M0,0 C0,0.61 1,1 1,1)").ok).toBe(true);
  });

  it("refuses a Y control point outside the clamp range rather than clamping it", () => {
    const parsed = parseEase("custom(M0,0 C0.3,2.4 0.6,1 1,1)");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/Y-ohjauspiste/);
  });

  it("refuses a malformed cubic path", () => {
    for (const bad of ["custom(M0,0 C0.2,0.6 1,1)", "custom(nonsense)", "custom()"]) {
      expect(parseEase(bad).ok).toBe(false);
    }
  });
});

describe("parseEase spring, wiggle and hold", () => {
  it("accepts a spring and reports its bounce", () => {
    const parsed = ok("spring(0.50)");
    expect(parsed.kind).toBe("spring");
    expect(parsed.ease).toBe("spring(0.5)");
    expect(parsed.bounce).toBe(0.5);
  });

  it("refuses a spring bounce outside 0–1 instead of silently clamping it", () => {
    expect(parseEase("spring(5)").ok).toBe(false);
    expect(parseEase("spring(-1)").ok).toBe(false);
    expect(parseEase("spring()").ok).toBe(false);
  });

  it("accepts a wiggle and reports its configuration", () => {
    const parsed = ok("wiggle(6, easeOut, 0.2)");
    expect(parsed.kind).toBe("wiggle");
    expect(parsed.ease).toBe("wiggle(6,easeOut,0.2)");
    expect(parsed.wiggle).toEqual({ wiggles: 6, type: "easeOut", amplitude: 0.2 });
    expect(ok("wiggle(3,uniform)").ease).toBe("wiggle(3,uniform)");
  });

  it("refuses a wiggle with an unknown type or an out-of-range amplitude", () => {
    expect(parseEase("wiggle(6, springy)").ok).toBe(false);
    expect(parseEase("wiggle(6, easeOut, 4)").ok).toBe(false);
    expect(parseEase("wiggle(0, easeOut)").ok).toBe(false);
  });

  it("accepts hold, which has no control points", () => {
    const parsed = ok("hold");
    expect(parsed.kind).toBe("hold");
    expect(parsed.points).toBeUndefined();
  });
});

describe("parseEase refusals", () => {
  it("refuses garbage, empty input, non-strings and raw JavaScript", () => {
    for (const bad of [
      "",
      "   ",
      "poweeer",
      "custom",
      "spring",
      "wiggle",
      "hold()",
      "power2.out;",
    ]) {
      expect(parseEase(bad).ok).toBe(false);
    }
    for (const bad of [undefined, null, 4, {}, ["power2.out"]]) {
      expect(parseEase(bad).ok).toBe(false);
    }
    expect(parseEase("__raw:(()=>alert(1))()").ok).toBe(false);
  });

  it("answers in Finnish, because the reason reaches the panel", () => {
    const parsed = parseEase("power2.uot");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/Tuntematon käyrä/);
  });
});

describe("easeCurveOf and easeMatches", () => {
  it("describes a known curve and refuses to describe an unknown one", () => {
    expect(easeCurveOf("power2.out")).toMatchObject({ kind: "named", label: "Pehmeä" });
    expect(easeCurveOf("power2.uot")).toBeNull();
    expect(easeCurveOf(null)).toBeNull();
  });

  it("compares in normalised form, so rounding on save does not fail verification", () => {
    expect(
      easeMatches("custom(M0,0 C0.2150,0.610 0.355,1 1,1)", "custom(M0,0 C0.215,0.61 0.355,1 1,1)"),
    ).toBe(true);
    expect(easeMatches("spring(0.50)", "spring(0.5)")).toBe(true);
    expect(easeMatches("power2.out", "power3.out")).toBe(false);
    expect(easeMatches("power2.uot", "power2.out")).toBe(false);
    // Two identically-garbled strings must not compare as a verified curve
    // through some normalisation shortcut — they only match themselves.
    expect(easeMatches("power2.uot", "power2.uot")).toBe(true);
    expect(normalizeEase("power2.uot")).toBe("power2.uot");
    expect(normalizeEase(undefined)).toBeNull();
  });
});
