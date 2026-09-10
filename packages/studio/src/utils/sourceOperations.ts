import { studioWriteHeaders } from "./studioFileVersion";
import type { RecordEditInput } from "./studioFileHistory";
const projects = new WeakMap<object, string>();
export function bindOperationHistory(history: object, projectId: string) {
  projects.set(history, projectId);
}
export class UncertainSourceOperation extends Error {
  constructor() {
    super(
      "Tallennuksen tulosta ei voitu varmistaa. Avaa Muistikirja ja valitse Jatka työtä ennen uutta muutosta.",
    );
  }
}
export async function operationRequest(projectId: string, path: string, body?: object) {
  const response = await fetch(
    `/api/ari/projects/${encodeURIComponent(projectId)}/versions/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error ?? "Toiminnon tulosta ei voitu lukea.");
  return data;
}
/** Called inside the existing source queue and before its first write. */
export async function prepareTrackedEdit<T extends string | null>(
  owner: object,
  entry: RecordEditInput<T>,
  diskContent?: Record<string, T>,
) {
  const projectId = projects.get(owner);
  // Custom/local adapters and legacy mutations already applied on the server are not resumable.
  if (!projectId || diskContent) return entry;
  const index = await operationRequest(projectId, "index");
  const operationId = entry.operationId ?? crypto.randomUUID();
  await operationRequest(projectId, "operations", {
    id: operationId,
    label: entry.label,
    kind: entry.kind,
    baseRevision: index.revision,
    files: entry.files,
  });
  return { ...entry, operationId, coalesceKey: undefined, coalesceMs: undefined };
}

export function optionalOperationId(input: object): string | undefined {
  const id = Reflect.get(input, "operationId");
  if (id === undefined) return undefined;
  if (typeof id !== "string") throw new Error("Toiminnon tunniste ei kelpaa.");
  return id;
}

export function trackedOperationWriter<T extends string | null>(
  owner: object,
  entry: RecordEditInput<T>,
  fallback: (path: string, content: T, expected?: T) => Promise<void>,
) {
  const projectId = projects.get(owner);
  return async (path: string, content: T, expected?: T) => {
    if (!projectId || !entry.operationId || content !== entry.files[path]?.after)
      return fallback(path, content, expected);
    const response = await fetch(
      `/api/ari/projects/${encodeURIComponent(projectId)}/versions/operations/write`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
        body: JSON.stringify({ id: entry.operationId, path }),
      },
    ).catch(() => {
      throw new UncertainSourceOperation();
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? "Lähdekirjoitus epäonnistui.");
    }
  };
}

export function hasOperationHistory(owner: object) {
  return projects.has(owner);
}
