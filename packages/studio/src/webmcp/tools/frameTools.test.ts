// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { studioFrame, type FrameToolDeps, type StudioFrameResult } from "./frameTools";
import { expectFailure, expectOk } from "../webmcpTestUtils";

function frameDeps(overrides: Partial<FrameToolDeps> = {}): FrameToolDeps {
  return {
    getProjectId: () => "demo",
    getCompositionPath: () => "index.html",
    readPlayhead: () => ({ currentTime: 2.4, duration: 10, isPlaying: false }),
    requestSeek: () => undefined,
    probeFrame: async () => ({ ok: true, status: 200 }),
    wait: async () => undefined,
    getCurrentSelection: () => null,
    ...overrides,
  };
}

describe("studioFrame", () => {
  it("binds the returned image URL to the revision actually captured", async () => {
    const result = expectOk<StudioFrameResult>(
      await studioFrame(
        frameDeps({
          probeFrame: async () => ({ ok: true, status: 200, sourceRevision: "abc123" }),
        }),
      ),
    );
    expect(result.sourceRevision).toBe("abc123");
    expect(new URL(result.url).searchParams.get("revision")).toBe("abc123");
  });
  it("returns a URL for the composition at the playhead", async () => {
    const result = await studioFrame(frameDeps());

    const ok = expectOk<StudioFrameResult>(result);
    expect(ok.time).toBe(2.4);
    expect(ok.compositionPath).toBe("index.html");
    expect(ok.url).toContain("/thumbnail/");
    expect(ok.url).toContain("t=2.400");
    expect(ok.url).toContain("format=png");
  });

  it("seeks first when given a time", async () => {
    const requestSeek = vi.fn();

    await studioFrame(frameDeps({ requestSeek }), { time: 5 });

    expect(requestSeek).toHaveBeenCalledWith(5);
  });

  it("captures where the playhead LANDED, not what was asked for", async () => {
    // The player clamps. Reporting the request would attach the wrong time to
    // the frame, and an agent judging motion would draw the wrong conclusion.
    const result = await studioFrame(
      frameDeps({ readPlayhead: () => ({ currentTime: 10, duration: 10, isPlaying: false }) }),
      { time: 999 },
    );

    const ok = expectOk<StudioFrameResult>(result);
    expect(ok.time).toBe(10);
    expect(ok.url).toContain("t=10.000");
  });

  it("waits before capturing, so a just-made edit is in the frame", async () => {
    // The render cache is cleared by a file watcher with a write-stability
    // threshold. Capturing faster than that renders the PRE-edit composition.
    const wait = vi.fn(async () => undefined);
    const order: string[] = [];

    await studioFrame(
      frameDeps({
        wait: async (ms) => {
          order.push(`wait:${ms}`);
          await wait();
        },
        probeFrame: async () => {
          order.push("probe");
          return { ok: true, status: 200 };
        },
      }),
    );

    expect(order).toEqual(["wait:150", "probe"]);
  });

  it("honours a caller-supplied settle time and reports it", async () => {
    const result = await studioFrame(frameDeps(), { settleMs: 800 });

    expect(expectOk<StudioFrameResult>(result).settledMs).toBe(800);
  });

  it("clamps an absurd settle time rather than hanging", async () => {
    const result = await studioFrame(frameDeps(), { settleMs: 10 * 60 * 1000 });

    expect(expectOk<StudioFrameResult>(result).settledMs).toBe(5000);
  });

  it("falls back to the default for a nonsense settle time", async () => {
    for (const settleMs of [-1, Number.NaN]) {
      const result = await studioFrame(frameDeps(), { settleMs });
      expect(expectOk<StudioFrameResult>(result).settledMs).toBe(150);
    }
  });

  it("skips the wait entirely when asked for zero", async () => {
    const wait = vi.fn(async () => undefined);

    await studioFrame(frameDeps({ wait }), { settleMs: 0 });

    expect(wait).not.toHaveBeenCalled();
  });

  it("reports a renderer failure instead of handing back a dead URL", async () => {
    const result = expectFailure(
      await studioFrame(frameDeps({ probeFrame: async () => ({ ok: false, status: 500 }) })),
    );

    expect(result.kind).toBe("failed");
    expect(result.reason).toContain("500");
    expect(result.hint).toBeDefined();
  });

  it("fails when no project is open, before touching the renderer", async () => {
    const probeFrame = vi.fn();

    const result = expectFailure(
      await studioFrame(frameDeps({ getProjectId: () => null, probeFrame })),
    );

    expect(result.kind).toBe("blocked");
    expect(probeFrame).not.toHaveBeenCalled();
  });

  it("rejects a negative or non-finite time without seeking", async () => {
    const requestSeek = vi.fn();

    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = expectFailure(await studioFrame(frameDeps({ requestSeek }), { time }));
      expect(result.kind).toBe("invalid");
    }
    expect(requestSeek).not.toHaveBeenCalled();
  });

  it("captures the master composition when no path is active", async () => {
    const result = await studioFrame(frameDeps({ getCompositionPath: () => null }));

    expect(expectOk<StudioFrameResult>(result).compositionPath).toBe("index.html");
  });
});

/** Deps whose playhead follows the seeks, so a sampled capture reports the
 * instants it actually landed on rather than one frozen number. */
function sampleDeps(
  animations: readonly { id: string; position?: unknown; duration?: unknown }[],
  overrides: Partial<FrameToolDeps> = {},
): FrameToolDeps {
  let currentTime = 0;
  return frameDeps({
    requestSeek: (time) => {
      currentTime = time;
    },
    readPlayhead: () => ({ currentTime, duration: 10, isPlaying: false }),
    getCurrentSelection: () => ({ sourceFile: "index.html" }) as never,
    readAnimationSource: async () =>
      ({ sourceFile: "index.html", version: "v1", animations }) as never,
    probeFrame: async () => ({ ok: true, status: 200, sourceRevision: "rev-1" }),
    ...overrides,
  });
}

describe("studioFrame samples", () => {
  const tween = [{ id: "a1", position: 2, duration: 0.8 }];

  it("captures one revision-bound PNG per fraction of the animation's own span", async () => {
    const result = expectOk<StudioFrameResult>(
      await studioFrame(sampleDeps(tween), { animationId: "a1", samples: [0.25, 0.5, 0.75] }),
    );

    expect(result.frames?.map((frame) => frame.time)).toEqual([2.2, 2.4, 2.6]);
    expect(result.frames?.map((frame) => frame.progress)).toEqual([0.25, 0.5, 0.75]);
    for (const frame of result.frames ?? []) {
      expect(new URL(frame.url).searchParams.get("revision")).toBe("rev-1");
    }
    // url/time mirror the first sample, so a single-frame reader still works.
    expect(result.url).toBe(result.frames?.[0]?.url);
    expect(result.animationId).toBe("a1");
  });

  it("refuses a set whose frames came from different revisions", async () => {
    let call = 0;
    const result = expectFailure(
      await studioFrame(
        sampleDeps(tween, {
          probeFrame: async () => ({ ok: true, status: 200, sourceRevision: `rev-${++call}` }),
        }),
        { animationId: "a1", samples: [0.25, 0.75] },
      ),
    );

    expect(result.kind).toBe("failed");
    expect(result.reason).toContain("changed");
  });

  it("refuses samples for an animation that is not on the selected target", async () => {
    const result = expectFailure(
      await studioFrame(sampleDeps(tween), { animationId: "other", samples: [0.5] }),
    );

    expect(result.kind).toBe("invalid");
  });

  it("refuses an animation with no numeric timing", async () => {
    const result = expectFailure(
      await studioFrame(sampleDeps([{ id: "a1", position: "intro+1", duration: 0.5 }]), {
        animationId: "a1",
        samples: [0.5],
      }),
    );

    expect(result.kind).toBe("invalid");
  });

  it("refuses fractions outside 0–1, an empty list and a missing animationId", async () => {
    for (const input of [
      { animationId: "a1", samples: [1.5] },
      { animationId: "a1", samples: [] },
      { samples: [0.5] },
    ]) {
      expect(expectFailure(await studioFrame(sampleDeps(tween), input)).kind).toBe("invalid");
    }
  });

  it("blocks when nothing is selected instead of guessing a target", async () => {
    const result = expectFailure(
      await studioFrame(sampleDeps(tween, { getCurrentSelection: () => null }), {
        animationId: "a1",
        samples: [0.5],
      }),
    );

    expect(result.kind).toBe("blocked");
  });

  it("leaves the existing single-frame call untouched", async () => {
    const result = expectOk<StudioFrameResult>(await studioFrame(frameDeps(), { time: 3 }));

    expect(result.frames).toBeUndefined();
    expect(result.time).toBe(2.4);
  });
});
