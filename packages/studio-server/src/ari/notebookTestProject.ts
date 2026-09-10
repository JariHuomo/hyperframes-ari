/**
 * One project, one notebook saver and one operation intent — shared by the
 * write-path gate tests (D5 repair rounds, D6 stop) so both meet exactly the
 * same choke point rather than two similar-looking imitations of it.
 */
import { versionTestProject } from "./versionTestProject.js";
import { readNotebook, saveNotebook } from "./notebook.js";
import { projectVersionFiles, sourceRevision } from "./versionFiles.js";

export function notebookTestProject(source: string) {
  const root = versionTestProject({ "index.html": source });
  const save = (input: object) =>
    saveNotebook(root, { expectedToken: readNotebook(root).token, ...input });
  const intent = (id: string, after: string, before = source) => ({
    id,
    label: "Muokkaa elementtejä",
    kind: "source" as const,
    baseRevision: sourceRevision(projectVersionFiles(root)),
    files: { "index.html": { before, after } },
  });
  return { root, save, intent };
}
