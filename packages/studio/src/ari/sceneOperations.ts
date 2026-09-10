import { detachSceneSource } from "./sceneSourceCopy";
import { editSceneHost, parseSceneHost, type SceneOperation } from "./sceneStructure";
import type { ElementFiles } from "./elementOperations";
import { saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import { studioFileContentVersion } from "../utils/studioFileVersion";

export async function readSceneStructure(io: ElementFiles, sourceFile: string) {
  const source = await io.readFile(sourceFile);
  if (source === null) throw new Error("Kooste on poistettu.");
  const state = parseSceneHost(source, sourceFile);
  const sources: Record<string, string | null> = { [sourceFile]: source };
  for (const row of state.rows) {
    if (row.sourceFile === sourceFile) throw new Error("Kooste ei voi sisältää itseään.");
    const content = await io.readFile(row.sourceFile);
    if (content === null) throw new Error("Kohtauksen lähde on poistettu.");
    const child = new DOMParser()
      .parseFromString(content, "text/html")
      .querySelector("[data-composition-id]");
    const duration = Number(child?.getAttribute("data-duration"));
    if (
      !child ||
      !Number.isFinite(duration) ||
      row.playbackStart + row.duration * row.playbackRate > duration + 0.000001
    )
      throw new Error("Kohtauksen näkyvä ikkuna ylittää lähteen keston.");
    sources[row.sourceFile] = content;
  }
  return {
    source,
    sources,
    rows: state.rows,
    duration: state.duration,
    baseDuration: state.baseDuration,
  };
}
export async function prepareSceneOperation(
  io: ElementFiles,
  sourceFile: string,
  operation: SceneOperation,
) {
  const before = await readSceneStructure(io, sourceFile);
  const candidate =
    operation.action === "detach"
      ? detachSceneSource(before, sourceFile, operation)
      : editSceneHost(before.source, sourceFile, operation);
  if (candidate.created) {
    const existing = await io.readFile(candidate.created.path);
    if (existing !== null)
      throw new Error("Kohtauksen tiedosto on jo olemassa. Valitse toinen tiedoston nimi.");
    before.sources[candidate.created.path] = null;
  }
  const reviewVersion = await studioFileContentVersion(
    JSON.stringify({ sourceFile, operation, sources: before.sources }),
  );
  const selected = candidate.rows.find((row) => row.target === candidate.target);
  const sharedSources = Object.entries(
    candidate.rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.sourceFile] = (counts[row.sourceFile] ?? 0) + 1;
      return counts;
    }, {}),
  ).map(([path, instances]) => ({
    sourceFile: path,
    instances,
    name: candidate.rows.find((row) => row.sourceFile === path)?.name ?? "Kohtaus",
  }));
  return {
    candidate,
    sources: before.sources,
    review: {
      ok: true,
      sourceFile,
      reviewVersion,
      target: candidate.target,
      deleted: candidate.deleted,
      beforeDuration: candidate.beforeDuration,
      afterDuration: candidate.afterDuration,
      baseDuration: before.baseDuration,
      rows: candidate.rows,
      sharedSources,
      createdSource: candidate.created?.path ?? null,
      affectsInstances: selected
        ? (sharedSources.find((s) => s.sourceFile === selected.sourceFile)?.instances ?? 1)
        : 1,
      sourcePolicy:
        operation.action === "detach"
          ? "Vain valittu esiintymä saa oman sisällön. Muiden esiintymien lähde ja kaikkien ajoitus säilyvät. Kuvat ja tyylit säilyvät samoina; kopion sisältöä voi muokata erikseen."
          : "Kopio lisää esiintymän samasta lähteestä. Poisto säilyttää yhteisen sisällön. Alkuperäinen aloitussisältö säilyy; kohtausjono sijoitetaan sen perään ilman aukkoja.",
    },
  };
}
export async function saveSceneOperation(input: {
  operationId?: string;
  projectId: string;
  sourceFile: string;
  operation: SceneOperation;
  reviewVersion: string;
  io: ElementFiles;
  assertActive: () => void;
}) {
  const { io, sourceFile } = input;
  input.assertActive();
  const plan = await prepareSceneOperation(io, sourceFile, input.operation);
  if (plan.review.reviewVersion !== input.reviewVersion)
    throw new Error("Kooste tai kohtauksen lähde on muuttunut. Tarkista vaikutus uudelleen.");
  const files: Record<string, string | null> = {};
  if (plan.candidate.created) files[plan.candidate.created.path] = plan.candidate.created.content;
  files[sourceFile] = plan.candidate.after;
  const checkSources = async () => {
    input.assertActive();
    for (const [path, expected] of Object.entries(plan.sources)) {
      if ((await io.readFile(path)) !== expected)
        throw new Error("Kooste tai kohtauksen lähde muuttui tallennuksen aikana.");
    }
  };
  await checkSources();
  const savedPaths = await saveProjectFilesWithHistory({
    operationId: input.operationId,
    projectId: input.projectId,
    label: "Muokkaa kohtausjonoa",
    kind: "source",
    files,
    readFile: async (path) => {
      await checkSources();
      return plan.sources[path]!;
    },
    writeFile: io.writeFile,
    operationOwner: io.recordEdit,
    recordEdit: async (entry) => {
      input.assertActive();
      for (const [path, expected] of Object.entries(plan.sources)) {
        if ((await io.readFile(path)) !== (path in files ? files[path] : expected))
          throw new Error("Kohtauksen lähde muuttui tallennuksen aikana.");
      }
      await io.recordEdit(entry);
    },
  });
  const versions = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        if ((await io.readFile(path)) !== content)
          throw new Error("Tallennetun kohtausjonon tarkistus epäonnistui.");
        return [path, content === null ? null : await studioFileContentVersion(content)];
      }),
    ),
  );
  return {
    ...plan.review,
    stage: "saved",
    operationId: savedPaths.operationId,
    version: versions[sourceFile],
    versions,
  };
}
