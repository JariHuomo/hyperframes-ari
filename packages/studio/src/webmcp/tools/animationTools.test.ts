// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  studioAddAnimation,
  studioAddKeyframe,
  studioDeleteAnimation,
  studioUpdateAnimation,
  type AnimationToolDeps,
  type StudioAddAnimationResult,
  type StudioAddKeyframeResult,
  type StudioUpdateAnimationResult,
} from "./animationTools";
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import {
  expectFailure,
  expectOk,
  previewElement,
  selectionFor,
  sourceHandle,
  targetedWriteDeps,
} from "../webmcpTestUtils";

const animationInput = (input: Record<string, unknown>) => ({
  handle: sourceHandle("headline"),
  ...input,
});

function animationDeps(overrides: Partial<AnimationToolDeps> = {}): AnimationToolDeps {
  const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
  const selection = selectionFor(element);
  return {
    ...targetedWriteDeps(selection),
    getCompositionPath: () => "index.html",
    getAnimationsForSelection: async () => [{ id: "anim-1" }, { id: "anim-gone" }, { id: "a" }],
    readPlayhead: () => ({ currentTime: 2.4, duration: 10, isPlaying: false }),
    addAnimation: async () => true,
    updateAnimation: async () => true,
    addKeyframe: async () => undefined,
    deleteAnimation: async () => true,
    ...overrides,
  };
}

describe("studioAddAnimation", () => {
  it("does not report success before persistence and preview sync settle", async () => {
    let release!: (landed: boolean) => void;
    let actorStarted!: () => void;
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      actorStarted = resolve;
    });
    let settled = false;

    const resultPromise = studioAddAnimation(
      animationDeps({
        addAnimation: () => {
          actorStarted();
          return pending;
        },
      }),
      animationInput({ method: "from" }),
    ).then((result) => {
      settled = true;
      return result;
    });

    await started;
    await Promise.resolve();
    expect(settled).toBe(false);

    release(true);
    expect((await resultPromise).ok).toBe(true);
  });

  it("reports where the playhead actually was, not a position the caller chose", async () => {
    // The handler reads the playhead itself and ignores any position argument,
    // so echoing one back would report a number that had no effect.
    const addAnimation = vi.fn(async () => true);

    const result = await studioAddAnimation(
      animationDeps({
        addAnimation,
        readPlayhead: () => ({ currentTime: 7.25, duration: 10, isPlaying: false }),
      }),
      animationInput({ method: "from" }),
    );

    const ok = expectOk<StudioAddAnimationResult>(result);
    expect(ok.insertedAtSeconds).toBe(7.25);
    expect(ok.method).toBe("from");
    // A root target has no placement to name.
    expect(addAnimation).toHaveBeenCalledWith(expect.anything(), "from", undefined, null);
  });

  it("marks the result as dispatched after the underlying write settles", async () => {
    const result = await studioAddAnimation(animationDeps(), animationInput({ method: "to" }));

    expect(expectOk<StudioAddAnimationResult>(result).dispatched).toBe(true);
  });

  it("rejects an unknown ease before dispatching, and accepts the wider vocabulary", async () => {
    const addAnimation = vi.fn(async () => true);
    const deps = animationDeps({ addAnimation });

    for (const bad of ["power2.uot", "spring(5)", "custom(M0,0 C1.2,0.6 0.3,1 1,1)", ""]) {
      const result = expectFailure(
        await studioAddAnimation(deps, animationInput({ method: "from", ease: bad })),
      );
      expect(result.kind).toBe("invalid");
    }
    expect(addAnimation).not.toHaveBeenCalled();

    const ok = await studioAddAnimation(
      deps,
      animationInput({ method: "from", ease: "back.out(1.7)", position: 1, duration: 0.5 }),
    );
    expect(expectOk<StudioAddAnimationResult>(ok).ok).toBe(true);
    expect(addAnimation).toHaveBeenCalledWith(
      expect.anything(),
      "from",
      { position: 1, duration: 0.5, ease: "back.out(1.7)" },
      null,
    );
  });

  it("rejects an unknown method without dispatching", async () => {
    const addAnimation = vi.fn();

    const result = expectFailure(
      await studioAddAnimation(
        animationDeps({ addAnimation }),
        animationInput({ method: "wiggle" }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(addAnimation).not.toHaveBeenCalled();
  });

  it("refuses while a write is blocked, and when nothing is selected", async () => {
    const addAnimation = vi.fn();

    const paused = expectFailure(
      await studioAddAnimation(
        animationDeps({ getWriteBlockedReason: () => "Auto-save is paused", addAnimation }),
        animationInput({ method: "to" }),
      ),
    );
    const unselected = expectFailure(
      await studioAddAnimation(
        animationDeps({ buildSelection: async () => null, addAnimation }),
        animationInput({ method: "to" }),
      ),
    );

    expect(paused.kind).toBe("blocked");
    expect(unselected.kind).toBe("blocked");
    expect(addAnimation).not.toHaveBeenCalled();
  });
});

describe("studioUpdateAnimation", () => {
  it("dispatches the write after the handler reports acceptance", async () => {
    const updateAnimation = vi.fn(async () => true);

    const result = await studioUpdateAnimation(
      animationDeps({ updateAnimation }),
      animationInput({
        animationId: "anim-1",
        ease: "power2.out",
        duration: 1.5,
      }),
    );

    const ok = expectOk<StudioUpdateAnimationResult>(result);
    expect(ok.changed).toBe(false);
    expect(ok.updated).toEqual({ duration: 1.5, ease: "power2.out" });
    expect(updateAnimation).toHaveBeenCalledWith(expect.anything(), "anim-1", {
      duration: 1.5,
      ease: "power2.out",
    });
  });

  it("refuses an animation id owned by another target before calling the actor", async () => {
    const updateAnimation = vi.fn(async () => true);
    const result = await studioUpdateAnimation(
      animationDeps({
        getAnimationsForSelection: async () => [{ id: "other-animation" }],
        updateAnimation,
      }),
      animationInput({ animationId: "anim-1", duration: 2 }),
    );

    expect(result).toMatchObject({ ok: false, stage: "refused", kind: "invalid" });
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("reports a false return as a real failure", async () => {
    const result = expectFailure(
      await studioUpdateAnimation(
        animationDeps({ updateAnimation: async () => false }),
        animationInput({
          animationId: "anim-gone",
          ease: "none",
        }),
      ),
    );

    expect(result.kind).toBe("failed");
    expect(result.hint).toMatch(/stale/);
  });

  it("rules out the no-selection case BEFORE dispatch, so a false is unambiguous", async () => {
    // The handler answers `false` for both "nothing selected" and "the write
    // failed". Eliminating one beforehand is what makes the other legible.
    const updateAnimation = vi.fn(async () => false);

    const result = expectFailure(
      await studioUpdateAnimation(
        animationDeps({ buildSelection: async () => null, updateAnimation }),
        animationInput({ animationId: "anim-1", ease: "none" }),
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/cannot edit/);
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("requires at least one field, and rejects a negative duration", async () => {
    const deps = animationDeps();

    expect(
      expectFailure(await studioUpdateAnimation(deps, animationInput({ animationId: "a" }))).reason,
    ).toMatch(/at least one/);
    expect(
      expectFailure(
        await studioUpdateAnimation(deps, animationInput({ animationId: "a", duration: -1 })),
      ).reason,
    ).toMatch(/negative/);
  });

  it("rejects a blank animation id", async () => {
    const updateAnimation = vi.fn();

    const result = expectFailure(
      await studioUpdateAnimation(
        animationDeps({ updateAnimation }),
        animationInput({
          animationId: "   ",
          ease: "none",
        }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("rejects raw JavaScript ease expressions before dispatch", async () => {
    const updateAnimation = vi.fn();

    const result = await studioUpdateAnimation(
      animationDeps({ updateAnimation }),
      animationInput({ animationId: "anim-1", ease: "__raw:(()=>alert(1))()" }),
    );

    expect(result).toMatchObject({ ok: false, stage: "refused", kind: "invalid" });
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("refuses a misspelled ease BEFORE writing, so it never reaches the source", async () => {
    // power2.uot reads back byte-identical and would verify, while GSAP quietly
    // plays its default curve. The only place to catch it is before the write.
    const updateAnimation = vi.fn();

    const result = expectFailure(
      await studioUpdateAnimation(
        animationDeps({ updateAnimation }),
        animationInput({ animationId: "anim-1", ease: "power2.uot" }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/Tuntematon käyrä/);
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("accepts the whole closed vocabulary and writes it normalised", async () => {
    for (const [requested, saved] of [
      ["bounce.out", "bounce.out"],
      ["elastic.out(1,0.45)", "elastic.out(1, 0.45)"],
      ["custom(M0,0 C0.2150,0.61 0.355,1 1,1)", "custom(M0,0 C0.215,0.61 0.355,1 1,1)"],
      ["spring(0.50)", "spring(0.5)"],
      ["wiggle(6, easeOut)", "wiggle(6,easeOut)"],
      ["hold", "hold"],
    ]) {
      const updateAnimation = vi.fn(async () => true);
      const result = await studioUpdateAnimation(
        animationDeps({ updateAnimation }),
        animationInput({ animationId: "anim-1", ease: requested }),
      );

      expect(expectOk<StudioUpdateAnimationResult>(result).updated).toEqual({ ease: saved });
      expect(updateAnimation).toHaveBeenCalledWith(expect.anything(), "anim-1", { ease: saved });
    }
  });

  it("writes a keyframe animation's feel to easeEach, like the animation card", async () => {
    const updateAnimation = vi.fn(async () => true);

    const result = await studioUpdateAnimation(
      animationDeps({
        getAnimationsForSelection: async () => [
          { id: "anim-1", keyframes: { format: "percentage", keyframes: [] } },
        ],
        updateAnimation,
      }),
      animationInput({ animationId: "anim-1", ease: "power3.out" }),
    );

    expect(expectOk<StudioUpdateAnimationResult>(result).updated).toEqual({
      easeEach: "power3.out",
    });
    expect(updateAnimation).toHaveBeenCalledWith(expect.anything(), "anim-1", {
      easeEach: "power3.out",
    });
  });

  it("refuses easeEach on an animation that has no keyframes", async () => {
    const updateAnimation = vi.fn();

    const result = expectFailure(
      await studioUpdateAnimation(
        animationDeps({ updateAnimation }),
        animationInput({ animationId: "anim-1", easeEach: "power3.out" }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(result.reason).toMatch(/no keyframes/);
    expect(updateAnimation).not.toHaveBeenCalled();
  });
});

describe("studioAddKeyframe", () => {
  it("passes every property through in one commit", async () => {
    const addKeyframe = vi.fn(async () => undefined);

    const result = await studioAddKeyframe(
      animationDeps({ addKeyframe }),
      animationInput({
        animationId: "anim-1",
        percent: 50,
        properties: { y: -50, opacity: 0 },
      }),
    );

    const ok = expectOk<StudioAddKeyframeResult>(result);
    expect(ok.properties).toEqual({ y: -50, opacity: 0 });
    // One call, so one undo entry, rather than one per property.
    expect(addKeyframe).toHaveBeenCalledTimes(1);
    expect(addKeyframe).toHaveBeenCalledWith(expect.anything(), "anim-1", 50, {
      y: -50,
      opacity: 0,
    });
  });

  it("validates percent itself, because the platform does not", async () => {
    // Nothing checks the input object against inputSchema, so the tool receives
    // whatever the agent sent.
    const addKeyframe = vi.fn();
    const deps = animationDeps({ addKeyframe });

    for (const percent of [-1, 101, Number.NaN, "50"]) {
      const result = expectFailure(
        await studioAddKeyframe(
          deps,
          animationInput({ animationId: "a", percent, properties: { y: 1 } }),
        ),
      );
      expect(result.kind).toBe("invalid");
    }
    expect(addKeyframe).not.toHaveBeenCalled();
  });

  it("rejects properties that carry no usable value", async () => {
    const addKeyframe = vi.fn();
    const deps = animationDeps({ addKeyframe });

    for (const properties of [{}, { y: null }, [], "y:1"]) {
      const result = expectFailure(
        await studioAddKeyframe(
          deps,
          animationInput({ animationId: "a", percent: 50, properties }),
        ),
      );
      expect(result.kind).toBe("invalid");
    }
    expect(addKeyframe).not.toHaveBeenCalled();
  });

  it("rejects raw JavaScript keyframe values before dispatch", async () => {
    const addKeyframe = vi.fn();

    const result = await studioAddKeyframe(
      animationDeps({ addKeyframe }),
      animationInput({
        animationId: "anim-1",
        percent: 50,
        properties: { x: "__raw:(()=>alert(1))()" },
      }),
    );

    expect(result).toMatchObject({ ok: false, stage: "refused", kind: "invalid" });
    expect(addKeyframe).not.toHaveBeenCalled();
  });

  it("accepts 0 and 100 as the ends of the tween", async () => {
    for (const percent of [0, 100]) {
      const result = await studioAddKeyframe(
        animationDeps(),
        animationInput({
          animationId: "a",
          percent,
          properties: { y: 1 },
        }),
      );
      expect(expectOk<StudioAddKeyframeResult>(result).percent).toBe(percent);
    }
  });

  it("refuses an animation id owned by another target before calling the actor", async () => {
    const addKeyframe = vi.fn(async () => undefined);

    const result = await studioAddKeyframe(
      animationDeps({
        getAnimationsForSelection: async () => [{ id: "other-animation" }],
        addKeyframe,
      }),
      animationInput({ animationId: "anim-1", percent: 50, properties: { y: 1 } }),
    );

    expect(result).toMatchObject({ ok: false, stage: "refused", kind: "invalid" });
    expect(addKeyframe).not.toHaveBeenCalled();
  });
});

describe("studioDeleteAnimation", () => {
  it("does not report success before persistence and preview sync settle", async () => {
    let release!: (landed: boolean) => void;
    let actorStarted!: () => void;
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      actorStarted = resolve;
    });
    let settled = false;

    const resultPromise = studioDeleteAnimation(
      animationDeps({
        deleteAnimation: () => {
          actorStarted();
          return pending;
        },
      }),
      animationInput({ animationId: "anim-1" }),
    ).then((result) => {
      settled = true;
      return result;
    });

    await started;
    await Promise.resolve();
    expect(settled).toBe(false);

    release(true);
    expect((await resultPromise).ok).toBe(true);
  });

  it("dispatches the delete and says so", async () => {
    const deleteAnimation = vi.fn(async () => true);

    const result = await studioDeleteAnimation(
      animationDeps({ deleteAnimation }),
      animationInput({
        animationId: "anim-1",
      }),
    );

    expect(result.ok).toBe(true);
    expect(deleteAnimation).toHaveBeenCalledWith(expect.anything(), "anim-1");
  });

  it("refuses while a write is blocked", async () => {
    const deleteAnimation = vi.fn();

    const result = expectFailure(
      await studioDeleteAnimation(
        animationDeps({ getWriteBlockedReason: () => "Auto-save is paused", deleteAnimation }),
        animationInput({ animationId: "anim-1" }),
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(deleteAnimation).not.toHaveBeenCalled();
  });

  it("refuses an animation id owned by another target before calling the actor", async () => {
    const deleteAnimation = vi.fn();

    const result = await studioDeleteAnimation(
      animationDeps({
        getAnimationsForSelection: async () => [{ id: "other-animation" }],
        deleteAnimation,
      }),
      animationInput({ animationId: "anim-1" }),
    );

    expect(result).toMatchObject({ ok: false, stage: "refused", kind: "invalid" });
    expect(deleteAnimation).not.toHaveBeenCalled();
  });
});

/**
 * Sprint S4/S5: the same twelve tools, now aware of both clocks. Every number
 * here comes from the clip manifest; nothing is inferred from the element.
 */
const TITLE_SCENE = "compositions/title-card.html";
const PACK_SCENE = "compositions/pack-grid.html";

const sceneClip = (overrides: Record<string, unknown>) => ({
  id: "host",
  label: "Otsikkokortti",
  start: 0,
  duration: 4,
  kind: "composition",
  compositionId: "scene",
  parentCompositionId: null,
  compositionSrc: TITLE_SCENE,
  compositionAncestors: ["root"],
  playbackStart: 0,
  playbackRate: 1,
  ...overrides,
});

const SCENE_MANIFEST = [
  sceneClip({ id: "title-host-a", compositionId: "title-a", start: 0, duration: 4 }),
  sceneClip({ id: "title-host-b", compositionId: "title-b", start: 4, duration: 4 }),
  sceneClip({
    id: "pack-host",
    compositionId: "pack",
    compositionSrc: PACK_SCENE,
    start: 2,
    duration: 5,
  }),
];

function nestedDeps(
  sourceFile: string,
  overrides: Partial<AnimationToolDeps> = {},
): AnimationToolDeps {
  const element = previewElement('<h1 id="headline">Ship it</h1>', "headline");
  const selection = selectionFor(element, { sourceFile });
  return {
    ...animationDeps(overrides),
    ...targetedWriteDeps(selection),
    getClipManifest: () => SCENE_MANIFEST,
    getCompositionPath: () => "index.html",
    ...overrides,
  };
}

describe("studioAddAnimation · nested scene time", () => {
  it("writes the scene-local position for a master-time request and reports both times", async () => {
    const addAnimation = vi.fn(async () => true);

    const result = await studioAddAnimation(
      nestedDeps(TITLE_SCENE, { addAnimation }),
      animationInput({
        method: "from",
        position: 5,
        duration: 0.5,
        timeBasis: "master",
        instance: "title-host-b",
      }),
    );

    // The writer needs the chosen placement too: without it a scene hosted
    // twice is ambiguous down in the ops hook and the add never lands.
    expect(addAnimation).toHaveBeenCalledWith(
      expect.anything(),
      "from",
      expect.objectContaining({ position: 1, duration: 0.5 }),
      "title-host-b",
    );
    const ok = expectOk<StudioAddAnimationResult>(result);
    expect(ok.insertedAtSeconds).toBe(1);
    expect(ok.affectsInstances).toBe(2);
    expect(ok.scene).toMatchObject({
      sourceFile: TITLE_SCENE,
      instance: "title-host-b",
      instanceIndex: 2,
      instanceCount: 2,
      timeBasis: "master",
      localPosition: 1,
      masterPosition: 5,
    });
  });

  it("refuses a two-instance target with no instance before anything is written", async () => {
    const addAnimation = vi.fn(async () => true);

    const result = expectFailure(
      await studioAddAnimation(
        nestedDeps(TITLE_SCENE, { addAnimation }),
        animationInput({ method: "from", position: 1, duration: 0.5 }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(result.reason).toContain("2 esiintymää");
    expect(addAnimation).not.toHaveBeenCalled();
  });

  it("hands the writer the scene file and its auto-selected placement", async () => {
    const addAnimation = vi.fn(async () => true);
    const readAnimationSource = vi.fn(async (selection: DomEditSelection) => ({
      sourceFile: selection.sourceFile || "index.html",
      version: "v",
      animations: [],
    }));

    await studioAddAnimation(
      nestedDeps(PACK_SCENE, { addAnimation, readAnimationSource }),
      animationInput({ method: "from", position: 3.2, duration: 0.4, timeBasis: "master" }),
    );

    expect(addAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFile: PACK_SCENE }),
      "from",
      expect.objectContaining({ position: 1.2 }),
      "pack-host",
    );
    // Readback reads the SCENE's own file, never the master's script.
    expect(readAnimationSource.mock.calls.every(([sel]) => sel.sourceFile === PACK_SCENE)).toBe(
      true,
    );
  });

  it("verifies a nested add against the scene source, not the master composition", async () => {
    const added = {
      id: "#headline-from-1200-visual",
      targetSelector: "#headline",
      method: "from",
      position: 1.2,
      duration: 0.4,
      ease: "power2.out",
      properties: { opacity: 0 },
    };
    let landed = false;
    const readAnimationSource = vi.fn(async (selection: DomEditSelection) => ({
      sourceFile: selection.sourceFile || "index.html",
      version: landed ? "v2" : "v1",
      // The master's script is a different file and must not be consulted.
      animations: selection.sourceFile === PACK_SCENE && landed ? [added] : [],
    }));

    const ok = expectOk<StudioAddAnimationResult>(
      await studioAddAnimation(
        nestedDeps(PACK_SCENE, {
          readAnimationSource,
          addAnimation: async () => {
            landed = true;
            return true;
          },
        }),
        animationInput({ method: "from", position: 3.2, duration: 0.4, timeBasis: "master" }),
      ),
    );

    expect(ok.stage).toBe("verified");
    expect(ok.animationId).toBe(added.id);
    expect(ok.scene).toMatchObject({ sourceFile: PACK_SCENE, localPosition: 1.2 });
  });

  it("auto-selects the only placement and defaults to the scene's own clock", async () => {
    const addAnimation = vi.fn(async () => true);

    const ok = expectOk<StudioAddAnimationResult>(
      await studioAddAnimation(
        nestedDeps(PACK_SCENE, { addAnimation }),
        animationInput({ method: "from", position: 1.2, duration: 0.4 }),
      ),
    );

    expect(ok.scene).toMatchObject({
      instance: "pack-host",
      timeBasis: "scene",
      localPosition: 1.2,
      masterPosition: 3.2,
    });
    expect(ok.affectsInstances).toBe(1);
  });

  it("refuses a motion that would end after the host stops showing the scene", async () => {
    const addAnimation = vi.fn(async () => true);

    const result = expectFailure(
      await studioAddAnimation(
        nestedDeps(TITLE_SCENE, { addAnimation }),
        animationInput({
          method: "from",
          position: 3.5,
          duration: 1,
          instance: "title-host-a",
        }),
      ),
    );

    expect(result.reason).toBe("liike ei näy pääajassa (kohtaus loppuu 4,00 s)");
    expect(addAnimation).not.toHaveBeenCalled();
  });

  it("keeps a root-composition add on the existing master-time fit check", async () => {
    const addAnimation = vi.fn(async () => true);

    const result = expectFailure(
      await studioAddAnimation(
        animationDeps({ addAnimation }),
        animationInput({ method: "from", position: 9.8, duration: 1 }),
      ),
    );

    expect(result.reason).toBe("motion must fit within the composition");
    expect(addAnimation).not.toHaveBeenCalled();
  });
});

describe("studioUpdateAnimation · nested scene time", () => {
  it("converts a master position before the update and carries both times", async () => {
    const updateAnimation = vi.fn(async () => true);

    const ok = expectOk<StudioUpdateAnimationResult>(
      await studioUpdateAnimation(
        nestedDeps(TITLE_SCENE, { updateAnimation }),
        animationInput({
          animationId: "anim-1",
          position: 5,
          timeBasis: "master",
          instance: "title-host-b",
        }),
      ),
    );

    expect(updateAnimation).toHaveBeenCalledWith(
      expect.anything(),
      "anim-1",
      expect.objectContaining({ position: 1 }),
    );
    expect(ok.scene).toMatchObject({ localPosition: 1, masterPosition: 5, affectsInstances: 2 });
    expect(ok.affectsInstances).toBe(2);
  });

  it("refuses an ambiguous instance before the update lands", async () => {
    const updateAnimation = vi.fn(async () => true);

    const result = expectFailure(
      await studioUpdateAnimation(
        nestedDeps(TITLE_SCENE, { updateAnimation }),
        animationInput({ animationId: "anim-1", position: 1 }),
      ),
    );

    expect(result.kind).toBe("invalid");
    expect(result.reason).toContain("valitse instance");
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("leaves an ease-only update alone: no position, no scene conversion", async () => {
    const updateAnimation = vi.fn(async () => true);

    const ok = expectOk<StudioUpdateAnimationResult>(
      await studioUpdateAnimation(
        nestedDeps(TITLE_SCENE, { updateAnimation }),
        animationInput({ animationId: "anim-1", ease: "power3.out" }),
      ),
    );

    expect(ok.scene).toBeUndefined();
    expect(updateAnimation).toHaveBeenCalledWith(expect.anything(), "anim-1", {
      ease: "power3.out",
    });
  });
});
