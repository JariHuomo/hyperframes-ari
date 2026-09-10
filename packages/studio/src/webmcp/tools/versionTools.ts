import type { ModelContextTool } from "../types";
import type { ElementToolDeps } from "./elementTools";
import { projectVersions } from "../../utils/projectVersions";
import {
  openVersionComparison,
  restoreComparedVersion,
  versionComparison,
} from "../../ari/versionComparison";
import { toolFailure } from "../toolResult";
export function versionTools(getDeps: () => ElementToolDeps): ModelContextTool[] {
  return [
    { name: "studio_versions", title: "Tallennetut versiot" },
    { name: "studio_save_version", title: "Tallenna tarkistusversio" },
    { name: "studio_compare_versions", title: "Vertaa muutosta" },
    { name: "studio_comparison", title: "Ohjaa vertailua" },
  ].map(({ name, title }) => ({
    name,
    title,
    description:
      "Project-local frozen versions. studio_versions lists IDs; studio_save_version saves a named checkpoint. studio_compare_versions opens beforeId/afterId on one shared interval. studio_comparison action seek(time), play, pause, keep (close without source change), or restore (one undoable restore; stale active revision refuses). Receipts separate persisted restore from preview readiness. No current-asset fallback.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        beforeId: { type: "string" },
        afterId: { type: "string" },
        action: { type: "string", enum: ["seek", "play", "pause", "keep", "restore"] },
        time: { type: "number" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: name === "studio_versions", untrustedContentHint: true },
    execute: async (input) => {
      try {
        const deps = getDeps(),
          projectId = deps.getSnapshot().projectId;
        if (!projectId) throw new Error("Avaa projekti ensin.");
        if (name === "studio_versions")
          return { ok: true, ...(await projectVersions(projectId).list()) };
        if (name === "studio_save_version")
          return await projectVersions(projectId).save(required(input, "name"));
        if (name === "studio_compare_versions")
          return await openVersionComparison(
            projectId,
            required(input, "beforeId"),
            required(input, "afterId"),
          );
        return await controlComparison(getDeps, projectId, input);
      } catch (error) {
        return toolFailure(
          "failed",
          error instanceof Error ? error.message : "Versiotoiminto epäonnistui.",
        );
      }
    },
  }));
}
function required(input: object, key: string) {
  const value = Reflect.get(input, key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Kenttä ${key} puuttuu.`);
  return value;
}

async function controlComparison(getDeps: () => ElementToolDeps, projectId: string, input: object) {
  if (versionComparison.getSnapshot()?.projectId !== projectId)
    throw new Error("Avaa vertailu ensin.");
  const action = required(input, "action");
  if (action === "restore")
    return restoreComparedVersion(getDeps(), () => {
      const current = getDeps();
      if (current.getSnapshot().projectId !== projectId || current.getWriteBlockedReason())
        throw new Error("Avoin projekti tai tallennuksen tila vaihtui.");
    });
  const controls = new Map([
    ["keep", () => versionComparison.close()],
    ["play", () => versionComparison.play(true)],
    ["pause", () => versionComparison.play(false)],
    ["seek", () => seekComparison(input)],
  ]);
  const command = controls.get(action);
  if (!command) throw new Error("Tuntematon vertailutoiminto.");
  command();
  return { ok: true, action, time: versionComparison.getSnapshot()?.time ?? null };
}

function seekComparison(input: object) {
  const time = Reflect.get(input, "time");
  if (typeof time !== "number") throw new Error("Anna aika sekunteina.");
  versionComparison.seek(time);
}
