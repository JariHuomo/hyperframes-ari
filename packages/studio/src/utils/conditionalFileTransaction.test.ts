import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeConditionalFiles } from "./conditionalFileTransaction";
import { saveProjectFilesWithHistory } from "./studioFileHistory";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function disk() {
  const dir = await mkdtemp(join(tmpdir(), "ari-transaction-"));
  dirs.push(dir);
  const before = {
    "a.html": "<!doctype html>\r\n<div>Ää</div>\r\n",
    "b.html": "<!-- säilytä -->\n",
  };
  for (const [p, value] of Object.entries(before)) await writeFile(join(dir, p), value);
  const read = (p: string) => readFile(join(dir, p), "utf8");
  const write = async (p: string, content: string, expected?: string) => {
    if ((await read(p)) !== expected) throw new Error("conflict");
    await writeFile(join(dir, p), content);
  };
  return { dir, before, read, write };
}

async function expectOriginalBytes(h: Awaited<ReturnType<typeof disk>>) {
  for (const [p, content] of Object.entries(h.before)) {
    expect(await readFile(join(h.dir, p))).toEqual(Buffer.from(content));
  }
}

describe("conditional file transaction", () => {
  it("restores exact disk bytes when the second file write fails", async () => {
    const h = await disk();
    await expect(
      writeConditionalFiles({ "a.html": "new a", "b.html": "new b" }, h.before, async (p, c, e) => {
        if (p === "b.html") throw new Error("disk full");
        await h.write(p, c, e);
      }),
    ).rejects.toThrow("disk full");
    await expectOriginalBytes(h);
  });

  it("shared save rolls back all files if recording history fails", async () => {
    const h = await disk();
    await expect(
      saveProjectFilesWithHistory({
        projectId: "local",
        label: "edit",
        kind: "manual",
        files: { "a.html": "new a", "b.html": "new b" },
        readFile: h.read,
        writeFile: h.write,
        recordEdit: async () => {
          throw new Error("history");
        },
      }),
    ).rejects.toThrow("history");
    await expectOriginalBytes(h);
  });

  it("shared save continues after a rollback conflict with distinct disk preconditions", async () => {
    const h = await disk();
    const diskContent = { "a.html": "partially edited a", "b.html": "partially edited b" };
    for (const [p, c] of Object.entries(diskContent)) await writeFile(join(h.dir, p), c);
    const baseline: Record<string, string> = h.before;
    const historyError = new Error("history unavailable");
    const result = saveProjectFilesWithHistory({
      projectId: "local",
      label: "edit",
      kind: "manual",
      files: { "a.html": "new a", "b.html": "new b" },
      readFile: async (p) => baseline[p],
      diskContent,
      writeFile: h.write,
      recordEdit: async () => {
        expect(await h.read("a.html")).toBe("new a");
        expect(await h.read("b.html")).toBe("new b");
        await writeFile(join(h.dir, "b.html"), "external\r\nÄä");
        throw historyError;
      },
    });
    await expect(result).rejects.toMatchObject({
      message: "File transaction rollback did not complete",
      errors: [historyError, expect.objectContaining({ message: "conflict" })],
    });
    expect(await readFile(join(h.dir, "a.html"))).toEqual(Buffer.from(h.before["a.html"]));
    expect(await readFile(join(h.dir, "b.html"))).toEqual(Buffer.from("external\r\nÄä"));
  });

  it("continues rollback after a conflict, preserves external bytes, and reports failure", async () => {
    const h = await disk();
    await expect(
      writeConditionalFiles(
        { "a.html": "new a", "b.html": "new b" },
        h.before,
        h.write,
        async () => {
          await writeFile(join(h.dir, "b.html"), "external");
          throw new Error("finish failed");
        },
      ),
    ).rejects.toThrow("rollback did not complete");
    expect(await h.read("a.html")).toBe(h.before["a.html"]);
    expect(await h.read("b.html")).toBe("external");
  });
});

it("preserves an explicit missing-file condition and restores absence after failure", async () => {
  const state: Record<string, string | null> = { "new.html": null, "empty.html": "" };
  const writes: unknown[] = [];
  const write = async (path: string, content: string | null, expected?: string | null) => {
    writes.push([path, content, expected]);
    if (state[path] !== expected) throw new Error("conflict");
    state[path] = content;
  };
  await expect(
    writeConditionalFiles<string | null>(
      { "new.html": "created", "empty.html": null },
      { "new.html": null, "empty.html": "" },
      write,
      async () => {
        throw new Error("finish failed");
      },
    ),
  ).rejects.toThrow("finish failed");
  expect(state).toEqual({ "new.html": null, "empty.html": "" });
  expect(writes[0]).toEqual(["new.html", "created", null]);
});

it("does not replace an explicit null disk condition with a non-null history baseline", async () => {
  let state: string | null = null;
  await expect(
    writeConditionalFiles<string | null>(
      { "a.html": "after" },
      { "a.html": "before" },
      async (_path, content, expected) => {
        expect(state).toBe(expected);
        state = content;
      },
      async () => {
        throw new Error("history failed");
      },
      { "a.html": null },
    ),
  ).rejects.toThrow("history failed");
  expect(state).toBe("before");
});
