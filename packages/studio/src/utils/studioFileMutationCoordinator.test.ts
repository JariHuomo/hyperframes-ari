import { expect, it } from "vitest";
import {
  serializeStudioFileMutation,
  waitForStudioFileMutations,
  withStudioFileRefresh,
} from "./studioFileMutationCoordinator";

it("export waits for queued writes including history completion", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = {};
  const events: string[] = [];
  const first = serializeStudioFileMutation(writer, "index.html", async () => {
    await gate;
    events.push("saved");
  });
  const second = serializeStudioFileMutation(writer, "index.html", async () => {
    events.push("history");
  });
  const exported = waitForStudioFileMutations().then(() => events.push("export"));
  await Promise.resolve();
  expect(events).toEqual([]);
  release();
  await Promise.all([first, second, exported]);
  expect(events).toEqual(["saved", "history", "export"]);
});
it("failed pending save refuses export and a subsequent retry can proceed", async () => {
  let reject = (_error: Error) => {};
  const save = serializeStudioFileMutation(
    {},
    "new.html",
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const result = expect(save).rejects.toThrow("disk full");
  const exportResult = expect(waitForStudioFileMutations()).rejects.toThrow("disk full");
  await Promise.resolve();
  reject(new Error("disk full"));
  await Promise.all([result, exportResult]);
  await expect(waitForStudioFileMutations()).resolves.toBeUndefined();
});

it("refresh waits for accepted writes, refuses new writes, and releases its barrier on failure", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const events: string[] = [];
  const saved = serializeStudioFileMutation({}, "index.html", async () => {
    await gate;
    events.push("saved");
  });
  const refreshed = withStudioFileRefresh(async () => {
    events.push("read");
    await expect(
      serializeStudioFileMutation({}, "index.html", async () => {
        events.push("should not write");
      }),
    ).rejects.toThrow("päivitetään");
    throw new Error("read failure");
  });
  const rejected = expect(refreshed).rejects.toThrow("read failure");
  await Promise.resolve();
  expect(events).toEqual([]);
  release();
  await saved;
  await rejected;
  await serializeStudioFileMutation({}, "index.html", async () => {
    events.push("retry");
  });
  expect(events).toEqual(["saved", "read", "retry"]);
});
