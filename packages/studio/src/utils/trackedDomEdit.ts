import { openComposition } from "@hyperframes/sdk";
import { patchOpsToSdkEditOps } from "./sdkOpMapping";
import { shouldDeclineTextCutoverForTarget } from "./sdkCutoverEligibility";
import { hasOperationHistory } from "./sourceOperations";
import {
  saveProjectFilesWithHistory,
  readProjectFileContent,
  type RecordEditInput,
} from "./studioFileHistory";
import { studioFileContentVersion } from "./studioFileVersion";
import type { PatchOperation } from "./sourcePatcher";

export async function persistTrackedDomEdit(input: {
  projectId: string;
  sourceFile: string;
  hfId?: string;
  before: string;
  operations: PatchOperation[];
  label: string;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
  writeFile: (path: string, content: string, expected?: string) => Promise<void>;
}) {
  if (
    !input.hfId ||
    !hasOperationHistory(input.recordEdit) ||
    input.operations.some((op) => op.type === "rich-text")
  )
    return null;
  const composition = await openComposition(input.before, { history: false });
  let after: string;
  try {
    const target = composition.getElement(input.hfId);
    if (!target) throw new Error("Kohde on poistettu. Päivitä tilanne.");
    if (shouldDeclineTextCutoverForTarget(target, input.operations)) return null;
    for (const op of patchOpsToSdkEditOps(input.hfId, input.operations)) composition.dispatch(op);
    after = composition.serialize();
  } finally {
    composition.dispose();
  }
  const changed = after !== input.before;
  if (changed)
    await saveProjectFilesWithHistory({
      projectId: input.projectId,
      label: input.label,
      kind: "manual",
      files: { [input.sourceFile]: after },
      writeFile: input.writeFile,
      recordEdit: input.recordEdit,
      readFile: async (path) => {
        const actual = await readProjectFileContent(input.projectId, path);
        if (actual !== input.before) throw new Error("Mainos muuttui. Päivitä tilanne.");
        return actual;
      },
    });
  return { sourceFile: input.sourceFile, version: await studioFileContentVersion(after), changed };
}
