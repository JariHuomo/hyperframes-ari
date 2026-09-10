import { operationRequest } from "../../utils/sourceOperations";
import type { ModelContextTool } from "../types";
import { toolFailure } from "../toolResult";
const string = { type: "string" };
const fields = {
  action: {
    type: "string",
    enum: [
      "brief",
      "assets",
      "task",
      "task_status",
      "observation",
      "repair_limit",
      "active_repair",
      "repair_plan",
      "lock",
      "unlock",
      "authority",
      "stop_work",
      "resume_work",
      "approval",
    ],
  },
  expectedToken: { type: ["string", "null"] },
  goal: string,
  texts: string,
  text: string,
  id: string,
  status: { type: "string", enum: ["next", "active", "done"] },
  assets: {
    type: "array",
    items: {
      type: "object",
      properties: { path: string, checksum: string },
      required: ["path", "checksum"],
      additionalProperties: false,
    },
  },
  author: string,
  authorType: { type: "string", enum: ["human", "external_agent", "technical"] },
  revision: string,
  coverage: string,
  limit: { type: "integer", minimum: 0, maximum: 20 },
  label: string,
  taskId: string,
  granted: { type: "boolean" },
  remaining: string,
  suggestion: string,
  by: string,
  byType: { type: "string", enum: ["human", "external_agent", "test_data"] },
  reason: string,
  versionId: string,
  packageId: string,
  decision: { type: "string", enum: ["approved", "rejected"] },
  approver: string,
  approverType: { type: "string", enum: ["human", "external_agent", "test_data"] },
  note: string,
  notApplicable: {
    type: "array",
    items: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["message", "layout", "motion", "audio"] },
        reason: string,
      },
      required: ["category", "reason"],
      additionalProperties: false,
    },
  },
};
/** UI and agent share these constrained commands, never a raw source writer. */
export function notebookTools(getProjectId: () => string | null): ModelContextTool[] {
  return [
    ...[false, true].map<ModelContextTool>((write) => ({
      name: write ? "studio_update_notebook" : "studio_notebook",
      title: write ? "Tallenna muistikirjaan" : "Lue muistikirja",
      description: write
        ? "Conditionally update the active project notebook using expectedToken from studio_notebook. brief needs goal/texts; assets needs verified imported path/checksum pairs; task needs text; task_status needs id/status; observation needs author, authorType, revision, coverage and text. Observations are append-only and version-bound. repair_limit sets the per-task repair-round ceiling (product default 2); active_repair names the task whose repair rounds the next tracked source writes consume, or \"\" for none; repair_plan records that task's remaining gap and next suggestion; lock stores an approved text (label/text) that the shared write path then protects; unlock removes it; authority grants or revokes one task's explicit mandate over one lock. stop_work and resume_work need by, byType and reason; a stop refuses the NEXT tracked source write from the UI and from these tools alike, while the notebook, observations, assessments and approvals stay writable. approval needs versionId, decision, approver, approverType and note; approving also needs packageId for a readable review package bound to that version and a stated position on all four assessment categories, either an assessment or notApplicable with a reason. A rejected version cannot be approved later, and no approval is a customer release. Manual tasks are not source-write receipts. No ad source/history mutation or safe operation retry."
        : "Read the active project notebook, token, source revision and stale observation ids. Includes manual tasks, agreed copy, selected assets, approved-text locks, per-task repair rounds used against the limit, the refusal receipts the shared write path left, the work-stop state with its history, every local version approval with its staleness, and the export receipt for the current revision (approved or draft; always a local file, never a customer release). Does not resume or retry source writes.",
      inputSchema: {
        type: "object",
        properties: write ? fields : {},
        required: write ? ["action", "expectedToken"] : [],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: !write, untrustedContentHint: true },
      execute: async (input, context) => {
        try {
          const id = getProjectId();
          if (!id || context.signal.aborted) throw new Error("Avaa mainos ennen muistikirjaa.");
          const result = await requestNotebook(id, write, input);
          return { ...result, projectId: id };
        } catch (error) {
          return toolFailure(
            "failed",
            error instanceof Error ? error.message : "Muistikirjan toiminto epäonnistui.",
          );
        }
      },
    })),
    {
      name: "studio_resume_work",
      title: "Jatka työtä",
      description:
        "Reconcile persisted source operation IDs against durable history receipts and current source revision. Completed operations are never replayed. Uncertain operations forbid automatic retry; matching text is not execution evidence. Reads only; no source write or quality approval.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (_input, context) => {
        try {
          const id = getProjectId();
          if (!id || context.signal.aborted) throw new Error("Avaa mainos ennen jatkamista.");
          return {
            ...(await operationRequest(id, "operations")),
            projectId: id,
            sourceChanged: false,
          };
        } catch (error) {
          return toolFailure(
            "failed",
            error instanceof Error ? error.message : "Tuloksen selvittäminen epäonnistui.",
          );
        }
      },
    },
  ];
}

async function requestNotebook(id: string, write: boolean, input: object) {
  const response = await fetch(
    `/api/ari/projects/${encodeURIComponent(id)}/notebook`,
    write
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      : undefined,
  );
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") throw new Error("Muistikirjaa ei voitu lukea.");
  if (!response.ok || Reflect.get(result, "ok") !== true)
    throw new Error(String(Reflect.get(result, "error") ?? "Muistikirjaa ei voitu tallentaa."));
  return result;
}
