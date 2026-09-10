import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAriRenderSnapshot } from "./vite.ariRenderSnapshot";
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});
describe("Ari render input isolation", () => {
  it("freezes source and binary assets and removes its temporary copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "ari-snapshot-test-"));
    try {
      writeFileSync(join(dir, "index.html"), "old headline");
      writeFileSync(join(dir, "product.png"), Buffer.from([1, 2, 3]));
      mkdirSync(join(dir, ".ari-versions"));
      writeFileSync(join(dir, ".ari-versions/index.json"), "history excluded from export");
      const snapshot = createAriRenderSnapshot(dir);
      writeFileSync(join(dir, "index.html"), "new headline");
      writeFileSync(join(dir, "product.png"), Buffer.from([4, 5, 6]));
      expect(readFileSync(join(snapshot.dir, "index.html"), "utf8")).toBe("old headline");
      expect([...readFileSync(join(snapshot.dir, "product.png"))]).toEqual([1, 2, 3]);
      expect(Object.keys(snapshot.files)).toEqual(["index.html", "product.png"]);
      snapshot.dispose();
      expect(existsSync(snapshot.dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("refuses symlink inputs instead of allowing a moving dependency", () => {
    const dir = mkdtempSync(join(tmpdir(), "ari-snapshot-test-"));
    try {
      writeFileSync(join(dir, "index.html"), "original");
      symlinkSync(join(dir, "index.html"), join(dir, "alias.html"));
      expect(() => createAriRenderSnapshot(dir)).toThrow("linkkiä");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it.each(["change", "create", "delete"])("refuses %s during snapshot preparation", (operation) => {
  const dir = mkdtempSync(join(tmpdir(), "ari-torn-"));
  const source = join(dir, "index.html");
  writeFileSync(source, "original");
  const originalWrite = vi.mocked(fs.writeFileSync).getMockImplementation()!;
  let changed = false;
  const spy = vi.mocked(fs.writeFileSync).mockImplementation((...args) => {
    originalWrite(...args);
    if (changed) return;
    changed = true;
    if (operation === "change") originalWrite(source, "concurrent edit");
    if (operation === "create") originalWrite(join(dir, "new.html"), "new source");
    if (operation === "delete") fs.unlinkSync(source);
  });
  try {
    expect(() => createAriRenderSnapshot(dir)).toThrow("muuttui");
  } finally {
    spy.mockImplementation(originalWrite);
    rmSync(dir, { recursive: true, force: true });
  }
});
