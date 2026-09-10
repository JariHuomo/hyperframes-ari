import { openComposition, type GsapTweenSpec } from "@hyperframes/sdk";
import { persistSdkSerialize, type CutoverDeps } from "./sdkEditTransaction";
import { hasOperationHistory } from "./sourceOperations";

/** Source-backed metadata/delete path, including nested files with no active SDK session. */
export async function persistTrackedGsapEdit(
  path: string,
  animationId: string,
  updates: Partial<GsapTweenSpec> | null,
  deps: CutoverDeps | null | undefined,
) {
  if (!deps?.readProjectFile || !hasOperationHistory(deps.editHistory.recordEdit)) return false;
  const expected = await deps.readProjectFile(path);
  await persistSdkSerialize(
    async (before) => {
      if (before !== expected) throw new Error("Liikkeen lähde muuttui. Päivitä tilanne.");
      const candidate = await openComposition(before, { history: false });
      try {
        if (!candidate.getAllAnimationIds().has(animationId))
          throw new Error("Liike on poistettu tai muuttunut. Valitse se uudelleen.");
        if (updates === null) candidate.removeGsapTween(animationId);
        else candidate.setGsapTween(animationId, updates);
        return candidate.serialize();
      } finally {
        candidate.dispose();
      }
    },
    path,
    expected,
    deps,
    { label: updates === null ? "Poista liike" : "Muokkaa liikettä" },
  );
  return true;
}
