// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntimeStartTimeResolver } from "@hyperframes/core/runtime/start-resolver";
import { readElementPlaybackRate, readMediaStart } from "@hyperframes/core";
import {
  localToMaster,
  masterToLocal,
  resolveSceneInstances,
  type SceneInstance,
  type SceneTimeManifest,
  type SceneTimeManifestClip,
} from "./sceneTime";

// Vitest runs with `packages/studio` as its root, so fixture and sibling-package
// paths resolve from the cwd (`import.meta.url` is an http URL under Vite).
const FIXTURE_DIR = resolve(process.cwd(), "tests/e2e/fixtures/composition-reliability");
const RUNTIME_INIT_PATH = resolve(process.cwd(), "../core/src/runtime/init.ts");
const TITLE_CARD = "compositions/title-card.html";

function clip(overrides: Partial<SceneTimeManifestClip>): SceneTimeManifestClip {
  return {
    id: "host",
    label: "Host",
    start: 0,
    duration: 4,
    kind: "composition",
    compositionId: "scene",
    parentCompositionId: null,
    compositionSrc: TITLE_CARD,
    compositionAncestors: ["root"],
    playbackStart: 0,
    playbackRate: 1,
    ...overrides,
  };
}

function only(manifest: SceneTimeManifest, source = TITLE_CARD): SceneInstance {
  const resolution = resolveSceneInstances(manifest, source);
  expect(resolution.unsupported).toEqual([]);
  expect(resolution.instances).toHaveLength(1);
  return resolution.instances[0]!;
}

function pick(manifest: SceneTimeManifest, hostId: string, source = TITLE_CARD): SceneInstance {
  const resolution = resolveSceneInstances(manifest, source);
  expect(resolution.unsupported).toEqual([]);
  const found = resolution.instances.find((instance) => instance.hostId === hostId);
  if (!found) throw new Error(`no instance ${hostId}`);
  return found;
}

describe("resolveSceneInstances · single level", () => {
  it("start 4, rate 1 maps master to scene-local by subtracting the host start", () => {
    const instance = only({ clips: [clip({ id: "title-host-b", start: 4, duration: 4 })] });

    expect(instance.hostId).toBe("title-host-b");
    expect(instance.start).toBe(4);
    expect(instance.duration).toBe(4);
    expect(instance.playbackRate).toBe(1);
    expect(instance.sceneDuration).toBe(4);

    expect(masterToLocal(instance, 4)).toBe(0);
    expect(masterToLocal(instance, 5)).toBe(1);
    expect(masterToLocal(instance, 8)).toBe(4);
    // Before the window the runtime parks the child timeline on its first frame.
    expect(masterToLocal(instance, 0)).toBe(0);
    // Past the window the clamp holds the last frame.
    expect(masterToLocal(instance, 12)).toBe(4);

    expect(localToMaster(instance, 0)).toBe(4);
    expect(localToMaster(instance, 1)).toBe(5);
    expect(localToMaster(instance, 4)).toBe(8);
  });

  it("start 1 with playbackStart 0.5 offsets the scene clock, not the master clock", () => {
    const instance = only({
      clips: [clip({ id: "offset-host", start: 1, duration: 4, playbackStart: 0.5 })],
    });

    expect(instance.start).toBe(1);
    expect(instance.playbackStart).toBe(0.5);
    expect(instance.sceneDuration).toBe(4.5);

    expect(masterToLocal(instance, 1)).toBe(0.5);
    expect(masterToLocal(instance, 3)).toBe(2.5);
    expect(masterToLocal(instance, 5)).toBe(4.5);

    // Local time before playbackStart is never reached in this instance.
    expect(localToMaster(instance, 0)).toBeNull();
    expect(localToMaster(instance, 0.5)).toBe(1);
    expect(localToMaster(instance, 2.5)).toBe(3);
  });

  it("rate 1.5 runs the scene clock faster and shortens the reachable window", () => {
    const instance = only({
      clips: [clip({ id: "fast-host", start: 2, duration: 4, playbackRate: 1.5 })],
    });

    expect(instance.playbackRate).toBe(1.5);
    expect(instance.sceneDuration).toBe(6);

    expect(masterToLocal(instance, 2)).toBe(0);
    expect(masterToLocal(instance, 4)).toBe(3);
    expect(masterToLocal(instance, 6)).toBe(6);

    expect(localToMaster(instance, 3)).toBe(4);
    expect(localToMaster(instance, 6)).toBe(6);
    // 7 s of scene time never plays: the host window ends at 6 s of scene time.
    expect(localToMaster(instance, 7)).toBeNull();
  });
});

describe("resolveSceneInstances · repeated and nested sources", () => {
  it("returns one instance per placement of the same source file", () => {
    const resolution = resolveSceneInstances(
      {
        clips: [
          clip({ id: "title-host-a", compositionId: "title-card-a", start: 0, duration: 4 }),
          clip({ id: "title-host-b", compositionId: "title-card-b", start: 4, duration: 4 }),
          clip({
            id: "collision-a",
            compositionId: null,
            compositionSrc: null,
            kind: "element",
            start: 1,
            duration: 2,
          }),
        ],
      },
      TITLE_CARD,
    );

    expect(resolution.instances.map((i) => i.hostId)).toEqual(["title-host-a", "title-host-b"]);
    expect(resolution.instances.map((i) => i.start)).toEqual([0, 4]);
    expect(masterToLocal(resolution.instances[0]!, 5)).toBe(4); // clamped at its own end
    expect(masterToLocal(resolution.instances[1]!, 5)).toBe(1);
  });

  it("chains two nesting levels through compositionAncestors", () => {
    // The fixture places title-card.html three times: twice at the root and once
    // two levels deep inside nested-shell.html.
    const clips = fixtureManifestClips();
    expect(resolveSceneInstances({ clips }, TITLE_CARD).instances).toHaveLength(3);
    const instance = pick({ clips }, "nested-title-host");
    // nested-host starts at master 2 s, and the title card starts 1 s into it.
    expect(instance.hostId).toBe("nested-title-host");
    expect(instance.ancestors.map((a) => a.compositionId)).toEqual(["nested-shell-host"]);
    expect(instance.start).toBe(3);
    expect(instance.visibleEnd).toBe(7);
    expect(instance.duration).toBe(4);

    expect(masterToLocal(instance, 5)).toBe(2);
    expect(localToMaster(instance, 2)).toBe(5);
    // The host duration clamps: the scene never plays past 4 s of its own clock.
    expect(masterToLocal(instance, 9)).toBe(4);
    expect(localToMaster(instance, 4)).toBe(7);
  });

  it("multiplies the playback rate of every level in the chain", () => {
    const instance = only({
      clips: [
        clip({
          id: "shell-host",
          compositionId: "shell",
          compositionSrc: "compositions/nested-shell.html",
          start: 2,
          duration: 6,
          playbackRate: 2,
          compositionAncestors: ["root"],
        }),
        clip({
          id: "inner-host",
          compositionId: "inner",
          start: 3,
          duration: 4,
          playbackRate: 1.5,
          compositionAncestors: ["root", "shell"],
        }),
      ],
    });

    expect(instance.playbackRate).toBe(3);
    // The inner host is authored 1 s into a shell running at 2x, so it opens
    // half a master second after the shell does.
    expect(instance.start).toBe(2.5);
    expect(masterToLocal(instance, 3.5)).toBe(3);
    expect(localToMaster(instance, 3)).toBe(3.5);
  });

  it("round-trips master -> local -> master across the window", () => {
    const instance = pick({ clips: fixtureManifestClips() }, "nested-title-host");
    for (const master of [3, 3.25, 4, 5.5, 6.75, 7]) {
      const local = masterToLocal(instance, master);
      expect(localToMaster(instance, local)).toBeCloseTo(master, 9);
    }
  });

  it("refuses a local time outside the host window", () => {
    const instance = pick({ clips: fixtureManifestClips() }, "nested-title-host");
    expect(localToMaster(instance, -0.5)).toBeNull();
    expect(localToMaster(instance, 4.5)).toBeNull();
    expect(localToMaster(instance, Number.NaN)).toBeNull();
  });
});

describe("resolveSceneInstances · refusals", () => {
  it("reports an unresolvable host start instead of defaulting it to 0", () => {
    const resolution = resolveSceneInstances(
      { clips: [clip({ id: "broken-host", start: Number.NaN })] },
      TITLE_CARD,
    );
    expect(resolution.instances).toEqual([]);
    expect(resolution.unsupported).toEqual([
      {
        hostId: "broken-host",
        hostLabel: "Host",
        compositionId: "scene",
        sourceFile: TITLE_CARD,
        reason: "unresolved-host-start",
        atCompositionId: "scene",
      },
    ]);
  });

  it("refuses at the ancestor level that cannot be resolved", () => {
    const resolution = resolveSceneInstances(
      {
        clips: [
          clip({
            id: "shell-host",
            compositionId: "shell",
            compositionSrc: "compositions/nested-shell.html",
            start: 2,
            duration: 6,
            playbackRate: 0,
            compositionAncestors: ["root"],
          }),
          clip({
            id: "inner-host",
            compositionId: "inner",
            start: 3,
            compositionAncestors: ["root", "shell"],
          }),
        ],
      },
      TITLE_CARD,
    );
    expect(resolution.instances).toEqual([]);
    expect(resolution.unsupported[0]).toMatchObject({
      hostId: "inner-host",
      reason: "unresolved-playback-rate",
      atCompositionId: "shell",
    });
  });

  it("returns nothing for a source file that is not placed anywhere", () => {
    expect(
      resolveSceneInstances({ clips: fixtureManifestClips() }, "compositions/nope.html"),
    ).toEqual({ instances: [], unsupported: [] });
  });
});

// ── Runtime parity ───────────────────────────────────────────────────────────
//
// `seekStandaloneRegisteredTimelines` is a closure inside
// `initSandboxRuntimeModular` and is not exported (nor is init.ts reachable as a
// package subpath), so this cannot call that function directly. It calls the
// three exported runtime primitives the function is built from —
// `createRuntimeStartTimeResolver` (init.ts:660 delegates `resolveStartForElement`
// to it), `readMediaStart` (= `readElementPlaybackStart`) and
// `readElementPlaybackRate` — over the real composition-reliability fixture DOM,
// and re-states the four-line formula. The source-text assertion below pins that
// formula so the restatement cannot drift silently.

const ROOT_COMPOSITION_ID = "composition-reliability";

interface FixtureHost {
  readonly hostId: string;
  readonly compositionId: string;
  readonly compositionSrc: string;
  readonly ancestors: readonly string[];
}

function readTemplateBody(path: string): string {
  const html = readFileSync(resolve(FIXTURE_DIR, path), "utf8");
  const match = html.match(/<template[^>]*>([\s\S]*)<\/template>/);
  if (!match) throw new Error(`no <template> in ${path}`);
  const inner = match[1]!;
  const root = inner.match(/<section[^>]*>([\s\S]*)<\/section>/);
  return root ? root[1]! : inner;
}

/**
 * Assemble the fixture the way the loader does, with one simplification that
 * makes the DOM unambiguous: the scene root's CONTENT is placed into the host,
 * so each composition id appears exactly once and the host element carries the
 * timing, which is what `resolveStartForElement` reads.
 */
function assembleFixture(): void {
  const index = readFileSync(resolve(FIXTURE_DIR, "index.html"), "utf8");
  const main = index.match(/<main[\s\S]*<\/main>/);
  if (!main) throw new Error("no <main> in fixture index.html");
  document.body.innerHTML = main[0];

  let guard = 0;
  for (;;) {
    const host = document.querySelector<HTMLElement>(
      "[data-composition-src]:not([data-hf-inlined])",
    );
    if (!host) break;
    if ((guard += 1) > 16) throw new Error("composition inlining did not settle");
    const src = host.getAttribute("data-composition-src") ?? "";
    const baseDir = host.getAttribute("data-hf-base-dir") ?? "";
    const path = src.includes("/") ? src : `${baseDir}${src}`;
    host.innerHTML = readTemplateBody(path);
    host.setAttribute("data-hf-inlined", "1");
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    for (const child of Array.from(host.querySelectorAll("[data-composition-src]"))) {
      child.setAttribute("data-hf-base-dir", dir);
    }
  }
}

function fixtureHosts(): FixtureHost[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-composition-src]")).map(
    (host) => {
      const ancestors: string[] = [];
      let cursor = host.parentElement;
      while (cursor) {
        const id = cursor.getAttribute("data-composition-id");
        if (id) ancestors.push(id);
        cursor = cursor.parentElement;
      }
      const baseDir = host.getAttribute("data-hf-base-dir") ?? "";
      const src = host.getAttribute("data-composition-src") ?? "";
      return {
        hostId: host.getAttribute("data-hf-id") ?? host.id,
        compositionId: host.getAttribute("data-composition-id") ?? "",
        compositionSrc: src.includes("/") ? src : `${baseDir}${src}`,
        ancestors: ancestors.reverse(),
      };
    },
  );
}

/** Child timeline durations, as `window.__timelines` would carry them. */
const TIMELINE_DURATIONS: Record<string, number> = {
  "title-card-a": 4,
  "title-card-b": 4,
  "nested-shell-host": 6,
  "nested-title-card": 4,
};

function runtimeStartResolver() {
  return createRuntimeStartTimeResolver({
    timelineRegistry: Object.fromEntries(
      Object.entries(TIMELINE_DURATIONS).map(([id, duration]) => [
        id,
        { duration: () => duration } as never,
      ]),
    ),
    documentRef: document,
  });
}

/** The body of `seekStandaloneRegisteredTimelines` (init.ts:2845-2865). */
function runtimeSeek(masterSeconds: number): Record<string, number> {
  const resolver = runtimeStartResolver();
  const out: Record<string, number> = {};
  for (const [compositionId, timelineDuration] of Object.entries(TIMELINE_DURATIONS)) {
    if (compositionId === ROOT_COMPOSITION_ID) continue;
    const node = document.querySelector(`[data-composition-id="${CSS.escape(compositionId)}"]`);
    if (!node) continue;
    const start = resolver.resolveStartForElement(node, 0);
    if (!Number.isFinite(start)) continue;
    const sourceTime =
      readMediaStart(node) + Math.max(0, masterSeconds - start) * readElementPlaybackRate(node);
    out[compositionId] = Math.max(
      0,
      timelineDuration > 0 ? Math.min(timelineDuration, sourceTime) : sourceTime,
    );
  }
  return out;
}

/** The manifest the player publishes for the assembled fixture. */
function fixtureManifestClips(): SceneTimeManifestClip[] {
  assembleFixture();
  const resolver = runtimeStartResolver();
  return fixtureHosts().map((host) => {
    const node = document.querySelector(
      `[data-composition-id="${CSS.escape(host.compositionId)}"]`,
    ) as HTMLElement;
    return {
      id: host.hostId,
      label: host.hostId,
      start: resolver.resolveStartForElement(node, 0),
      duration: Number(node.getAttribute("data-duration")),
      kind: "composition",
      compositionId: host.compositionId,
      parentCompositionId: host.ancestors.at(-1) ?? null,
      compositionSrc: host.compositionSrc,
      compositionAncestors: host.ancestors,
      playbackStart: readMediaStart(node),
      playbackRate: readElementPlaybackRate(node),
    };
  });
}

describe("sceneTime · runtime parity", () => {
  it("matches the runtime seek for every title-card instance", () => {
    const clips = fixtureManifestClips();
    expect(clips.map((c) => c.compositionId)).toEqual([
      "title-card-a",
      "title-card-b",
      "nested-shell-host",
      "nested-title-card",
    ]);

    const { instances, unsupported } = resolveSceneInstances({ clips }, TITLE_CARD);
    expect(unsupported).toEqual([]);
    expect(instances.map((i) => i.hostId)).toEqual([
      "title-host-a",
      "nested-title-host",
      "title-host-b",
    ]);

    for (const master of [0, 1, 2, 3, 4, 5, 6, 7, 8, 11]) {
      const runtime = runtimeSeek(master);
      for (const instance of instances) {
        expect(masterToLocal(instance, master)).toBeCloseTo(runtime[instance.compositionId!]!, 9);
      }
    }
  });

  it("pins the runtime formula it restates", () => {
    const source = readFileSync(RUNTIME_INIT_PATH, "utf8");
    expect(source).toContain("const seekStandaloneRegisteredTimelines = (");
    expect(source).toMatch(
      /readElementPlaybackStart\(node\)\s*\+\s*Math\.max\(0,\s*timeSeconds\s*-\s*start\)\s*\*\s*readElementPlaybackRate\(node\)/,
    );
    expect(source).toMatch(/Math\.min\(timelineDuration,\s*sourceTime\)/);
  });
});
