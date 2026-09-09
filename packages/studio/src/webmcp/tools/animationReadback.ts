/** Ari: source readback, not a timer or a successful dispatch, proves motion saves. */
import type { DomEditSelection } from "../../components/editor/domEditingTypes";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { fetchParsedAnimations, getAnimationsForElement } from "../../hooks/useGsapTweenCache";
import { readFileContent } from "../../hooks/timelineTimingSync";
import { studioFileContentVersion } from "../../utils/studioFileVersion";
import { dispatched, verified } from "../writeCoordinator";
import { toolFailure } from "../toolResult";
import { easeCurveOf, easeMatches } from "../easeContract";

export interface AnimationSourceSnapshot {
  sourceFile: string;
  version: string;
  animations: GsapAnimation[];
}
export async function readAnimationSource(
  projectId: string,
  selection: DomEditSelection,
): Promise<AnimationSourceSnapshot> {
  const sourceFile = selection.sourceFile || "index.html";
  const content = await readFileContent(projectId, sourceFile);
  const parsed = await fetchParsedAnimations(projectId, sourceFile, { fresh: true });
  const after = await readFileContent(projectId, sourceFile);
  if (!parsed || content !== after)
    throw new Error("Lähde muuttui tarkistuksen aikana. Lue kohde uudelleen.");
  return {
    sourceFile,
    version: await studioFileContentVersion(content),
    animations: getAnimationsForElement(parsed.animations, selection, selection.element),
  };
}
type ExpectedMotion =
  | {
      kind: "add";
      position: number;
      method?: string;
      duration?: number;
      ease?: string;
      properties?: Record<string, number>;
    }
  | {
      kind: "update";
      animationId: string;
      updates: { duration?: number; ease?: string; easeEach?: string; position?: number };
    }
  | { kind: "delete"; animationId: string }
  | {
      kind: "keyframe";
      animationId: string;
      percent: number;
      properties: Record<string, number | string>;
    };
/** The ease that actually governs this tween: a keyframe tween's feel lives in
 * `keyframes.easeEach`, exactly as `AnimationCard` reads it. */
export function effectiveEase(animation: GsapAnimation | undefined): string | null {
  if (!animation) return null;
  return animation.keyframes?.easeEach ?? animation.ease ?? null;
}

/** One requested field against the saved tween. Eases compare in normalised
 * form because the persist paths round decimals; times compare with the same
 * tolerance as the rest of this file. */
function updateFieldMatches(animation: GsapAnimation, key: string, requested: unknown): boolean {
  if (key === "ease") return easeMatches(String(requested), animation.ease);
  if (key === "easeEach") return easeMatches(String(requested), animation.keyframes?.easeEach);
  const actual: unknown = Reflect.get(animation, key);
  if (typeof requested === "number" && typeof actual === "number") {
    return Math.abs(requested - actual) < 0.002;
  }
  return requested === actual;
}

export async function settleAnimationWrite<T extends object>(
  deps: { readAnimationSource?: (selection: DomEditSelection) => Promise<AnimationSourceSnapshot> },
  selection: DomEditSelection,
  before: AnimationSourceSnapshot | undefined,
  value: T,
  expected: ExpectedMotion,
) {
  if (!before || !deps.readAnimationSource) return dispatched(value, false);
  const after = await deps.readAnimationSource(selection);
  // Parser ids include authored timing. Moving a tween gives it a new id;
  // preserve its source-order slot and check the target, method and values.
  const priorIndex =
    expected.kind === "add"
      ? -1
      : before.animations.findIndex((a) => a.id === expected.animationId);
  const prior = before.animations[priorIndex];
  const animation =
    expected.kind === "add"
      ? after.animations.find(
          (a) =>
            !before.animations.some((b) => b.id === a.id) &&
            typeof a.position === "number" &&
            Math.abs(a.position - expected.position) < 0.002,
        )
      : expected.kind === "update" || expected.kind === "keyframe"
        ? after.animations[priorIndex]
        : after.animations.find((a) => a.id === expected.animationId);
  if (
    expected.kind === "update" &&
    (!prior ||
      !animation ||
      before.animations.length !== after.animations.length ||
      prior.method !== animation.method ||
      prior.targetSelector !== animation.targetSelector)
  )
    return toolFailure("failed", "Liikkeen kohde muuttui tallennuksen aikana.");
  if (
    expected.kind === "add" &&
    (!animation ||
      after.animations.length !== before.animations.length + 1 ||
      (expected.method !== undefined && animation.method !== expected.method) ||
      (expected.duration !== undefined &&
        Math.abs((animation.duration ?? -1) - expected.duration) >= 0.002) ||
      (expected.ease !== undefined && !easeMatches(expected.ease, animation.ease)) ||
      (expected.properties &&
        !Object.entries(expected.properties).every(([key, v]) => animation.properties[key] === v)))
  )
    return toolFailure("failed", "Tallennettu liike ei vastaa valittuja asetuksia.");
  const keyframe = animation?.keyframes?.keyframes.find(
    (k) => Math.abs(k.percentage - (expected.kind === "keyframe" ? expected.percent : -1)) < 0.01,
  );
  if (
    expected.kind === "keyframe" &&
    (!keyframe ||
      !Object.entries(expected.properties).every(([key, v]) => keyframe.properties[key] === v))
  )
    return toolFailure("failed", "Avainruudun tallennusta ei voitu varmistaa.");
  const matches =
    expected.kind === "delete"
      ? !animation && after.animations.length === before.animations.length - 1
      : Boolean(animation) &&
        (expected.kind !== "update" ||
          Object.entries(expected.updates).every(
            ([key, v]) => animation !== undefined && updateFieldMatches(animation, key, v),
          ));
  if (!matches)
    return toolFailure(
      "failed",
      "Tallennettu liike ei vastaa pyyntöä. Tarkista kohde ennen uutta yritystä.",
    );
  const curve = easeCurveOf(effectiveEase(animation));
  const receipt = verified(
    {
      ...value,
      ...(animation ? { animationId: animation.id, animation } : {}),
      ...(curve ? { easeCurve: curve } : {}),
    },
    {
      sourceFile: after.sourceFile,
      version: after.version,
      changed: before.version !== after.version,
    },
    { before: before.animations, after: after.animations },
  );
  Reflect.deleteProperty(receipt, "dispatched");
  return receipt;
}
