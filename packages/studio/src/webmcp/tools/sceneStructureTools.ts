import { optionalOperationId } from "../../utils/sourceOperations";
import type { ElementToolDeps } from "./elementTools";
import { readElements, type ElementFiles } from "../../ari/elementOperations";
import { sceneInstanceChoice } from "./animationScene";
import type { ModelContextTool } from "../types";
import { toolFailure } from "../toolResult";
import { mintElementHandle } from "../handles";
import {
  readSceneStructure,
  prepareSceneOperation,
  saveSceneOperation,
} from "../../ari/sceneOperations";
import type { SceneOperation } from "../../ari/sceneStructure";
function text(input: object, key: string) {
  const value = Reflect.get(input, key);
  if (typeof value !== "string") throw new Error(`Kenttä ${key} puuttuu.`);
  return value;
}
function operation(input: object): SceneOperation {
  const action = text(input, "action");
  if (action === "add") {
    const duration = Reflect.get(input, "duration");
    if (typeof duration !== "number") throw new Error("Anna kesto sekunteina.");
    return { action, duration, name: text(input, "name"), fileName: text(input, "fileName") };
  }
  if (action === "detach")
    return { action, target: text(input, "target"), fileName: text(input, "fileName") };
  if (action === "rename")
    return { action, target: text(input, "target"), name: text(input, "name") };
  if (action === "duplicate" || action === "delete" || action === "earlier" || action === "later")
    return { action, target: text(input, "target") };
  throw new Error("Tuntematon kohtausoperaatio.");
}
export function sceneStructureTools(getDeps: () => ElementToolDeps): ModelContextTool[] {
  const properties = {
    sourceFile: { type: "string" },
    action: {
      type: "string",
      enum: ["add", "rename", "duplicate", "detach", "delete", "earlier", "later"],
    },
    target: { type: "string" },
    name: { type: "string" },
    fileName: { type: "string" },
    duration: { type: "number" },
    reviewVersion: { type: "string" },
    operationId: { type: "string" },
  };
  return (["studio_scenes", "studio_prepare_scene", "studio_edit_scene"] as const).map((name) => ({
    name,
    title:
      name === "studio_scenes"
        ? "Lue kohtausjono"
        : name === "studio_prepare_scene"
          ? "Tarkista kohtausmuutos"
          : "Tallenna kohtausmuutos",
    description:
      "Read/prepare/save the active composition's sequential scene hosts. This changes chronological order, not element overlap. Prepare returns exact timing, total duration, shared sources and a reviewVersion; edit requires that reviewVersion and the identical operation. Add creates scenes/<fileName> and host in one undo entry. Detach (Tee oma kopio) takes target and fileName, copies a leaf scene beside its source and changes only that placement in one undo entry; timing and relative assets remain unchanged. Nested scene dependencies refuse. Duplicate adds a shared-source placement; delete retains its source. Constant playback windows are preserved. Overlapping/gapped hosts or host-targeted motion refuse before writing. No arbitrary source input.",
    inputSchema: {
      type: "object",
      properties,
      required: [
        "sourceFile",
        ...(name === "studio_scenes" ? [] : ["action"]),
        ...(name === "studio_edit_scene" ? ["reviewVersion"] : []),
      ],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: name !== "studio_edit_scene", untrustedContentHint: true },
    execute: async (input, { signal }) => {
      try {
        const deps = getDeps(),
          snapshot = deps.getSnapshot();
        const sourceFile = text(input, "sourceFile"),
          pid = snapshot.projectId;
        const context = sceneContext(deps, sourceFile, pid, snapshot.compositionPath);
        const { io, projectId } = context;
        const assertActive = activeGuard(getDeps, projectId, snapshot.compositionPath, signal);
        if (name === "studio_scenes") return sceneListing(io, sourceFile, projectId);
        assertActive();
        const selectionRevision = deps.getSelectionRevision?.();
        const op = operation(input);
        if (name === "studio_prepare_scene")
          return (await prepareSceneOperation(io, sourceFile, op)).review;
        const receipt = await saveSceneOperation({
          operationId: optionalOperationId(input),
          projectId,
          sourceFile,
          operation: op,
          reviewVersion: text(input, "reviewVersion"),
          io,
          assertActive,
        });
        return scenePreviewReceipt(receipt, io, deps, sourceFile, selectionRevision);
      } catch (error) {
        return toolFailure(
          "failed",
          error instanceof Error ? error.message : "Kohtausmuutos epäonnistui.",
        );
      }
    },
  }));
}

async function sceneListing(io: ElementFiles, sourceFile: string, projectId: string) {
  const state = await readSceneStructure(io, sourceFile);
  return {
    ok: true,
    sourceFile,
    duration: state.duration,
    baseDuration: state.baseDuration,
    rows: await Promise.all(
      state.rows.map(async (row) => {
        const selection = (await readElements(state.sources[row.sourceFile]!))[0];
        return {
          ...row,
          selectionTarget: selection?.target,
          handle: selection
            ? mintElementHandle({
                projectId,
                activeCompositionPath: sourceFile,
                sourceFile: row.sourceFile,
                hfId: selection.target,
              })
            : null,
        };
      }),
    ),
  };
}
async function scenePreviewReceipt(
  receipt: Awaited<ReturnType<typeof saveSceneOperation>>,
  io: ElementFiles,
  deps: ElementToolDeps,
  sourceFile: string,
  selectionRevision?: number,
) {
  try {
    const target = await scenePreviewTarget(receipt, io, sourceFile);
    const { selectionTarget, selectionSourceFile, instance } = target;
    if (instance && selectionRevision === deps.getSelectionRevision?.())
      sceneInstanceChoice.choose(selectionSourceFile, instance);
    const previewReady = await deps.elementsSaved?.({ ...target, selectionRevision });
    return { ...receipt, selectionTarget, selectionSourceFile, instance, previewReady };
  } catch (error) {
    // Persistence is already complete; a preview problem cannot turn it into a failed write.
    return {
      ...receipt,
      previewReady: false,
      previewReason: error instanceof Error ? error.message : "Esikatselun valinta ei valmistunut.",
    };
  }
}

async function scenePreviewTarget(
  receipt: Awaited<ReturnType<typeof saveSceneOperation>>,
  io: ElementFiles,
  sourceFile: string,
) {
  const row = receipt.rows.find((row) => row.target === receipt.target);
  const cleared = {
    target: receipt.target,
    sourceFile,
    deleted: true,
    selectionTarget: null,
    selectionSourceFile: sourceFile,
    instance: null,
  };
  if (!row) return cleared;
  const source = await io.readFile(row.sourceFile);
  if (source === null) throw new Error("Kohtauksen lähde poistui tallennuksen jälkeen.");
  const selection = (await readElements(source))[0];
  if (!selection) return cleared;
  return {
    target: selection.target,
    sourceFile: row.sourceFile,
    deleted: false,
    selectionTarget: selection.target,
    selectionSourceFile: row.sourceFile,
    instance: row.hostId,
    previewTime: row.start + Math.min(0.5, row.duration / 2),
  };
}

function activeGuard(
  getDeps: () => ElementToolDeps,
  projectId: string,
  compositionPath: string | null,
  signal: AbortSignal,
) {
  return () => {
    const current = getDeps();
    if (
      signal.aborted ||
      current.getWriteBlockedReason() ||
      current.getSnapshot().projectId !== projectId ||
      current.getSnapshot().compositionPath !== compositionPath
    )
      throw new Error("Avoin kooste tai tallennuksen tila vaihtui.");
  };
}

function sceneContext(
  deps: ElementToolDeps,
  sourceFile: string,
  pid: string | null,
  compositionPath: string | null,
) {
  if (!pid || sourceFile !== (compositionPath ?? "index.html"))
    throw new Error("Avaa muokattavan kohtausjonon oma kooste ensin.");
  const io = deps.getElementFiles?.();
  if (!io) throw new Error("Kohtausten tallennus ei ole käytettävissä.");
  return { io, projectId: pid };
}
