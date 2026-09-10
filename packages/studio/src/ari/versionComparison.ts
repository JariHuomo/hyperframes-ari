import { readElements } from "./elementOperations";
import { projectVersions, restoreProjectVersion } from "../utils/projectVersions";
import type { ElementToolDeps } from "../webmcp/tools/elementTools";
import type { FrozenVersion } from "../../../studio-server/src/ari/versionTypes";
export interface VersionPreview {
  version: FrozenVersion;
  html: string;
  width: number;
  height: number;
  duration: number;
}
interface Comparison {
  projectId: string;
  before: VersionPreview;
  after: VersionPreview;
  time: number;
  playing: boolean;
  duration: number;
  expectedRevision: string;
}
let state: Comparison | null = null;
let generation = 0;
const listeners = new Set<() => void>();
function publish(next: Comparison | null) {
  state = next;
  listeners.forEach((listener) => listener());
}
export const versionComparison = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  close: () => {
    generation++;
    publish(null);
  },
  seek(time: number) {
    if (!state || !Number.isFinite(time) || time < 0 || time > state.duration)
      throw new Error("Aika ei kuulu yhteiseen aikaväliin.");
    publish({ ...state, time, playing: false });
  },
  advance(time: number) {
    if (!state?.playing) return;
    if (!Number.isFinite(time) || time < 0 || time > state.duration)
      throw new Error("Aika ei kuulu yhteiseen aikaväliin.");
    publish({ ...state, time, playing: time < state.duration });
  },
  play(playing: boolean) {
    if (state) publish({ ...state, playing });
  },
};
async function preview(projectId: string, id: string): Promise<VersionPreview> {
  const response = await fetch(
    `/api/ari/projects/${encodeURIComponent(projectId)}/versions/preview/${encodeURIComponent(id)}`,
  );
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(data.error ?? "Versiota ei voi toistaa.");
  return data;
}
export async function openVersionComparison(projectId: string, beforeId: string, afterId: string) {
  versionComparison.close();
  const current = generation;
  if (beforeId === afterId) throw new Error("Valitse kaksi eri versiota.");
  const [before, after, index] = await Promise.all([
    preview(projectId, beforeId),
    preview(projectId, afterId),
    projectVersions(projectId).list(),
  ]);
  if (before.width * after.height !== after.width * before.height)
    throw new Error("Versioiden kuvasuhteet poikkeavat toisistaan.");
  const comparison = {
    projectId,
    before,
    after,
    duration: Math.min(before.duration, after.duration),
    time: 0,
    playing: false,
    expectedRevision: index.revision,
  };
  if (current !== generation) throw new Error("Vertailun avaaminen keskeytyi.");
  publish(comparison);
  return { ok: true, beforeId, afterId, duration: comparison.duration, revision: index.revision };
}
export async function restoreComparedVersion(
  deps: ElementToolDeps,
  assertActive: () => void = () => {},
) {
  const comparison = state;
  const snapshot = deps.getSnapshot();
  const io = deps.getElementFiles?.();
  if (
    !comparison ||
    !io ||
    snapshot.projectId !== comparison.projectId ||
    deps.getWriteBlockedReason()
  )
    throw new Error("Avaa vertailu nykyiseen projektiin ennen palautusta.");
  const revision = deps.getSelectionRevision?.();
  const selection = snapshot.selection;
  const prepared = await projectVersions(comparison.projectId).prepareRestore(
    comparison.before.version.id,
  );
  if (prepared.expectedRevision !== comparison.expectedRevision)
    throw new Error("Projekti muuttui vertailun aikana. Avaa vertailu uudelleen.");
  if (deps.getSnapshot().projectId !== comparison.projectId)
    throw new Error("Avoin projekti vaihtui.");
  const receipt = await restoreProjectVersion(
    comparison.projectId,
    prepared,
    io.recordEdit,
    io.writeFile,
    assertActive,
  );
  versionComparison.close();
  try {
    const sourceFile = selection?.sourceFile ?? snapshot.compositionPath ?? "index.html";
    const source = await io.readFile(sourceFile);
    const exists =
      selection &&
      source !== null &&
      (await readElements(source)).some((element) => element.target === selection.hfId);
    const previewReady = await deps.elementsSaved?.({
      target: selection?.hfId ?? "",
      sourceFile,
      deleted: !exists,
      selectionRevision: revision,
    });
    return { ok: true, stage: "saved", ...receipt, previewReady };
  } catch (error) {
    return {
      ok: true,
      stage: "saved",
      ...receipt,
      previewReady: false,
      previewReason: error instanceof Error ? error.message : "Esikatselu ei valmistunut.",
    };
  }
}
