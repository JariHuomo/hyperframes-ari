import { describe, expect, it } from "vitest";
import {
  describeScene,
  findSceneInstance,
  resolveSceneSeek,
  resolveSceneWrite,
  sceneInstanceChoice,
  sceneSeekReceipt,
  validateSceneFit,
  type SceneToolDeps,
} from "./animationScene";
import { resolveSceneInstances, type SceneTimeManifestClip } from "../../ari/sceneTime";
import { expectFailure } from "../webmcpTestUtils";

const TITLE = "compositions/title-card.html";
const PACK = "compositions/pack-grid.html";

function clip(overrides: Partial<SceneTimeManifestClip>): SceneTimeManifestClip {
  return {
    id: "host",
    label: "Otsikkokortti",
    start: 0,
    duration: 4,
    kind: "composition",
    compositionId: "scene",
    parentCompositionId: null,
    compositionSrc: TITLE,
    compositionAncestors: ["root"],
    playbackStart: 0,
    playbackRate: 1,
    ...overrides,
  };
}

/** Two placements of the title card, one of the pack grid. */
const TWO_INSTANCE_MANIFEST: SceneTimeManifestClip[] = [
  clip({ id: "title-host-a", compositionId: "title-a", start: 0, duration: 4 }),
  clip({ id: "title-host-b", compositionId: "title-b", start: 4, duration: 4 }),
  clip({
    id: "pack-host",
    compositionId: "pack",
    label: "Pakkausruudukko",
    compositionSrc: PACK,
    start: 2,
    duration: 5,
  }),
];

function deps(
  clips: readonly SceneTimeManifestClip[] = TWO_INSTANCE_MANIFEST,
  compositionPath = "index.html",
): SceneToolDeps {
  return { getClipManifest: () => clips, getCompositionPath: () => compositionPath };
}

const request = (overrides: Partial<Parameters<typeof resolveSceneWrite>[2]> = {}) => ({
  position: 0,
  duration: 0.5,
  compositionDuration: 10,
  ...overrides,
});

function instanceOf(clips: readonly SceneTimeManifestClip[], source: string, hostId: string) {
  const found = resolveSceneInstances({ clips }, source).instances.find(
    (candidate) => candidate.hostId === hostId,
  );
  if (!found) throw new Error(`no instance ${hostId}`);
  return found;
}

describe("describeScene", () => {
  it("lists every placement with its master window and rate", () => {
    const described = describeScene(deps(), TITLE);

    expect(described?.affectsInstances).toBe(2);
    expect(described?.instances).toEqual([
      expect.objectContaining({ hostId: "title-host-a", masterStart: 0, masterEnd: 4 }),
      expect.objectContaining({ hostId: "title-host-b", masterStart: 4, masterEnd: 8 }),
    ]);
    expect(described?.instances[1]?.playbackRate).toBe(1);
  });

  it("reports an untransformable host as unsupported with a Finnish reason", () => {
    const described = describeScene(
      deps([clip({ id: "broken", start: Number.NaN as unknown as number })]),
      TITLE,
    );

    expect(described?.instances).toEqual([]);
    expect(described?.unsupported).toEqual([
      expect.objectContaining({
        hostId: "broken",
        reason: "unresolved-host-start",
        detail: "kohtauksen alkuaika ei ratkea numerona",
      }),
    ]);
  });
});

describe("resolveSceneWrite · instance choice", () => {
  it("converts a master position to the scene's own clock for the named instance", () => {
    const resolved = resolveSceneWrite(
      deps(),
      { sourceFile: TITLE },
      request({ position: 5, timeBasis: "master", instance: "title-host-b" }),
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.localPosition).toBe(1);
    expect(resolved.scene).toEqual({
      sourceFile: TITLE,
      instance: "title-host-b",
      instanceLabel: "Otsikkokortti",
      instanceIndex: 2,
      instanceCount: 2,
      affectsInstances: 2,
      timeBasis: "master",
      localPosition: 1,
      masterPosition: 5,
      playbackRate: 1,
    });
  });

  it("refuses a two-instance target with no instance, and names both", () => {
    const failure = expectFailure(
      resolveSceneWrite(deps(), { sourceFile: TITLE }, request({ position: 1 })),
    );

    expect(failure.kind).toBe("invalid");
    expect(failure.reason).toContain("2 esiintymää");
    expect(failure.hint).toContain("title-host-a (pääajassa 0,00–4,00 s)");
    expect(failure.hint).toContain("title-host-b (pääajassa 4,00–8,00 s)");
  });

  it("auto-selects the only placement and defaults a nested target to scene time", () => {
    const resolved = resolveSceneWrite(
      deps(),
      { sourceFile: PACK },
      request({ position: 1, duration: 0.5 }),
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.scene).toMatchObject({
      instance: "pack-host",
      timeBasis: "scene",
      localPosition: 1,
      masterPosition: 3,
      affectsInstances: 1,
    });
  });

  it("refuses an instance that is not a placement of this scene", () => {
    const failure = expectFailure(
      resolveSceneWrite(
        deps(),
        { sourceFile: TITLE },
        request({ position: 1, instance: "pack-host" }),
      ),
    );

    expect(failure.reason).toContain("ei ole esiintymää pack-host");
  });

  it("refuses an unsupported host with its reason instead of guessing a start", () => {
    const failure = expectFailure(
      resolveSceneWrite(
        deps([clip({ id: "broken", duration: 0 })]),
        { sourceFile: TITLE },
        request({ position: 1 }),
      ),
    );

    expect(failure.reason).toContain("kohtauksen kesto ei ratkea numerona");
    expect(failure.hint).toBe("Avaa kohtaus omalle aikajanalleen.");
  });

  it("refuses master time when the scene has no placement at all, but still writes scene time", () => {
    const empty = deps([]);

    expect(
      expectFailure(
        resolveSceneWrite(
          empty,
          { sourceFile: TITLE },
          request({ position: 1, timeBasis: "master" }),
        ),
      ).reason,
    ).toContain("ei löydy esiintymää");

    const scene = resolveSceneWrite(empty, { sourceFile: TITLE }, request({ position: 1 }));
    expect(scene.ok).toBe(true);
    if (!scene.ok) throw new Error("unreachable");
    expect(scene.scene).toBeNull();
    expect(scene.localPosition).toBeNull();
  });

  it("refuses a master position that does not fall inside the chosen placement", () => {
    const failure = expectFailure(
      resolveSceneWrite(
        deps(),
        { sourceFile: TITLE },
        request({ position: 1, timeBasis: "master", instance: "title-host-b" }),
      ),
    );

    expect(failure.reason).toContain("ei osu esiintymään title-host-b");
  });

  it("keeps the root composition on master time and its own fit check", () => {
    const rootDeps = deps(TWO_INSTANCE_MANIFEST, "index.html");
    const root = { sourceFile: "index.html" };

    const ok = resolveSceneWrite(rootDeps, root, request({ position: 1 }));
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error("unreachable");
    expect(ok.scene).toBeNull();

    expect(
      expectFailure(resolveSceneWrite(rootDeps, root, request({ position: 9.8, duration: 1 })))
        .reason,
    ).toBe("motion must fit within the composition");
    expect(
      expectFailure(resolveSceneWrite(rootDeps, root, request({ timeBasis: "scene" }))).reason,
    ).toContain("timeBasis scene koskee vain sisäkkäistä kohtausta");
    expect(
      expectFailure(resolveSceneWrite(rootDeps, root, request({ instance: "title-host-a" })))
        .reason,
    ).toContain("instance koskee vain sisäkkäistä kohtausta");
  });

  it("rejects a value outside the closed timeBasis vocabulary", () => {
    expect(
      expectFailure(resolveSceneWrite(deps(), { sourceFile: PACK }, request({ timeBasis: "clip" })))
        .reason,
    ).toContain("timeBasis on oltava master tai scene");
  });
});

describe("validateSceneFit · S5", () => {
  it("refuses a motion that ends after the host stops showing the scene", () => {
    const instance = instanceOf(
      [clip({ id: "title-host-a", start: 0, duration: 4 })],
      TITLE,
      "title-host-a",
    );

    expect(validateSceneFit(instance, 3.5, 0.5)).toBeNull();
    const failure = expectFailure(validateSceneFit(instance, 3.5, 1)!);
    expect(failure.reason).toBe("liike ei näy pääajassa (kohtaus loppuu 4,00 s)");
  });

  it("refuses the same 3,5–4,5 s motion through the write path", () => {
    const failure = expectFailure(
      resolveSceneWrite(
        deps([clip({ id: "title-host-a", start: 0, duration: 4 })]),
        { sourceFile: TITLE },
        request({ position: 3.5, duration: 1 }),
      ),
    );

    expect(failure.reason).toBe("liike ei näy pääajassa (kohtaus loppuu 4,00 s)");
  });

  it("rate 2 doubles the scene clock the same 0–4 s master window holds, halving master span", () => {
    const clips = [clip({ id: "fast-host", start: 0, duration: 4, playbackRate: 2 })];
    const instance = instanceOf(clips, TITLE, "fast-host");

    // Same host window in master seconds; twice as much scene time inside it.
    expect(instance.sceneDuration).toBe(8);
    expect(validateSceneFit(instance, 3.5, 1)).toBeNull();
    expect(expectFailure(validateSceneFit(instance, 7.5, 1)!).reason).toBe(
      "liike ei näy pääajassa (kohtaus loppuu 8,00 s)",
    );

    // A 1 s scene-local motion occupies half a second of master time.
    const resolved = resolveSceneWrite(
      deps(clips),
      { sourceFile: TITLE },
      request({ position: 3.5, duration: 1 }),
    );
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.scene?.masterPosition).toBe(1.75);
    expect(resolved.scene?.playbackRate).toBe(2);
  });

  it("playbackStart 0.5 refuses a start before the scene's first visible frame", () => {
    const clips = [clip({ id: "offset-host", start: 1, duration: 4, playbackStart: 0.5 })];
    const failure = expectFailure(
      resolveSceneWrite(
        deps(clips),
        { sourceFile: TITLE },
        request({ position: 0.3, duration: 0.2 }),
      ),
    );

    expect(failure.reason).toBe(
      "liike alkaa ennen kohtauksen näkyvää alkua (kohtaus alkaa 0,50 s)",
    );

    const ok = resolveSceneWrite(
      deps(clips),
      { sourceFile: TITLE },
      request({ position: 0.5, duration: 0.2 }),
    );
    if (!ok.ok) throw new Error("unreachable");
    expect(ok.scene?.masterPosition).toBe(1);
  });
});

describe("resolveSceneSeek", () => {
  it("converts a scene time to master time for the named instance", () => {
    const resolved = resolveSceneSeek(deps(), {
      time: 1,
      timeBasis: "scene",
      instance: "title-host-b",
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.masterTime).toBe(5);
    expect(sceneSeekReceipt(resolved.instance!, 5.033)).toEqual({
      sourceFile: TITLE,
      instance: "title-host-b",
      localPosition: 1.033,
      masterPosition: 5.033,
    });
  });

  it("requires an instance for scene time and refuses an unknown one", () => {
    expect(expectFailure(resolveSceneSeek(deps(), { time: 1, timeBasis: "scene" })).reason).toBe(
      "timeBasis scene vaatii instance-kentän",
    );
    expect(
      expectFailure(resolveSceneSeek(deps(), { time: 1, timeBasis: "scene", instance: "nope" }))
        .reason,
    ).toContain("esiintymää nope ei löydy");
  });

  it("refuses a scene time that is never on screen in that placement", () => {
    expect(
      expectFailure(
        resolveSceneSeek(deps(), { time: 9, timeBasis: "scene", instance: "title-host-b" }),
      ).reason,
    ).toContain("ei näy esiintymässä title-host-b");
  });

  it("passes master time through untouched and still names the instance", () => {
    const resolved = resolveSceneSeek(deps(), { time: 6, instance: "title-host-b" });
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.masterTime).toBe(6);
    expect(resolved.instance?.hostId).toBe("title-host-b");
  });
});

describe("findSceneInstance", () => {
  it("finds a placement by host id across every scene file in the manifest", () => {
    expect(findSceneInstance(deps(), "pack-host")?.sourceFile).toBe(PACK);
    expect(findSceneInstance(deps(), "title-host-a")?.sourceFile).toBe(TITLE);
    expect(findSceneInstance(deps(), "missing")).toBeNull();
  });
});

describe("sceneInstanceChoice", () => {
  it("stores one choice per normalised source file and notifies subscribers", () => {
    sceneInstanceChoice.reset();
    let notified = 0;
    const unsubscribe = sceneInstanceChoice.subscribe(() => {
      notified += 1;
    });

    sceneInstanceChoice.choose(TITLE, "title-host-b");
    expect(sceneInstanceChoice.forSource(`/preview/comp/${TITLE}`)).toBe("title-host-b");
    expect(notified).toBe(1);

    sceneInstanceChoice.choose(TITLE, null);
    expect(sceneInstanceChoice.forSource(TITLE)).toBeNull();
    unsubscribe();
    sceneInstanceChoice.reset();
  });
});
