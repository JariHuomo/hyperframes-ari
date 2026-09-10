// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commitConditionalFiles, confinedPath } from "./conditionalFiles";
import { fileContentVersion as version } from "../helpers/fileVersion";
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});
const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "ari-files-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe("conditional create/delete transactions", () => {
  it("distinguishes a missing file from an empty one and refuses duplicate creation", () => {
    const dir = temp();
    const receipt = commitConditionalFiles(dir, [
      { path: "empty.html", expectedVersion: null, content: Buffer.alloc(0) },
    ]);
    expect(receipt[0]).toEqual({ path: "empty.html", exists: true, version: version("") });
    expect(() =>
      commitConditionalFiles(dir, [
        { path: "empty.html", expectedVersion: null, content: Buffer.from("overwrite") },
      ]),
    ).toThrow("muuttui");
    expect(readFileSync(join(dir, "empty.html"))).toEqual(Buffer.alloc(0));
    commitConditionalFiles(dir, [
      { path: "empty.html", expectedVersion: version(""), content: null },
    ]);
    expect(existsSync(join(dir, "empty.html"))).toBe(false);
  });
  it("compensates creation and deletion with exact bytes when finish fails", () => {
    const dir = temp(),
      before = Buffer.from("Ää\r\n");
    writeFileSync(join(dir, "old.html"), before);
    expect(() =>
      commitConditionalFiles(
        dir,
        [
          { path: "new/empty.html", expectedVersion: null, content: Buffer.alloc(0) },
          { path: "old.html", expectedVersion: version(before), content: null },
        ],
        () => {
          throw new Error("history failed");
        },
      ),
    ).toThrow("history failed");
    expect(readFileSync(join(dir, "old.html"))).toEqual(before);
    expect(existsSync(join(dir, "new"))).toBe(false);
  });
  it("tries remaining rollbacks after a deleted file is concurrently recreated", () => {
    const dir = temp();
    writeFileSync(join(dir, "old.html"), "old");
    expect(() =>
      commitConditionalFiles(
        dir,
        [
          { path: "new.html", expectedVersion: null, content: Buffer.from("new") },
          { path: "old.html", expectedVersion: version("old"), content: null },
        ],
        () => {
          writeFileSync(join(dir, "old.html"), "external");
          throw new Error("history failed");
        },
      ),
    ).toThrow("palautus jäi kesken");
    expect(readFileSync(join(dir, "old.html"), "utf8")).toBe("external");
    expect(existsSync(join(dir, "new.html"))).toBe(false);
  });
  it("preflights every input before writing and refuses a stale delete", () => {
    const dir = temp();
    writeFileSync(join(dir, "old.html"), "external");
    expect(() =>
      commitConditionalFiles(dir, [
        { path: "new.html", expectedVersion: null, content: Buffer.from("new") },
        { path: "old.html", expectedVersion: version("old"), content: null },
      ]),
    ).toThrow("muuttui");
    expect(existsSync(join(dir, "new.html"))).toBe(false);
  });
  it.each(["../escape.html", "/absolute.html", "a/../escape.html", "a\\b", "a//b", "a\0b"])(
    "rejects path %s",
    (path) => {
      expect(() => confinedPath(temp(), path)).toThrow();
    },
  );
  it("rejects symlink directories and files including dangling links", () => {
    const dir = temp(),
      outside = temp();
    symlinkSync(outside, join(dir, "assets"));
    expect(() =>
      commitConditionalFiles(dir, [
        { path: "assets/a.png", expectedVersion: null, content: Buffer.from("x") },
      ]),
    ).toThrow("Linkitettyyn");
    symlinkSync(join(outside, "missing"), join(dir, "dangling.html"));
    expect(() => confinedPath(dir, "dangling.html")).toThrow("Linkitettyyn");
    expect(existsSync(join(outside, "a.png"))).toBe(false);
  });
  it("rolls back earlier files if a later write meets a non-directory", () => {
    const dir = temp();
    mkdirSync(join(dir, "folder"));
    writeFileSync(join(dir, "folder/bad"), "file");
    expect(() =>
      commitConditionalFiles(dir, [
        { path: "created.html", expectedVersion: null, content: Buffer.from("x") },
        { path: "folder/bad/a.html", expectedVersion: null, content: Buffer.from("x") },
      ]),
    ).toThrow();
    expect(existsSync(join(dir, "created.html"))).toBe(false);
  });
});

it("a partial temporary-file write cannot truncate an existing source or leave a half-created file", async () => {
  const original = await vi.importActual<typeof import("node:fs")>("node:fs");
  const dir = temp();
  writeFileSync(join(dir, "source.html"), "Ää\r\n");
  vi.mocked(writeFileSync).mockImplementationOnce((path, _data, options) => {
    original.writeFileSync(path, Buffer.from("half"), options);
    throw new Error("disk full after partial write");
  });
  expect(() =>
    commitConditionalFiles(dir, [
      {
        path: "source.html",
        expectedVersion: version("Ää\r\n"),
        content: Buffer.from("replacement"),
      },
    ]),
  ).toThrow("disk full");
  expect(readFileSync(join(dir, "source.html"))).toEqual(Buffer.from("Ää\r\n"));
  expect(readdirSync(dir)).toEqual(["source.html"]);
});
