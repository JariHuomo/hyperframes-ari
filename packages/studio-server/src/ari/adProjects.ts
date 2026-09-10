import { createRequire } from "node:module";
import { mkdirSync, readFileSync, realpathSync, rmdirSync, lstatSync } from "node:fs";
import sharp from "sharp";
import { fileContentVersion } from "../helpers/fileVersion.js";
import { adTemplate } from "./projectTemplates.js";
import { commitConditionalFiles, confinedPath } from "./conditionalFiles.js";

export function projectProposal(root: string, input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Anna mainoksen tiedot.");
  if (Object.keys(input).some((key) => !["name", "template", "location"].includes(key)))
    throw new Error("Mainoksen tiedot eivät kelpaa. Kesto on tässä pohjassa seitsemän sekuntia.");
  const name = Reflect.get(input, "name");
  const template = Reflect.get(input, "template");
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 80 ||
    /[/\\]/.test(name) ||
    [...name].some((char) => char.charCodeAt(0) < 32)
  )
    throw new Error("Anna nimi, jossa on enintään 80 merkkiä eikä kauttaviivoja.");
  if (template !== "blank" && template !== "product")
    throw new Error("Valitse tyhjä pohja tai tuotepohja.");
  const id = name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id || id.startsWith(".")) throw new Error("Nimeen tarvitaan kirjaimia tai numeroita.");
  const dir = confinedPath(root, id);
  return {
    name: name.trim(),
    id,
    dir,
    template,
    duration: 7,
    width: 1080,
    height: 1920,
    root: realpathSync(root),
  };
}

export async function createAdProject(root: string, input: unknown) {
  const proposal = projectProposal(root, input);
  if (Reflect.get(Object(input), "location") !== proposal.dir)
    throw new Error("Tallennuspaikka muuttui. Tarkista mainoksen tiedot uudelleen.");
  // Decode/generate before claiming the directory; no awaiting after exclusive creation.
  const product =
    proposal.template === "product"
      ? await sharp({ create: { width: 600, height: 640, channels: 4, background: "#b5c9b7" } })
          .png()
          .toBuffer()
      : null;
  const gsap = readFileSync(createRequire(import.meta.url).resolve("gsap/dist/gsap.min.js"));
  const motionPath = readFileSync(
    createRequire(import.meta.url).resolve("gsap/dist/MotionPathPlugin.min.js"),
  );
  const require = createRequire(import.meta.url);
  const fonts = [400, 700].map((weight) => ({
    path: `assets/fonts/inter-${weight}.woff2`,
    content: readFileSync(
      require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`),
    ),
    expectedVersion: null,
  }));
  const html = Buffer.from(adTemplate(proposal.name, proposal.template));
  const files = [
    ...fonts,
    {
      path: "assets/fonts/LICENSE.txt",
      content: readFileSync(require.resolve("@fontsource/inter/LICENSE")),
      expectedVersion: null,
    },
    { path: "index.html", content: html, expectedVersion: null },
    { path: "assets/gsap.min.js", content: gsap, expectedVersion: null },
    { path: "assets/MotionPathPlugin.min.js", content: motionPath, expectedVersion: null },
    {
      path: "hyperframes.json",
      content: Buffer.from(JSON.stringify({ name: proposal.name }, null, 2) + "\n"),
      expectedVersion: null,
    },
    ...(product ? [{ path: "assets/product.png", content: product, expectedVersion: null }] : []),
  ];
  // Re-resolve after await and refuse a replaced root or symlink.
  if (projectProposal(root, input).dir !== proposal.dir)
    throw new Error("Tallennuspaikka muuttui.");
  try {
    mkdirSync(proposal.dir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(
        "Samanniminen projekti on jo olemassa. Anna uusi nimi tai avaa olemassa oleva.",
      );
    throw error;
  }
  try {
    const receipts = commitConditionalFiles(proposal.dir, files);
    return {
      ok: true as const,
      stage: "saved",
      project: proposal,
      files: receipts,
      version: fileContentVersion(JSON.stringify(receipts)),
      affectsProjects: 1,
    };
  } catch (error) {
    try {
      if (lstatSync(proposal.dir).isDirectory()) rmdirSync(proposal.dir);
    } catch {
      /* Preserve concurrent files. */
    }
    throw error;
  }
}
