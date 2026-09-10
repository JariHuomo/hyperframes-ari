import { optionalOperationId } from "../../utils/sourceOperations";
import { describeScene } from "./animationScene";
import { mintElementHandle } from "../handles";
import type { ModelContextTool } from "../types";
import { toolFailure } from "../toolResult";
import { buildStudioLook, type StudioLookSnapshot } from "./lookTools";
import {
  readElements,
  saveElementOperation,
  type ElementFiles,
  type ElementOperation,
} from "../../ari/elementOperations";
import { studioFileContentVersion } from "../../utils/studioFileVersion";
export interface ElementToolDeps {
  getSnapshot: () => StudioLookSnapshot;
  refreshProject?: (readSources: () => Promise<void>) => Promise<void>;
  getSelectionRevision?: () => number;
  getElementFiles?: () => ElementFiles | undefined;
  elementsSaved?: (receipt: {
    target: string;
    sourceFile: string;
    deleted: boolean;
    previewTime?: number;
    selectionRevision?: number;
  }) => void | Promise<boolean>;
  getWriteBlockedReason: () => string | null;
}
function string(input: object, key: string) {
  const value = Reflect.get(input, key);
  if (typeof value !== "string") throw new Error(`Kenttä ${key} puuttuu.`);
  return value;
}
function operation(input: object): ElementOperation {
  const action = string(input, "action");
  if (action === "add") return addOperation(input);
  if (action === "rename")
    return { action, target: string(input, "target"), name: string(input, "name") };
  if (
    action === "duplicate" ||
    action === "delete" ||
    action === "forward" ||
    action === "backward"
  )
    return { action, target: string(input, "target") };
  throw new Error("Tuntematon elementtitoiminto.");
}
function addOperation(input: object): ElementOperation {
  const kind = string(input, "kind");
  if (kind !== "text" && kind !== "image" && kind !== "background")
    throw new Error("Valitse teksti, kuva tai tausta.");
  return {
    action: "add",
    kind,
    name: string(input, "name"),
    ...(kind === "text" ? { text: string(input, "text") } : {}),
    ...(kind === "background" ? { color: string(input, "color") } : {}),
    ...(kind === "image"
      ? { image: { path: string(input, "imagePath"), checksum: string(input, "checksum") } }
      : {}),
  };
}
export function elementTools(getDeps: () => ElementToolDeps): ModelContextTool[] {
  const sourceFields = {
    sourceFile: {
      type: "string",
      description: "Active composition or nested scene source from studio_look.",
    },
  };
  function tool(
    name: string,
    properties: object,
    required: string[],
    write: boolean,
  ): ModelContextTool {
    return {
      name,
      title: write ? "Muokkaa elementtejä" : "Lue muokattavat elementit",
      description: write
        ? "Edit a template or authored text, image or background element through the shared history transaction. Requires exact version from studio_elements. Actions add(text/image/background), rename, duplicate, delete, forward/backward (overlap order). Images require shelf path/checksum. Returns saved target, sourceFile, version and affectsInstances. Supported static-selector tweens are copied independently; dynamic targets, stagger and nested groups refuse before writing."
        : "Read source-backed template and authored elements and SHA-256 version for studio_edit_element. Includes image path/checksum, labels and overlap order. No write.",
      inputSchema: { type: "object", properties, required, additionalProperties: false },
      annotations: { readOnlyHint: !write, untrustedContentHint: true },
      execute: async (input, { signal }) => {
        try {
          const deps = getDeps(),
            snapshot = deps.getSnapshot();
          const sourceFile = string(input, "sourceFile");
          const { io, affectsInstances, projectId } = elementContext(deps, snapshot, sourceFile);
          const source = await io.readFile(sourceFile);
          if (source === null) throw new Error("Kohtaus on poistettu.");
          if (!write)
            return {
              ok: true,
              sourceFile,
              version: await studioFileContentVersion(source),
              affectsInstances,
              elements: (await readElements(source)).map((element) => ({
                ...element,
                handle: mintElementHandle({
                  projectId,
                  activeCompositionPath: snapshot.compositionPath ?? "index.html",
                  sourceFile,
                  hfId: element.target,
                }),
              })),
            };
          if (signal.aborted || deps.getWriteBlockedReason())
            throw new Error("Tallennus on estetty. Tarkista mainoksen tila.");
          const receipt = await saveElementOperation({
            operationId: optionalOperationId(input),
            projectId,
            sourceFile,
            expectedVersion: string(input, "version"),
            operation: operation(input),
            affectsInstances,
            io,
            assertActive: () => {
              if (
                signal.aborted ||
                getDeps().getSnapshot().projectId !== snapshot.projectId ||
                getDeps().getWriteBlockedReason()
              )
                throw new Error("Mainos tai tallennuksen tila vaihtui. Lue tilanne uudelleen.");
            },
            verifyImage: (image) => verifyShelfImage(projectId, image),
          });
          const previewReady = await deps.elementsSaved?.(receipt);
          return { ...receipt, ...(previewReady === undefined ? {} : { previewReady }) };
        } catch (error) {
          return toolFailure(
            "failed",
            error instanceof Error ? error.message : "Toiminto epäonnistui.",
          );
        }
      },
    };
  }
  return [
    tool("studio_elements", sourceFields, ["sourceFile"], false),
    tool(
      "studio_edit_element",
      {
        ...sourceFields,
        operationId: {
          type: "string",
          description:
            "Optional persistent id. Reusing a started id refuses writes; inspect studio_resume_work first.",
        },
        version: { type: "string" },
        action: {
          type: "string",
          enum: ["add", "rename", "duplicate", "delete", "forward", "backward"],
        },
        kind: { type: "string", enum: ["text", "image", "background"] },
        ...Object.fromEntries(
          ["name", "text", "color", "target", "imagePath", "checksum"].map((key) => [
            key,
            { type: "string" },
          ]),
        ),
      },
      ["sourceFile", "version", "action"],
      true,
    ),
  ];
}

function elementContext(deps: ElementToolDeps, snapshot: StudioLookSnapshot, sourceFile: string) {
  const look = buildStudioLook(snapshot);
  if (!look.ok || !snapshot.projectId) throw new Error("Avaa mainos ensin.");
  const scene = describeScene(
    {
      getClipManifest: () => snapshot.clipManifest ?? null,
      getCompositionPath: () => snapshot.compositionPath,
    },
    sourceFile,
  );
  const affectsInstances =
    sourceFile === (snapshot.compositionPath ?? "index.html")
      ? 1
      : scene
        ? scene.instances.length + scene.unsupported.length
        : 0;
  if (affectsInstances === 0) throw new Error("Kohtausta ei löydy avoimesta mainoksesta.");
  const io = deps.getElementFiles?.();
  if (!io) throw new Error("Elementtien tallennus ei ole käytettävissä.");

  return { io, affectsInstances, projectId: snapshot.projectId };
}
async function verifyShelfImage(projectId: string, image: { path: string; checksum: string }) {
  const response = await fetch(`/api/ari/projects/${encodeURIComponent(projectId)}/images`);
  const shelf = await response.json();
  if (
    !response.ok ||
    !Array.isArray(shelf.assets) ||
    !shelf.assets.some(
      (asset: { path: string; checksum: string }) =>
        asset.path === image.path && asset.checksum === image.checksum,
    )
  )
    throw new Error("Kuva on muuttunut tai puuttuu aineistohyllystä.");
}
