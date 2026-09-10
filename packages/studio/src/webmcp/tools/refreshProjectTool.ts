import { elementTools, type ElementToolDeps } from "./elementTools";
import { projectVersions } from "../../utils/projectVersions";
import { toolFailure } from "../toolResult";
import type { ModelContextTool } from "../types";

/** A checked read replaces both history stacks and the server publication token. */
export function refreshProjectTool(getDeps: () => ElementToolDeps): ModelContextTool {
  return {
    name: "studio_refresh_project",
    title: "Päivitä tilanne",
    description:
      "Reload the active project's complete persisted undo/redo history and current source-backed elements and image shelf. Use after another editor's change. Preserves unsaved form drafts and selection; performs no source write. Refuses a project changed during the read. Returns source version and project revision. Continue using the returned element version.",
    inputSchema: {
      type: "object",
      properties: { sourceFile: { type: "string" } },
      required: ["sourceFile"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, context) => {
      try {
        const deps = getDeps();
        const projectId = deps.getSnapshot().projectId;
        if (!projectId || !deps.refreshProject) throw new Error("Avaa mainos ennen päivittämistä.");
        let result: object = {};
        await deps.refreshProject(async () => {
          const elements = await elementTools(getDeps)[0]!.execute(input, context);
          assertElementRead(elements);
          const assets = await readImageShelf(projectId);
          const index = await projectVersions(projectId).list();
          if (context.signal.aborted || getDeps().getSnapshot().projectId !== projectId)
            throw new Error("Avoin mainos vaihtui päivityksen aikana.");
          result = {
            ...elements,
            assets,
            projectId,
            revision: index.revision,
            undoCount: index.history?.undo.length ?? 0,
            redoCount: index.history?.redo.length ?? 0,
            stage: "refreshed",
          };
        });
        return result;
      } catch (error) {
        return toolFailure(
          "failed",
          error instanceof Error ? error.message : "Päivitys epäonnistui.",
        );
      }
    },
  };
}

function assertElementRead(elements: unknown): asserts elements is object {
  if (!elements || typeof elements !== "object" || Reflect.get(elements, "ok") !== true)
    throw new Error(
      String(Reflect.get(Object(elements), "reason") ?? "Elementtejä ei voitu lukea."),
    );
}

async function readImageShelf(projectId: string) {
  const response = await fetch(`/api/ari/projects/${encodeURIComponent(projectId)}/images`);
  const shelf = await response.json();
  if (!response.ok || shelf.ok !== true) throw new Error("Aineistoja ei voitu lukea.");
  return shelf.assets;
}
