import { TITLE_SCENE, PACK_SCENE, SCENE_MANIFEST } from "./sceneTestFixture";
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  studioSeek,
  studioSelect,
  type SelectionToolDeps,
  type StudioSeekResult,
  type StudioSelectResult,
} from "./selectionTools";
import { sceneInstanceChoice } from "./animationScene";
import {
  expectFailure,
  expectOk,
  previewDoc,
  selectionFor,
  selectionToolDeps,
  sourceHandle,
} from "../webmcpTestUtils";

function selectionDeps(overrides: Partial<SelectionToolDeps> = {}): SelectionToolDeps {
  return selectionToolDeps(overrides);
}

describe("studioSelect", () => {
  it("refuses a scoped handle from another project before selecting", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');
    const applySelection = vi.fn();

    const result = await studioSelect(
      selectionDeps({ getPreviewDocument: () => doc, applySelection }),
      sourceHandle("headline", "project-b"),
    );

    expect(result).toMatchObject({
      ok: false,
      kind: "invalid",
      reason: "the handle belongs to a different project",
    });
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("applies the selection a click would produce and reports it back", async () => {
    const doc = previewDoc('<h1 id="headline" data-hf-id="abc">Ship it</h1>');
    const applySelection = vi.fn();

    const result = await studioSelect(
      selectionDeps({ getPreviewDocument: () => doc, applySelection }),
      "hf:abc",
    );

    const ok = expectOk<StudioSelectResult>(result);
    expect(ok.handle).toBe("hf:abc");
    expect(ok.label).toBe("Headline");
    expect(ok.box.width).toBe(880);
    // Reveals the inspector, which is what makes the human see what the agent did.
    expect(applySelection).toHaveBeenCalledTimes(1);
  });

  it("returns the exact source-safe handle it resolved", async () => {
    const doc = previewDoc(
      '<main data-composition-id="root" data-composition-file="index.html"><h1 id="headline">Ship it</h1></main>',
    );
    const handle = "dom:v1:index.html:index.html:headline";

    const ok = expectOk<StudioSelectResult>(
      await studioSelect(selectionDeps({ getPreviewDocument: () => doc }), handle),
    );

    expect(ok.handle).toBe(handle);
  });

  it("reacquires once when the preview document reloads during selection resolution", async () => {
    const firstDoc = previewDoc('<h1 data-hf-id="abc">Old preview</h1>');
    const nextDoc = previewDoc('<h1 data-hf-id="abc">Current preview</h1>');
    let currentDoc = firstDoc;
    const buildSelection = vi.fn(async (element: HTMLElement) => {
      if (element.ownerDocument === firstDoc) {
        currentDoc = nextDoc;
        return selectionFor(element, { boundingBox: { x: 0, y: 0, width: 0, height: 0 } });
      }
      return selectionFor(element, {
        boundingBox: { x: 98, y: 206, width: 304, height: 50 },
      });
    });
    const applySelection = vi.fn();

    const ok = expectOk<StudioSelectResult>(
      await studioSelect(
        selectionDeps({
          getPreviewDocument: () => currentDoc,
          buildSelection,
          applySelection,
        }),
        "hf:abc",
      ),
    );

    expect(ok.box).toEqual({ x: 98, y: 206, width: 304, height: 50 });
    expect(buildSelection).toHaveBeenCalledTimes(2);
    expect(applySelection).toHaveBeenCalledWith(
      expect.objectContaining({ element: nextDoc.querySelector("h1") }),
    );
  });

  it("refuses when the preview changes again during the bounded reacquire", async () => {
    const documents = [
      previewDoc('<h1 data-hf-id="abc">First preview</h1>'),
      previewDoc('<h1 data-hf-id="abc">Second preview</h1>'),
      previewDoc('<h1 data-hf-id="abc">Third preview</h1>'),
    ];
    let currentIndex = 0;
    const buildSelection = vi.fn(async (element: HTMLElement) => {
      currentIndex += 1;
      return selectionFor(element);
    });
    const applySelection = vi.fn();

    const failure = expectFailure(
      await studioSelect(
        selectionDeps({
          getPreviewDocument: () => documents[currentIndex] ?? documents.at(-1)!,
          buildSelection,
          applySelection,
        }),
        "hf:abc",
      ),
    );

    expect(failure).toMatchObject({
      kind: "invalid",
      reason: "the target changed while it was resolving",
      hint: "Call studio_look again.",
    });
    expect(buildSelection).toHaveBeenCalledTimes(2);
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("distinguishes a preview that is not mounted from a handle that does not match", async () => {
    const notMounted = expectFailure(await studioSelect(selectionDeps(), "dom:headline"));
    expect(notMounted.kind).toBe("blocked");
    expect(notMounted.reason).toMatch(/not mounted/);

    const doc = previewDoc('<h1 id="headline">Ship it</h1>');
    const noMatch = expectFailure(
      await studioSelect(selectionDeps({ getPreviewDocument: () => doc }), "dom:missing"),
    );
    expect(noMatch.kind).toBe("invalid");
    expect(noMatch.reason).toMatch(/no element matches/);
    // The two must not be the same message: waiting and re-reading are different fixes.
    expect(noMatch.reason).not.toBe(notMounted.reason);
  });

  it("reports an element Studio cannot build a selection for, as a third case", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');

    const result = expectFailure(
      await studioSelect(
        selectionDeps({ getPreviewDocument: () => doc, buildSelection: async () => null }),
        "dom:headline",
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/cannot select/);
  });

  it("rejects a missing handle without touching the preview", async () => {
    const getPreviewDocument = vi.fn(() => null);

    const result = expectFailure(await studioSelect(selectionDeps({ getPreviewDocument }), "  "));

    expect(result.kind).toBe("invalid");
    expect(getPreviewDocument).not.toHaveBeenCalled();
  });

  it("leaves the existing selection alone when it fails", async () => {
    const doc = previewDoc('<h1 id="headline">Ship it</h1>');
    const applySelection = vi.fn();

    await studioSelect(
      selectionDeps({ getPreviewDocument: () => doc, applySelection }),
      "dom:missing",
    );

    expect(applySelection).not.toHaveBeenCalled();
  });
});

describe("studioSeek", () => {
  it("reports where the playhead landed, not what was requested", () => {
    // The player clamps against the ADAPTER's duration, which the wrapper
    // deliberately does not second-guess.
    let currentTime = 0;
    const result = studioSeek(
      selectionDeps({
        requestSeek: () => {
          currentTime = 10;
        },
        readPlayhead: () => ({ currentTime, duration: 10, isPlaying: false }),
      }),
      999,
    );

    const ok = expectOk<StudioSeekResult>(result);
    expect(ok.playhead).toBe(10);
    expect(ok.moved).toBe(true);
  });

  it("reports that playback stopped", () => {
    let isPlaying = true;
    let currentTime = 0;
    const result = studioSeek(
      selectionDeps({
        requestSeek: () => {
          currentTime = 2;
          isPlaying = false;
        },
        readPlayhead: () => ({ currentTime, duration: 10, isPlaying }),
      }),
      2,
    );

    expect(expectOk<StudioSeekResult>(result).isPlaying).toBe(false);
  });

  it("fails rather than claiming a seek the player never received", () => {
    // `requestSeek` is fire-and-forget: with no adapter mounted it silently does
    // nothing, and reporting ok would be a lie the agent builds on.
    const result = expectFailure(
      studioSeek(
        selectionDeps({ readPlayhead: () => ({ currentTime: 0, duration: 10, isPlaying: false }) }),
        5,
      ),
    );

    expect(result.kind).toBe("blocked");
    expect(result.reason).toMatch(/did not move/);
  });

  it("succeeds when asked to seek to where the playhead already is", () => {
    const result = studioSeek(
      selectionDeps({ readPlayhead: () => ({ currentTime: 3, duration: 10, isPlaying: false }) }),
      3,
    );

    // Nothing moved, but nothing failed either, and `moved` says which.
    const ok = expectOk<StudioSeekResult>(result);
    expect(ok.moved).toBe(false);
    expect(ok.playhead).toBe(3);
  });

  it("rejects a non-finite time without calling the player", () => {
    const requestSeek = vi.fn();

    for (const time of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = expectFailure(studioSeek(selectionDeps({ requestSeek }), time));
      expect(result.kind).toBe("invalid");
    }
    expect(requestSeek).not.toHaveBeenCalled();
  });
});

/** Sprint S2/S4: which placement of a shared scene, and which clock. */
function sceneSelectionDeps(
  sourceFile: string,
  overrides: Partial<SelectionToolDeps> = {},
): { doc: Document; deps: SelectionToolDeps } {
  const hosts = sourceFile === TITLE_SCENE ? ["title-host-a", "title-host-b"] : ["pack-host"];
  const doc = previewDoc(
    hosts
      .map(
        (id) =>
          `<div id="${id}" data-hf-id="${id}" data-composition-src="${sourceFile}"><h1 id="headline" data-hf-id="abc">Ship it</h1></div>`,
      )
      .join(""),
  );
  return {
    doc,
    deps: selectionDeps({
      getPreviewDocument: () => doc,
      getClipManifest: () => SCENE_MANIFEST,
      getCompositionPath: () => "index.html",
      buildSelection: async (element) => selectionFor(element, { sourceFile }),
      ...overrides,
    }),
  };
}

describe("studioSelect · scene instances", () => {
  it("discards a remembered placement removed by a structural edit", async () => {
    sceneInstanceChoice.reset();
    sceneInstanceChoice.choose(PACK_SCENE, "deleted-host");
    const { deps } = sceneSelectionDeps(PACK_SCENE);
    const result = expectOk<StudioSelectResult>(await studioSelect(deps, "hf:abc"));
    expect(result.scene?.instance).toBe("pack-host");
    sceneInstanceChoice.reset();
  });
  it("lists every placement of a shared scene and chooses none of them", async () => {
    sceneInstanceChoice.reset();
    const { deps } = sceneSelectionDeps(TITLE_SCENE);

    const ok = expectOk<StudioSelectResult>(await studioSelect(deps, "hf:abc"));

    expect(ok.scene?.affectsInstances).toBe(2);
    expect(ok.scene?.instance).toBeNull();
    expect(ok.scene?.instances.map((instance) => instance.hostId)).toEqual([
      "title-host-a",
      "title-host-b",
    ]);
    expect(ok.scene?.instances[1]).toMatchObject({ masterStart: 4, masterEnd: 8 });
  });

  it("remembers an explicit instance and auto-selects a single placement", async () => {
    sceneInstanceChoice.reset();
    const applySelection = vi.fn();
    const shared = sceneSelectionDeps(TITLE_SCENE, { applySelection });

    const chosen = expectOk<StudioSelectResult>(
      await studioSelect(shared.deps, "hf:abc", "title-host-b"),
    );
    expect(chosen.scene?.instance).toBe("title-host-b");
    expect(applySelection.mock.calls[0][0].element.parentElement.id).toBe("title-host-b");
    expect(applySelection.mock.calls[0][0].instanceId).toBe("title-host-b");
    expect(sceneInstanceChoice.forSource(TITLE_SCENE)).toBe("title-host-b");

    const single = sceneSelectionDeps(PACK_SCENE);
    const only = expectOk<StudioSelectResult>(await studioSelect(single.deps, "hf:abc"));
    expect(only.scene?.instance).toBe("pack-host");
    sceneInstanceChoice.reset();
  });

  it("refuses an instance that is not a placement of the selected scene", async () => {
    sceneInstanceChoice.reset();
    const { deps } = sceneSelectionDeps(TITLE_SCENE);
    const applySelection = vi.fn();

    const failure = expectFailure(
      await studioSelect(
        selectionDeps({
          getPreviewDocument: () => deps.getPreviewDocument(),
          getClipManifest: () => SCENE_MANIFEST,
          getCompositionPath: () => "index.html",
          buildSelection: async (element) => selectionFor(element, { sourceFile: TITLE_SCENE }),
          applySelection,
        }),
        "hf:abc",
        "pack-host",
      ),
    );

    expect(failure.reason).toContain("ei ole esiintymää pack-host");
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("refuses an instance on a root-composition selection", async () => {
    const doc = previewDoc('<h1 id="headline" data-hf-id="abc">Ship it</h1>');
    const failure = expectFailure(
      await studioSelect(
        selectionDeps({ getPreviewDocument: () => doc, getClipManifest: () => SCENE_MANIFEST }),
        "hf:abc",
        "title-host-a",
      ),
    );

    expect(failure.reason).toBe("instance koskee vain sisäkkäistä kohtausta");
  });
});

describe("studioSeek · both time bases", () => {
  const seekDeps = (currentTimeRef: { value: number }) =>
    selectionDeps({
      getClipManifest: () => SCENE_MANIFEST,
      getCompositionPath: () => "index.html",
      requestSeek: (time) => {
        // The player rounds to a frame in MASTER time, which is exactly why the
        // receipt reports both clocks instead of echoing the request.
        currentTimeRef.value = Math.round(time * 30) / 30;
      },
      readPlayhead: () => ({ currentTime: currentTimeRef.value, duration: 10, isPlaying: false }),
    });

  it("moves master time to 5 s for scene time 1 s in the second placement", () => {
    const currentTime = { value: 0 };

    const ok = expectOk<StudioSeekResult>(
      studioSeek(seekDeps(currentTime), {
        time: 1,
        timeBasis: "scene",
        instance: "title-host-b",
      }),
    );

    expect(ok.playhead).toBe(5);
    expect(ok.scene).toEqual({
      sourceFile: TITLE_SCENE,
      instance: "title-host-b",
      localPosition: 1,
      masterPosition: 5,
    });
  });

  it("shows the frame-rounded difference between the two clocks", () => {
    const currentTime = { value: 0 };

    const ok = expectOk<StudioSeekResult>(
      studioSeek(seekDeps(currentTime), {
        time: 1.01,
        timeBasis: "scene",
        instance: "title-host-b",
      }),
    );

    // 5.01 s master rounds to the nearest 30 fps frame; the scene clock follows.
    expect(ok.scene?.masterPosition).toBe(5);
    expect(ok.scene?.localPosition).toBe(1);
  });

  it("refuses scene time without an instance, and an unknown instance", () => {
    const currentTime = { value: 0 };
    expect(
      expectFailure(studioSeek(seekDeps(currentTime), { time: 1, timeBasis: "scene" })).reason,
    ).toBe("timeBasis scene vaatii instance-kentän");
    expect(
      expectFailure(
        studioSeek(seekDeps(currentTime), { time: 1, timeBasis: "scene", instance: "nope" }),
      ).reason,
    ).toContain("esiintymää nope ei löydy");
  });

  it("still accepts a bare master time as a number", () => {
    const currentTime = { value: 0 };
    const ok = expectOk<StudioSeekResult>(studioSeek(seekDeps(currentTime), 2));
    expect(ok.playhead).toBe(2);
    expect(ok.scene).toBeUndefined();
  });
});
