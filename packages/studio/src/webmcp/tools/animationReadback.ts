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
function effectiveEase(animation: GsapAnimation | undefined): string | null {
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

type AddedMotion = Extract<ExpectedMotion, { kind: "add" }>;

function addedAnimation(
  before: AnimationSourceSnapshot,
  after: AnimationSourceSnapshot,
  expected: AddedMotion,
) {
  return after.animations.find((a) => {
    if (before.animations.some((b) => b.id === a.id)) return false;
    return typeof a.position === "number" && Math.abs(a.position - expected.position) < 0.002;
  });
}

function readbackAnimation(
  before: AnimationSourceSnapshot,
  after: AnimationSourceSnapshot,
  expected: ExpectedMotion,
) {
  if (expected.kind === "add") return addedAnimation(before, after, expected);
  if (expected.kind === "delete")
    return after.animations.find((a) => a.id === expected.animationId);
  // Parser ids change with timing; preserve the source-order slot for updates.
  const index = before.animations.findIndex((a) => a.id === expected.animationId);
  return after.animations[index];
}

function optionalMethodMatches(actual: string, requested: string | undefined) {
  return requested === undefined || actual === requested;
}
function optionalDurationMatches(actual: number | undefined, requested: number | undefined) {
  return requested === undefined || Math.abs((actual ?? -1) - requested) < 0.002;
}
function optionalEaseMatches(actual: string | undefined, requested: string | undefined) {
  return requested === undefined || easeMatches(requested, actual);
}
function requestedAddMatches(animation: GsapAnimation, expected: AddedMotion): boolean {
  const fieldsMatch = [
    optionalMethodMatches(animation.method, expected.method),
    optionalDurationMatches(animation.duration, expected.duration),
    optionalEaseMatches(animation.ease, expected.ease),
  ].every(Boolean);
  if (!fieldsMatch) return false;
  return Object.entries(expected.properties ?? {}).every(
    ([key, value]) => animation.properties[key] === value,
  );
}

function updatedTargetMatches(
  before: AnimationSourceSnapshot,
  after: AnimationSourceSnapshot,
  animation: GsapAnimation,
  expected: Extract<ExpectedMotion, { kind: "update" }>,
): boolean {
  const prior = before.animations.find((a) => a.id === expected.animationId);
  if (!prior || before.animations.length !== after.animations.length) return false;
  return prior.method === animation.method && prior.targetSelector === animation.targetSelector;
}

function keyframeMatches(
  animation: GsapAnimation | undefined,
  expected: Extract<ExpectedMotion, { kind: "keyframe" }>,
): boolean {
  const keyframe = animation?.keyframes?.keyframes.find(
    (k) => Math.abs(k.percentage - expected.percent) < 0.01,
  );
  return Boolean(
    keyframe &&
    Object.entries(expected.properties).every(([key, value]) => keyframe.properties[key] === value),
  );
}

const READBACK_MISMATCH =
  "Tallennettu liike ei vastaa pyyntöä. Tarkista kohde ennen uutta yritystä.";
function addedReadbackFailure(
  before: AnimationSourceSnapshot,
  after: AnimationSourceSnapshot,
  animation: GsapAnimation | undefined,
  expected: AddedMotion,
) {
  if (!animation || after.animations.length !== before.animations.length + 1)
    return "Tallennettu liike ei vastaa valittuja asetuksia.";
  return requestedAddMatches(animation, expected)
    ? null
    : "Tallennettu liike ei vastaa valittuja asetuksia.";
}
function updatedReadbackFailure(
  before: AnimationSourceSnapshot,
  after: AnimationSourceSnapshot,
  animation: GsapAnimation | undefined,
  expected: Extract<ExpectedMotion, { kind: "update" }>,
) {
  if (!animation || !updatedTargetMatches(before, after, animation, expected))
    return "Liikkeen kohde muuttui tallennuksen aikana.";
  return Object.entries(expected.updates).every(([key, value]) =>
    updateFieldMatches(animation, key, value),
  )
    ? null
    : READBACK_MISMATCH;
}
function readbackFailure(
  before: AnimationSourceSnapshot,
  after: AnimationSourceSnapshot,
  animation: GsapAnimation | undefined,
  expected: ExpectedMotion,
): string | null {
  switch (expected.kind) {
    case "delete":
      return !animation && after.animations.length === before.animations.length - 1
        ? null
        : READBACK_MISMATCH;
    case "add":
      return addedReadbackFailure(before, after, animation, expected);
    case "keyframe":
      return keyframeMatches(animation, expected)
        ? null
        : "Avainruudun tallennusta ei voitu varmistaa.";
    case "update":
      return updatedReadbackFailure(before, after, animation, expected);
  }
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
  const animation = readbackAnimation(before, after, expected);
  const failure = readbackFailure(before, after, animation, expected);
  if (failure) return toolFailure("failed", failure);
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
