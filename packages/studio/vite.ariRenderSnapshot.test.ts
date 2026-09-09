import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAriRenderSnapshot } from "./vite.ariRenderSnapshot";
describe("Ari render input isolation", () => {
  it("freezes source and binary assets and removes its temporary copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "ari-snapshot-test-"));
    try {
      writeFileSync(join(dir, "index.html"), "old headline");
      writeFileSync(join(dir, "product.png"), Buffer.from([1, 2, 3]));
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
