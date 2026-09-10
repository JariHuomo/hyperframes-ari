import { versionTestProject } from "./versionTestProject";
import { afterEach, expect, it } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  saveProjectVersion,
  readVersionIndex,
  readProjectVersion,
  prepareVersionRestore,
  deleteProjectVersion,
} from "./versionStore";
import { projectVersionFiles, sourceRevision } from "./versionFiles";
import { versionBlobPath } from "./versionTypes";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function setup() {
  const root = versionTestProject({
    "index.html": '<img src="assets/pixel.png"><style>body{color:red}</style>',
    "assets/pixel.png": Buffer.from([0, 255, 1, 128]),
  });
  const save = (name?: string, finish?: () => void) =>
    saveProjectVersion(
      root,
      {
        expectedRevision: sourceRevision(projectVersionFiles(root)),
        expectedIndex: readVersionIndex(root).token,
        name,
      },
      finish,
    );
  return { root, save };
}
it("freezes source and binary bytes independently of current files, with A5 revision and unique IDs", () => {
  const { root, save } = setup();
  const first = save("Ennen");
  writeFileSync(join(root, "assets/pixel.png"), Buffer.from([7, 8, 9]));
  writeFileSync(join(root, "index.html"), "<p>Jälkeen</p>");
  const second = save();
  expect(second.version.id).not.toBe(first.version.id);
  const reopened = readProjectVersion(root, first.version.id);
  expect(reopened.files["assets/pixel.png"]).toEqual(Buffer.from([0, 255, 1, 128]));
  expect(reopened.files["index.html"]!.toString()).toContain("color:red");
  expect(readVersionIndex(root).index.versions).toHaveLength(2);
  expect(second.version.revision).toBe(sourceRevision(projectVersionFiles(root)));
  expect(prepareVersionRestore(root, first.version.id).files["assets/pixel.png"]).toMatchObject({
    before: "BwgJ",
    after: "AP8BgA==",
    encoding: "base64",
  });
});
it("distinguishes deletion, absence and empty files in a restore", () => {
  const { root, save } = setup();
  writeFileSync(join(root, "empty.html"), "");
  const initial = save();
  rmSync(join(root, "empty.html"));
  writeFileSync(join(root, "new.html"), "new");
  const changes = prepareVersionRestore(root, initial.version.id).files;
  expect(changes["empty.html"]).toMatchObject({ before: null, after: "" });
  expect(changes["new.html"]).toMatchObject({ before: "bmV3", after: null });
});
it("rejects stale index/revision, and an interrupted publication removes new objects and restores index", () => {
  const { root, save } = setup();
  const first = save();
  const indexBytes = readFileSync(join(root, ".ari-versions/index.json"));
  const objects = readdirSync(join(root, ".ari-versions/objects"));
  writeFileSync(join(root, "index.html"), "changed");
  expect(() =>
    saveProjectVersion(root, {
      expectedRevision: first.version.revision,
      expectedIndex: first.indexToken,
    }),
  ).toThrow("Projekti muuttui");
  expect(() =>
    saveProjectVersion(root, {
      expectedRevision: sourceRevision(projectVersionFiles(root)),
      expectedIndex: null,
    }),
  ).toThrow("historia muuttui");
  expect(() =>
    save(undefined, () => {
      throw new Error("disk failed");
    }),
  ).toThrow("disk failed");
  expect(readFileSync(join(root, ".ari-versions/index.json"))).toEqual(indexBytes);
  expect(readdirSync(join(root, ".ari-versions/objects"))).toEqual(objects);
});
it("fails closed on missing or corrupted objects and cannot substitute a current image", () => {
  const { root, save } = setup();
  const version = save().version;
  const path = join(root, versionBlobPath(version.files["assets/pixel.png"]!));
  writeFileSync(path, "corrupt");
  expect(() => readProjectVersion(root, version.id)).toThrow("vioittunut");
  rmSync(path);
  expect(() => prepareVersionRestore(root, version.id)).toThrow("puuttuu");
});
it("rejects missing/external dependencies, symlinks and traversal", () => {
  const { root, save } = setup();
  writeFileSync(join(root, "index.html"), '<img src="missing.png">');
  expect(() => save()).toThrow("puuttuu");
  writeFileSync(join(root, "index.html"), '<script src="https://example.invalid/a.js"></script>');
  expect(() => save()).toThrow("paikallisen");
  writeFileSync(join(root, "index.html"), "ok");
  symlinkSync(join(root, "index.html"), join(root, "linked.html"));
  expect(() => save()).toThrow("linkkiä");
});
it("retains 100 automatic versions, deduplicates media, and preserves named checkpoints until explicit deletion", () => {
  const { root, save } = setup();
  const named = save("Säilytä").version;
  for (let i = 0; i < 105; i++) {
    writeFileSync(join(root, "index.html"), `<img src="assets/pixel.png"><p>${i}</p>`);
    save();
  }
  const { index, token } = readVersionIndex(root);
  expect(index.versions).toHaveLength(101);
  expect(readProjectVersion(root, named.id).version.name).toBe("Säilytä");
  const objectDir = join(root, ".ari-versions/objects");
  expect(readdirSync(objectDir)).toHaveLength(102);
  const objectBytes = readdirSync(objectDir).reduce(
    (sum, name) => sum + statSync(join(objectDir, name)).size,
    0,
  );
  expect(objectBytes).toBeLessThan(6000);
  expect(() => deleteProjectVersion(root, named.id, null)).toThrow("muuttui");
  deleteProjectVersion(root, named.id, token);
  expect(() => readProjectVersion(root, named.id)).toThrow("säilytetty");
});
it("enforces the 32 MiB automatic source budget even below the entry-count limit", () => {
  const { root, save } = setup();
  const named = save("Nimetty");
  for (let i = 0; i < 10; i++) {
    writeFileSync(join(root, "large.js"), `/*${i}${"x".repeat(4 * 1024 * 1024)}*/`);
    save();
  }
  const versions = readVersionIndex(root).index.versions;
  expect(versions.filter((v) => v.name === null)).toHaveLength(7);
  expect(readProjectVersion(root, named.version.id).version.name).toBe("Nimetty");
});

it("refuses an automatic snapshot larger than its budget without returning an unavailable ID", () => {
  const { root, save } = setup();
  const initial = save("Keep");
  writeFileSync(join(root, "large.js"), "x".repeat(32 * 1024 * 1024));
  expect(() => save()).toThrow("32 MiB");
  expect(readVersionIndex(root).index.versions.map((v) => v.id)).toEqual([initial.version.id]);
});

it("stores both sides of edits even when real paths begin with before/", () => {
  const { root } = setup();
  mkdirSync(join(root, "before"));
  writeFileSync(join(root, "before/index.html"), "nested-after");
  const result = saveProjectVersion(root, {
    expectedRevision: sourceRevision(projectVersionFiles(root)),
    expectedIndex: null,
    beforeFiles: {
      "index.html": Buffer.from("root-before"),
      "before/index.html": Buffer.from("nested-before"),
    },
  });
  const frozen = readProjectVersion(root, result.version.id);
  expect(frozen.files["before/index.html"]!.toString()).toBe("nested-after");
  const before = readVersionIndex(root).index.versions.find((v) => v.id !== result.version.id)!;
  expect(readProjectVersion(root, before.id).files["before/index.html"]!.toString()).toBe(
    "nested-before",
  );
});
