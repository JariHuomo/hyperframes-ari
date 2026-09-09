import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { DomEditCommitOutcome } from "../hooks/domEditCommitRunner";
import { readFileContent } from "../hooks/timelineTimingSync";
import { studioFileContentVersion } from "../utils/studioFileVersion";
/** Add source-version evidence to legacy geometry actors that resolve void. */
export async function withGeometryReadback(
  projectId: string,
  selection: DomEditSelection,
  write: () => Promise<DomEditCommitOutcome | void>,
): Promise<DomEditCommitOutcome> {
  const sourceFile = selection.sourceFile || "index.html";
  const before = await readFileContent(projectId, sourceFile);
  const outcome = await write();
  if (outcome) return outcome;
  const after = await readFileContent(projectId, sourceFile);
  if (before === after) return { ok: false, reason: "persist-failed" };
  return {
    ok: true,
    persistence: { sourceFile, version: await studioFileContentVersion(after), changed: true },
  };
}
