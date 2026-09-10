// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAdProject, projectProposal } from "./adProjects";
const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "ari-projects-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
it.each(["blank", "product"])(
  "creates a runnable local %s project and rejects a second creation",
  async (template) => {
    const root = temp(),
      input = { name: "Ää mainos", template };
    const proposal = projectProposal(root, input);
    expect(proposal).toMatchObject({ duration: 7, width: 1080, height: 1920 });
    const request = { ...input, location: proposal.dir };
    const result = await createAdProject(root, request);
    const html = readFileSync(join(proposal.dir, "index.html"), "utf8");
    expect(html).toContain('data-duration="7"');
    expect(html).toContain("window.__timelines.main = tl");
    expect(html).toContain('src="assets/gsap.min.js"');
    expect(result.files.every((file) => file.version?.startsWith('"sha256:'))).toBe(true);
    await expect(createAdProject(root, request)).rejects.toThrow("Samanniminen");
    expect(readFileSync(join(proposal.dir, "index.html"), "utf8")).toBe(html);
  },
);
it("binds the creation location and refuses a symlink collision", async () => {
  const root = temp();
  const input = { name: "demo", template: "blank", location: "/elsewhere" };
  await expect(createAdProject(root, input)).rejects.toThrow("Tallennuspaikka muuttui");
  symlinkSync(temp(), join(root, "demo"));
  expect(() => projectProposal(root, input)).toThrow("Linkitettyyn");
});
it("allows only one simultaneous creator", async () => {
  const root = temp(),
    input = { name: "race", template: "product" };
  const location = projectProposal(root, input).dir;
  const results = await Promise.allSettled([
    createAdProject(root, { ...input, location }),
    createAdProject(root, { ...input, location }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
});
it.each(["../escape", "a/b", "a\\b", "", "a".repeat(81)])("refuses project name %s", (name) =>
  expect(() => projectProposal(temp(), { name, template: "blank" })).toThrow(),
);

it("binds the complete saved manifest rather than the first font file", async () => {
  const root = temp();
  const input = { name: "manifest", template: "product" };
  const receipt = await createAdProject(root, {
    ...input,
    location: projectProposal(root, input).dir,
  });
  const { fileContentVersion } = await import("../helpers/fileVersion");
  expect(receipt.version).toBe(fileContentVersion(JSON.stringify(receipt.files)));
  expect(receipt.version).not.toBe(receipt.files[0]!.version);
  const html = readFileSync(join(receipt.project.dir, "index.html"), "utf8");
  expect(html).toContain("@font-face");
  expect(html).toContain('src="assets/MotionPathPlugin.min.js"');
  expect(html).not.toContain("https:");
});
