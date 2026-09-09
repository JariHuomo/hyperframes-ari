import { describe, expect, it } from "vitest";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import { settleAnimationWrite, type AnimationSourceSnapshot } from "./animationReadback";
const selection = {} as DomEditSelection;
function snapshot(id: string, position: number, version = id): AnimationSourceSnapshot {
  return {
    sourceFile: "index.html",
    version,
    animations: [
      {
        id,
        method: "from",
        position,
        duration: 0.45,
        ease: "power2.out",
        properties: { opacity: 0 },
        targetSelector: "#headline",
      } as GsapAnimation,
    ],
  };
}
describe("Ari motion readback", () => {
  it("returns the fresh id after retiming changes the parser identity", async () => {
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => snapshot("new", 2.9) },
      selection,
      snapshot("old", 2.6),
      { animationId: "old" },
      { kind: "update", animationId: "old", updates: { position: 2.9, duration: 0.45 } },
    );
    expect(result).toMatchObject({
      ok: true,
      stage: "verified",
      animationId: "new",
      changed: true,
      evidence: { version: "new" },
    });
  });
  it("rejects a resolved writer that did not change the requested timing", async () => {
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => snapshot("old", 2.6) },
      selection,
      snapshot("old", 2.6),
      {},
      { kind: "update", animationId: "old", updates: { position: 2.9 } },
    );
    expect(result.ok).toBe(false);
  });
  it("refuses an added tween with the wrong preset despite matching timing", async () => {
    const after = snapshot("new", 2.6);
    const before = { ...snapshot("before", 0), animations: [] };
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => after },
      selection,
      before,
      {},
      {
        kind: "add",
        position: 2.6,
        method: "from",
        duration: 0.45,
        ease: "power2.out",
        properties: { opacity: 0, y: 80 },
      },
    );
    expect(result.ok).toBe(false);
    after.animations[0].properties.y = 80;
    const correct = await settleAnimationWrite(
      { readAnimationSource: async () => after },
      selection,
      before,
      {},
      {
        kind: "add",
        position: 2.6,
        method: "from",
        duration: 0.45,
        ease: "power2.out",
        properties: { opacity: 0, y: 80 },
      },
    );
    expect(correct).toMatchObject({ ok: true, stage: "verified", animationId: "new" });
  });
  it("verifies an ease the persist path rounded, and reports its curve as numbers", async () => {
    // sdkGsapTweenPersist/commitMutationSafely round decimals, so a curve that
    // saved perfectly used to fail a raw string comparison.
    const after = snapshot("new", 2.6);
    after.animations[0].ease = "custom(M0,0 C0.215,0.61 0.355,1 1,1)";
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => after },
      selection,
      snapshot("old", 2.6),
      {},
      {
        kind: "update",
        animationId: "old",
        updates: { ease: "custom(M0,0 C0.2150,0.6100 0.3550,1 1,1)" },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      stage: "verified",
      easeCurve: { kind: "custom", points: [0.215, 0.61, 0.355, 1], label: "Mukautettu käyrä" },
    });
  });

  it("still refuses an ease that normalises to a different curve", async () => {
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => snapshot("new", 2.6) },
      selection,
      snapshot("old", 2.6),
      {},
      { kind: "update", animationId: "old", updates: { ease: "power3.out" } },
    );

    expect(result.ok).toBe(false);
  });

  it("verifies easeEach against the keyframe block, and reports that curve", async () => {
    const after = snapshot("new", 2.6);
    after.animations[0].keyframes = {
      format: "percentage",
      keyframes: [],
      easeEach: "power3.out",
    };
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => after },
      selection,
      snapshot("old", 2.6),
      {},
      { kind: "update", animationId: "old", updates: { easeEach: "power3.out" } },
    );

    // The keyframe feel wins over the tween's own ease, exactly as it renders.
    expect(result).toMatchObject({
      ok: true,
      stage: "verified",
      easeCurve: { kind: "named", ease: "power3.out", label: "Napakka" },
    });
  });

  it("refuses easeEach that did not reach the keyframe block", async () => {
    const result = await settleAnimationWrite(
      { readAnimationSource: async () => snapshot("new", 2.6) },
      selection,
      snapshot("old", 2.6),
      {},
      { kind: "update", animationId: "old", updates: { easeEach: "power3.out" } },
    );

    expect(result.ok).toBe(false);
  });

  it("does not claim verification if the source read fails", async () => {
    await expect(
      settleAnimationWrite(
        {
          readAnimationSource: async () => {
            throw new Error("read failed");
          },
        },
        selection,
        snapshot("old", 2.6),
        {},
        { kind: "delete", animationId: "old" },
      ),
    ).rejects.toThrow("read failed");
  });
});
