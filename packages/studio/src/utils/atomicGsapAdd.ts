import { openComposition, type GsapTweenSpec } from "@hyperframes/sdk";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { persistSdkSerialize, type CutoverDeps } from "./sdkEditTransaction";

/** One candidate, one conditional write, one exact before/after history entry.
 * No live DOM or SDK session is mutated while the candidate is being prepared.
 */
export async function persistAtomicGsapAdd(
  selection: DomEditSelection,
  autoId: string | undefined,
  spec: GsapTweenSpec,
  path: string,
  deps: CutoverDeps,
): Promise<void> {
  const hfId = selection.hfId;
  if (!hfId || !deps.readProjectFile) throw new Error("Valitse kohde uudelleen ennen tallennusta.");
  const expected = await deps.readProjectFile(path);
  await persistSdkSerialize(
    async (before) => {
      if (before !== expected)
        throw new Error("Lähde muuttui. Lue tilanne uudelleen ennen tallennusta.");
      const candidate = await openComposition(before, { history: false });
      try {
        if (!candidate.getElement(hfId))
          throw new Error("Kohde on poistettu. Valitse kohde uudelleen.");
        if (autoId)
          candidate.dispatch({ type: "setAttribute", target: hfId, name: "id", value: autoId });
        if (!candidate.addGsapTween(hfId, spec))
          throw new Error("Liikettä ei voitu lisätä. Muutosta ei tallennettu.");
        return candidate.serialize();
      } finally {
        candidate.dispose();
      }
    },
    path,
    expected,
    deps,
    { label: `Add GSAP ${spec.method} animation` },
  );
}
