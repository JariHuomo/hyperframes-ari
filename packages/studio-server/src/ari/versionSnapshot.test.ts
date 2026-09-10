import { expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createFrozenVersionSnapshot } from "./versionSnapshot";
import { versionTestProject } from "./versionTestProject";
import { projectVersionFiles, sourceRevision } from "./versionFiles";
import { saveProjectVersion, readVersionIndex, deleteProjectVersion } from "./versionStore";
import { versionBlobPath } from "./versionTypes";

function fixture() {
  const root = versionTestProject({
    "index.html": '<img src="assets/old.png">',
    "assets/old.png": Buffer.from([1, 2, 3]),
  });
  const { version } = saveProjectVersion(root, {
    expectedRevision: sourceRevision(projectVersionFiles(root)),
    expectedIndex: null,
    name: "Tarkistettava",
  });
  return { root, version };
}
it("keeps frozen source/media bytes after current edits and version pruning; disposes its workspace", () => {
  const { root, version } = fixture();
  const snapshot = createFrozenVersionSnapshot(root, version.id);
  try {
    writeFileSync(join(root, "index.html"), "new source");
    unlinkSync(join(root, "assets/old.png"));
    deleteProjectVersion(root, version.id, readVersionIndex(root).token);
    expect(readFileSync(join(snapshot.dir, "index.html"), "utf8")).toBe(
      '<img src="assets/old.png">',
    );
    expect(readFileSync(join(snapshot.dir, "assets/old.png"))).toEqual(Buffer.from([1, 2, 3]));
    expect(snapshot.version.revision).toBe(version.revision);
    expect(() => createFrozenVersionSnapshot(root, version.id)).toThrow("säilytetty");
  } finally {
    snapshot.dispose();
  }
  expect(existsSync(snapshot.dir)).toBe(false);
});
it("does not change source revision or history while preparing a snapshot", () => {
  const { root, version } = fixture();
  const before = readFileSync(join(root, ".ari-versions/index.json"));
  const snapshot = createFrozenVersionSnapshot(root, version.id);
  snapshot.dispose();
  expect(sourceRevision(projectVersionFiles(root))).toBe(version.revision);
  expect(readFileSync(join(root, ".ari-versions/index.json"))).toEqual(before);
});
it.each(["missing", "corrupt"])(
  "refuses %s frozen media without using the active copy",
  (failure) => {
    const { root, version } = fixture();
    const path = join(root, versionBlobPath(version.files["assets/old.png"]!));
    if (failure === "missing") unlinkSync(path);
    else writeFileSync(path, "broken");
    expect(() => createFrozenVersionSnapshot(root, version.id)).toThrow(
      "puuttuu tai on vioittunut",
    );
    expect(readFileSync(join(root, "assets/old.png"))).toEqual(Buffer.from([1, 2, 3]));
  },
);
