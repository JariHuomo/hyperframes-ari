/**
 * Ari: the closed ease contract.
 *
 * `studio_update_animation` used to accept any string and the receipt compared
 * it to the source by string equality, so a typo like `power2.uot` was written,
 * read back unchanged and reported `verified` — while GSAP silently fell back
 * to its default curve. Nothing in the platform validates tool input against a
 * schema, so the check has to live here, before the write.
 *
 * The vocabulary is mechanical and closed: the Studio ease list, the cubic
 * `custom(...)` path, `spring(b)`, `wiggle(...)` and `hold`. Every branch reuses
 * an existing parser rather than inventing a second interpretation — the
 * runtime that has to play the curve is `core/src/runtime/customEase.ts`, and a
 * curve this module accepts but that one cannot resolve would be a lie.
 *
 * `parseEase` also NORMALISES. That matters for the receipt: the persist paths
 * (`sdkGsapTweenPersist`, `commitMutationSafely`) round decimals, so comparing
 * the requested and saved ease as raw strings fails on a curve that saved
 * perfectly. Comparison goes through `easeMatches`, on normalised form.
 */

import { parseSpringBounce } from "@hyperframes/core/spring-ease";
import { parseWiggleEase, type WiggleEaseConfig } from "@hyperframes/core/wiggle-ease";
import {
  CUSTOM_EASE_DATA_PATTERN,
  STUDIO_GSAP_EASE_OPTIONS,
} from "../components/editor/studioMotionTypes";
import {
  parseStudioCustomEaseData,
  serializeStudioCustomEaseData,
} from "../components/editor/studioMotion";
import { resolveEaseCurveTuple } from "../components/editor/gsapAnimationConstants";

export type EaseKind = "named" | "custom" | "spring" | "wiggle" | "hold";

export interface EaseCurve {
  kind: EaseKind;
  /** The normalised ease string this curve came from. */
  ease: string;
  /** Cubic control points, for the kinds that have them: [x1, y1, x2, y2]. */
  points?: [number, number, number, number];
  /** `spring(b)` bounce, 0 to 1. */
  bounce?: number;
  wiggle?: WiggleEaseConfig;
  /** Finnish display name; falls through to the GSAP token when there is none. */
  label: string;
}

export type ParsedEase = ({ ok: true } & EaseCurve) | { ok: false; reason: string };

/** X controls stay inside the segment; Y may overshoot, which is the point of a
 * bezier ease. The Y range is Studio's own clamp domain — a value outside it
 * would be silently pulled back in, and a silently different curve is worse
 * than a refusal. */
const CUSTOM_Y_MIN = -0.6;
const CUSTOM_Y_MAX = 1.6;

const EASE_LABELS_FI: Record<string, string> = {
  none: "Tasainen",
  "power2.out": "Pehmeä",
  "power3.out": "Napakka",
  "back.out(1.7)": "Palautuva",
  "bounce.out": "Pomppiva",
  "elastic.out(1, 0.45)": "Kimmoisa",
};

/** Compare the listed names whitespace-free, so `elastic.out(1,0.45)` resolves
 * to the canonical `elastic.out(1, 0.45)` spelling instead of being refused. */
const NAMED_BY_COMPACT = new Map<string, string>(
  STUDIO_GSAP_EASE_OPTIONS.map((option) => [option.replaceAll(/\s+/g, ""), option]),
);

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function namedEase(ease: string): ParsedEase | null {
  const canonical = NAMED_BY_COMPACT.get(ease.replaceAll(/\s+/g, ""));
  if (!canonical) return null;
  return {
    ok: true,
    kind: "named",
    ease: canonical,
    points: resolveEaseCurveTuple(canonical),
    label: EASE_LABELS_FI[canonical] ?? canonical,
  };
}

function customEase(ease: string): ParsedEase | null {
  const body = /^custom\((.+)\)$/s.exec(ease)?.[1];
  if (body === undefined) return null;
  const raw = CUSTOM_EASE_DATA_PATTERN.exec(body.trim());
  if (!raw) {
    return fail("Mukautetun käyrän muoto on custom(M0,0 C x1,y1 x2,y2 1,1).");
  }
  const numbers = [raw[1], raw[2], raw[3], raw[4]].map((value) => Number.parseFloat(value ?? ""));
  if (!numbers.every(Number.isFinite)) return fail("Käyrän ohjauspisteet eivät ole lukuja.");
  const [x1, y1, x2, y2] = numbers as [number, number, number, number];
  if (![x1, x2].every((x) => x >= 0 && x <= 1)) {
    return fail("Käyrän X-ohjauspisteiden on oltava välillä 0–1.");
  }
  if (![y1, y2].every((y) => y >= CUSTOM_Y_MIN && y <= CUSTOM_Y_MAX)) {
    return fail(`Käyrän Y-ohjauspisteiden on oltava välillä ${CUSTOM_Y_MIN}–${CUSTOM_Y_MAX}.`);
  }
  // Normalisation, not correction: the points are already inside the clamp
  // range, so this only rounds them the way the persist paths do.
  const points = parseStudioCustomEaseData(body.trim());
  if (!points) return fail("Mukautettua käyrää ei voitu lukea.");
  return {
    ok: true,
    kind: "custom",
    ease: `custom(${serializeStudioCustomEaseData(points)})`,
    points: [points.x1, points.y1, points.x2, points.y2],
    label: "Mukautettu käyrä",
  };
}

function springEase(ease: string): ParsedEase | null {
  if (!/^spring\(/.test(ease)) return null;
  const rawBounce = /^spring\(\s*([^)]*)\)$/.exec(ease)?.[1];
  const requested = Number.parseFloat(rawBounce ?? "");
  const bounce = parseSpringBounce(ease);
  if (bounce === null) return fail("Jousen muoto on spring(b), jossa b on välillä 0–1.");
  // parseSpringBounce clamps. Refuse rather than save a different spring.
  if (!Number.isFinite(requested) || requested < 0 || requested > 1) {
    return fail("Jousen b on oltava välillä 0–1.");
  }
  return {
    ok: true,
    kind: "spring",
    ease: `spring(${bounce})`,
    bounce,
    label: `Jousi ${bounce}`,
  };
}

function wiggleEase(ease: string): ParsedEase | null {
  if (!/^wiggle\(/.test(ease)) return null;
  const config = parseWiggleEase(ease);
  if (!config) {
    return fail(
      "Heilahduksen muoto on wiggle(määrä, easeOut|easeInOut|anticipate|uniform[, 0–1]).",
    );
  }
  const amplitude = config.amplitude === undefined ? "" : `,${config.amplitude}`;
  return {
    ok: true,
    kind: "wiggle",
    ease: `wiggle(${config.wiggles},${config.type}${amplitude})`,
    wiggle: config,
    label: `Heilahdus ×${config.wiggles}`,
  };
}

/**
 * The one gate. Returns the normalised ease and its numbers, or a Finnish
 * reason. Anything not named here is refused before a write.
 */
export function parseEase(input: unknown): ParsedEase {
  if (typeof input !== "string") return fail("Käyrä on annettava merkkijonona.");
  const ease = input.trim();
  if (!ease) return fail("Käyrä ei voi olla tyhjä.");
  if (ease.startsWith("__raw:")) return fail("Raakaa JavaScriptiä ei hyväksytä käyräksi.");
  if (ease === "hold") {
    return { ok: true, kind: "hold", ease: "hold", label: "Pysäytys" };
  }
  return (
    namedEase(ease) ??
    customEase(ease) ??
    springEase(ease) ??
    wiggleEase(ease) ??
    fail(
      `Tuntematon käyrä ${ease}. Käytä Studion nimeä, custom(...), spring(b), wiggle(...) tai hold.`,
    )
  );
}

/** The curve as receipt/inspect data, or null when the source holds no ease or
 * one this contract does not recognise. */
export function easeCurveOf(ease: string | null | undefined): EaseCurve | null {
  if (typeof ease !== "string") return null;
  const parsed = parseEase(ease);
  if (!parsed.ok) return null;
  const { ok: _ok, ...curve } = parsed;
  return curve;
}

/** Normalised form for comparison; unparseable input falls back to its trimmed
 * self so a comparison never silently succeeds on garbage. */
export function normalizeEase(ease: string | null | undefined): string | null {
  if (typeof ease !== "string") return null;
  const parsed = parseEase(ease);
  return parsed.ok ? parsed.ease : ease.trim();
}

/** True when two ease strings mean the same curve after normalisation. */
export function easeMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeEase(a) === normalizeEase(b);
}
