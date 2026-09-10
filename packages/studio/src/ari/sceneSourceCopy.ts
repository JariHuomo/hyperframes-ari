import { parseSceneHost, resolveScenePath, type SceneOperation } from "./sceneStructure";
import type { readSceneStructure } from "./sceneOperations";

/** A sibling file preserves every relative URL and authored selector byte-for-byte.
 * The runtime scopes IDs and timeline registration separately for each host.
 * Shared media/styles are read-only dependencies of the supported content editor.
 */
export function detachSceneSource(
  before: Awaited<ReturnType<typeof readSceneStructure>>,
  hostFile: string,
  operation: Extract<SceneOperation, { action: "detach" }>,
) {
  const row = before.rows.find((candidate) => candidate.target === operation.target);
  if (!row) throw new Error("Kohtaus on poistettu tai valinta on vanhentunut.");
  if (!/^[a-z0-9][a-z0-9-]{0,70}\.html$/.test(operation.fileName))
    throw new Error(
      "Anna kopion tiedostonimi: pienet kirjaimet, numerot ja yhdysmerkki sekä .html.",
    );
  const content = before.sources[row.sourceFile];
  if (content == null) throw new Error("Kohtauksen lähde on poistettu.");
  const child = new DOMParser().parseFromString(content, "text/html");
  if (child.querySelector("[data-composition-src]"))
    throw new Error(
      "Kohtaus sisältää muita kohtauslähteitä. Niiden erillistä kopiointia ei vielä tueta.",
    );
  const path = resolveScenePath(row.sourceFile, operation.fileName);
  const { doc, nodes } = parseSceneHost(before.source, hostFile);
  const node = nodes.find((candidate) => candidate.getAttribute("data-hf-id") === row.target)!;
  const relative = node.getAttribute("data-composition-src")!;
  node.setAttribute(
    "data-composition-src",
    relative.slice(0, relative.lastIndexOf("/") + 1) + operation.fileName,
  );
  const after = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  return {
    after,
    created: { path, content },
    target: row.target,
    deleted: false,
    beforeDuration: before.duration,
    afterDuration: before.duration,
    rows: parseSceneHost(after, hostFile).rows,
  };
}
