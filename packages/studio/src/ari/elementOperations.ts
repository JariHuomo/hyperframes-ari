import { ensureHfIds } from "@hyperframes/parsers/hf-ids";
import { elementKind, editElementSource } from "./elementSource";
import { openComposition } from "@hyperframes/sdk";
import { saveProjectFilesWithHistory, type RecordEditInput } from "../utils/studioFileHistory";
import { studioFileContentVersion } from "../utils/studioFileVersion";

export type ElementOperation =
  | {
      action: "add";
      kind: "text" | "image" | "background";
      name: string;
      text?: string;
      color?: string;
      image?: { path: string; checksum: string };
    }
  | { action: "rename"; target: string; name: string }
  | { action: "duplicate" | "delete" | "forward" | "backward"; target: string };
export interface ElementFiles {
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, content: string | null, expected?: string | null) => Promise<void>;
  recordEdit: (entry: RecordEditInput<string | null>) => Promise<void>;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
function name(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 120)
    throw new Error("Anna nimi, jossa on 1–120 merkkiä.");
  return value.trim();
}
function elementDisplayName(e: Parameters<typeof elementKind>[0]) {
  const explicit = e.attributes["data-label"] || e.attributes.alt || e.text?.trim().slice(0, 80);
  if (explicit) return explicit;
  const kind = elementKind(e);
  if (kind === "background") return "Tausta";
  return kind === "image" ? "Kuva" : "Teksti";
}
export async function readElements(source: string) {
  const composition = await openComposition(source, { history: false });
  try {
    return composition
      .getElements()
      .filter((e) => elementKind(e))
      .map((e) => ({
        target: e.id,
        name: elementDisplayName(e),
        kind: elementKind(e),
        zIndex: Number(e.inlineStyles.zIndex ?? 0),
        text: e.text,
        imagePath: e.attributes["data-ari-image-path"] ?? e.attributes.src ?? null,
        checksum: e.attributes["data-ari-image-checksum"] ?? null,
        imported: Boolean(
          e.attributes["data-ari-image-path"] || e.attributes["data-ari-image-checksum"],
        ),
      }));
  } finally {
    composition.dispose();
  }
}
function fragment(
  op: Extract<ElementOperation, { action: "add" }>,
  duration: number,
  index: number,
  sourceFile: string,
) {
  const label = name(op.name);
  const common = `data-ari-element="${op.kind}" data-label="${escape(label)}" class="clip" data-start="0" data-duration="${duration}" data-track-index="${index}"`;
  if (op.kind === "text") {
    if (typeof op.text !== "string" || !op.text.trim() || op.text.length > 4000)
      throw new Error("Anna teksti, jossa on 1–4000 merkkiä.");
    return `<p ${common} style="position:absolute;left:90px;top:240px;width:900px;margin:0;font-size:80px;line-height:1.2;color:#172b27;z-index:${index}">${escape(op.text)}</p>`;
  }
  if (op.kind === "background") {
    if (!/^#[0-9a-f]{6}$/i.test(op.color ?? "")) throw new Error("Valitse taustan väri.");
    return `<div ${common} style="position:absolute;inset:0;background:${op.color};z-index:${index}"></div>`;
  }
  if (!op.image) throw new Error("Valitse kuva aineistohyllystä.");
  const relativeImagePath = "../".repeat(sourceFile.split("/").length - 1) + op.image.path;
  return `<img ${common} data-ari-image-path="${escape(op.image.path)}" src="${escape(relativeImagePath)}" data-ari-image-checksum="${escape(op.image.checksum)}" alt="${escape(label)}" style="position:absolute;left:22%;top:36%;width:56%;height:33%;object-fit:contain;z-index:${index}">`;
}

function reorderElement(
  composition: Awaited<ReturnType<typeof openComposition>>,
  target: string,
  forward: boolean,
) {
  const parent = composition
    .getElements()
    .find((e) => e.children.some((child) => child.id === target));
  const peers = [...(parent?.children ?? [])]
    .filter((e) => elementKind(e))
    .sort((a, b) => Number(a.inlineStyles.zIndex ?? 0) - Number(b.inlineStyles.zIndex ?? 0));
  const current = peers.findIndex((e) => e.id === target);
  const next = current + (forward ? 1 : -1);
  if (current < 0 || next < 0 || next >= peers.length)
    throw new Error("Elementti on jo järjestyksen reunassa.");
  [peers[current], peers[next]] = [peers[next]!, peers[current]!];
  peers.forEach((e, i) => composition.setStyle(e.id, { zIndex: String(i + 1) }));
}

type Composition = Awaited<ReturnType<typeof openComposition>>;
function sceneRoot(composition: Composition) {
  const root = composition.getElements().find((e) => e.attributes["data-composition-id"]);
  const duration = Number(root?.attributes["data-duration"] ?? root?.duration);
  if (!root || !Number.isFinite(duration) || duration <= 0)
    throw new Error("Kohtauksen kestoa ei voitu lukea.");
  return { root, duration };
}
function editExisting(
  composition: Composition,
  source: string,
  operation: Exclude<ElementOperation, { action: "add" }>,
) {
  const target = operation.target;
  const element = composition.getElement(target);
  if (!element || !elementKind(element))
    throw new Error("Kohde puuttuu tai tämä rakennetyökalu ei vielä tue sitä.");
  if (operation.action === "delete" || operation.action === "duplicate")
    return editElementSource(ensureHfIds(source), target, operation.action === "duplicate");
  if (operation.action === "rename")
    composition.setAttribute(target, "data-label", name(operation.name));
  else reorderElement(composition, target, operation.action === "forward");
  return { target, after: composition.serialize() };
}

/** Candidate-only structural editing. No live DOM is changed before persistence. */
export async function buildElementEdit(
  source: string,
  operation: ElementOperation,
  sourceFile = "index.html",
) {
  const composition = await openComposition(source, { history: false });
  try {
    const { root, duration } = sceneRoot(composition);
    let target: string;
    if (operation.action === "add") {
      const highest = Math.max(
        0,
        ...root.children.map((e) => Number(e.inlineStyles.zIndex ?? e.trackIndex ?? 0)),
      );
      target = composition.addElement(
        root.id,
        root.children.length,
        fragment(
          operation,
          duration,
          operation.kind === "background" ? 0 : highest + 1,
          sourceFile,
        ),
      );
    } else return editExisting(composition, source, operation);
    if (!target) throw new Error("Elementin kirjoitus ei onnistunut.");
    return { target, after: composition.serialize() };
  } finally {
    composition.dispose();
  }
}

export async function saveElementOperation(input: {
  operationId?: string;
  projectId: string;
  sourceFile: string;
  expectedVersion: string;
  operation: ElementOperation;
  affectsInstances: number;
  io: ElementFiles;
  assertActive?: () => void;
  verifyImage: (image: { path: string; checksum: string }) => Promise<void>;
}) {
  const { io, sourceFile, operation } = input;
  input.assertActive?.();
  const before = await io.readFile(sourceFile);
  if (before === null || (await studioFileContentVersion(before)) !== input.expectedVersion)
    throw new Error("Kohtaus on muuttunut. Lue elementit uudelleen ennen muokkausta.");
  if (operation.action === "add" && operation.kind === "image") {
    if (!operation.image) throw new Error("Valitse kuva aineistohyllystä.");
    await input.verifyImage(operation.image);
  }
  if (operation.action === "duplicate") {
    const element = (await readElements(before)).find((row) => row.target === operation.target);
    if (element?.kind === "image" && element.imported) {
      if (!element.imagePath || !element.checksum)
        throw new Error("Kuvan alkuperätiedot puuttuvat.");
      await input.verifyImage({ path: element.imagePath, checksum: element.checksum });
    }
  }
  input.assertActive?.();
  const candidate = await buildElementEdit(before, operation, sourceFile);
  const savedPaths = await saveProjectFilesWithHistory({
    operationId: input.operationId,
    projectId: input.projectId,
    label: "Muokkaa elementtejä",
    kind: "source",
    files: { [sourceFile]: candidate.after },
    ...io,
    readFile: async (path) => {
      const current = await io.readFile(path);
      input.assertActive?.();
      if (current !== before) throw new Error("Kohtaus muuttui tallennuksen aikana.");
      return current;
    },
  });
  const saved = await io.readFile(sourceFile);
  if (saved !== candidate.after) throw new Error("Tallennuksen jälkeinen tarkistus epäonnistui.");
  return {
    ok: true,
    stage: "saved",
    operationId: savedPaths.operationId,
    target: candidate.target,
    sourceFile,
    version: await studioFileContentVersion(saved),
    affectsInstances: input.affectsInstances,
    deleted: operation.action === "delete",
  };
}
