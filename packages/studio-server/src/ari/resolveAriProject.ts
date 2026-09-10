import type { StudioApiAdapter } from "../types.js";
export async function resolveAriProject(adapter: StudioApiAdapter, id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Projekti ei kelpaa.");
  const project = await adapter.resolveProject(id);
  if (!project) throw new Error("Projektia ei löydy.");
  return project.dir;
}
