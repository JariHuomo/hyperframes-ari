import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../player";
import { findTimelineElements, waitForTimelineIds } from "./timelineSelectionPresence";

const element = (id: string) => ({ id, key: id }) as unknown as TimelineElement;

describe("findTimelineElements", () => {
  it("returns every id in the order asked for", () => {
    const found = findTimelineElements(["b", "a"], [element("a"), element("b")]);
    expect(found?.map((one) => one.id)).toEqual(["b", "a"]);
  });

  it("is null when one member is missing — a partial set is not a match", () => {
    expect(findTimelineElements(["a", "gone"], [element("a")])).toBeNull();
  });
});

describe("waitForTimelineIds", () => {
  const options = { intervalMs: 1, timeoutMs: 50, wait: async () => {} };

  it("hands back the rebuilt list once it names the ids again", async () => {
    let reads = 0;
    const found = await waitForTimelineIds({
      ids: ["clip"],
      read: () => (++reads < 3 ? [] : [element("clip")]),
      cancelled: () => false,
      ...options,
    });
    expect(found?.map((one) => one.id)).toEqual(["clip"]);
    expect(reads).toBe(3);
  });

  it("gives up on a clip that was really removed, so the caller may clear", async () => {
    const found = await waitForTimelineIds({
      ids: ["gone"],
      read: () => [element("other")],
      cancelled: () => false,
      ...options,
    });
    expect(found).toBeNull();
  });

  it("stops as soon as the effect run is cancelled", async () => {
    let reads = 0;
    const found = await waitForTimelineIds({
      ids: ["clip"],
      read: () => {
        reads++;
        return [element("clip")];
      },
      cancelled: () => true,
      ...options,
    });
    expect(found).toBeNull();
    expect(reads).toBe(0);
  });

  it("waits for every member of a group, not just the first", async () => {
    let reads = 0;
    const found = await waitForTimelineIds({
      ids: ["a", "b"],
      read: () => (++reads < 4 ? [element("a")] : [element("a"), element("b")]),
      cancelled: () => false,
      ...options,
    });
    expect(found?.map((one) => one.id)).toEqual(["a", "b"]);
  });

  it("does nothing when nothing is selected", async () => {
    expect(
      await waitForTimelineIds({ ids: [], read: () => [], cancelled: () => false, ...options }),
    ).toBeNull();
  });
});
