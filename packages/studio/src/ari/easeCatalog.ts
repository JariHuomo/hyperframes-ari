/**
 * Ari: the visible ease vocabulary, grouped in Finnish.
 *
 * `AriMotion` used to offer three feels behind a plain `<select>` and printed
 * everything else as "Mukautettu (power2.inOut)" — a name with no picture, in a
 * panel whose whole job is judging motion by eye. The presets already exist
 * upstream (`components/editor/easePresetLibrary.ts`); what was missing was a
 * Finnish grouping and a glyph.
 *
 * Two rules hold this table together:
 *
 * 1. Every `ease` here MUST pass `parseEase` from the closed ease contract,
 *    or picking it would be refused at the write. `easeCatalog.test.ts` asserts
 *    that for every entry, so an added preset cannot quietly become a dead one.
 * 2. Upstream's `back.in` / `back.out` / `back.inOut` are spelled with their
 *    explicit overshoot here (`back.out(1.7)`). GSAP's default back overshoot is
 *    1.70158, so this is the same curve under the name the Studio ease list
 *    actually carries — not a different feel.
 */

import { EASE_PRESETS } from "../components/editor/easePresetLibrary";

export interface AriEaseOption {
  /** The ease string written to source. Always contract-valid. */
  ease: string;
  /** Finnish name shown beside the glyph. */
  label: string;
}

export interface AriEaseGroup {
  title: string;
  options: readonly AriEaseOption[];
}

/** Upstream preset ease → the spelling the Studio ease list carries. */
export function contractEase(ease: string): string {
  const back = /^back\.(in|out|inOut)$/.exec(ease);
  return back ? `back.${back[1]}(1.7)` : ease;
}

export const ARI_EASE_GROUPS: readonly AriEaseGroup[] = [
  {
    title: "Tasainen",
    options: [
      { ease: "none", label: "Tasainen" },
      { ease: "hold", label: "Pysäytys" },
    ],
  },
  {
    title: "Pehmeä",
    options: [
      { ease: "power2.out", label: "Pehmeä" },
      { ease: "power1.out", label: "Kevyt loppuun" },
      { ease: "power1.in", label: "Kevyt alkuun" },
      { ease: "power1.inOut", label: "Kevyt molempiin" },
      { ease: "power2.inOut", label: "Pehmeä molempiin" },
      { ease: "sine.inOut", label: "Aaltoileva" },
      { ease: "circ.inOut", label: "Pyöreä" },
    ],
  },
  {
    title: "Napakka",
    options: [
      { ease: "power3.out", label: "Napakka" },
      { ease: "power2.in", label: "Napakka alkuun" },
      { ease: "power3.in", label: "Terävä alkuun" },
      { ease: "power3.inOut", label: "Napakka molempiin" },
      { ease: "expo.out", label: "Räjähtävä loppuun" },
      { ease: "expo.in", label: "Räjähtävä alkuun" },
    ],
  },
  {
    title: "Palautuva",
    options: [
      { ease: "back.out(1.7)", label: "Palautuva" },
      { ease: "back.in(1.7)", label: "Vetäisy alkuun" },
      { ease: "back.inOut(1.7)", label: "Palautuva molempiin" },
      { ease: "bounce.out", label: "Pomppiva" },
      { ease: "elastic.out(1, 0.45)", label: "Kimmoisa" },
    ],
  },
  {
    title: "Jousi",
    options: [
      { ease: "spring(0.15)", label: "Jousi kevyt" },
      { ease: "spring(0.25)", label: "Jousi hidas" },
      { ease: "spring(0.4)", label: "Jousi nopea" },
      { ease: "spring(0.6)", label: "Jousi pomppiva" },
    ],
  },
  {
    title: "Heilahdus",
    options: [
      { ease: "wiggle(1,easeInOut,0.20)", label: "Väreily ×1" },
      { ease: "wiggle(2,easeInOut,0.15)", label: "Väreily ×2" },
      { ease: "wiggle(3,easeInOut,0.12)", label: "Väreily ×3" },
      { ease: "wiggle(4,easeInOut,0.10)", label: "Väreily ×4" },
      { ease: "wiggle(5,easeInOut,0.08)", label: "Väreily ×5" },
      { ease: "wiggle(6,easeInOut,0.07)", label: "Väreily ×6" },
      { ease: "wiggle(7,easeInOut,0.06)", label: "Väreily ×7" },
      { ease: "wiggle(4,easeOut,0.22)", label: "Heilahdus pehmeä" },
      { ease: "wiggle(6,easeOut,0.26)", label: "Heilahdus tiheä" },
      { ease: "wiggle(9,uniform,0.32)", label: "Heilahdus tasainen" },
      { ease: "wiggle(5,anticipate,0.28)", label: "Heilahdus ennakoiva" },
    ],
  },
];

/** Every upstream preset ease in its contract spelling, for the coverage test. */
export const UPSTREAM_PRESET_EASES: readonly string[] = EASE_PRESETS.map((preset) =>
  contractEase(preset.ease),
);

const LABELS = new Map(
  ARI_EASE_GROUPS.flatMap((group) => group.options.map((option) => [option.ease, option.label])),
);

/** The Finnish name for an ease, or null when it is not one of the offered ones. */
export function ariEaseLabel(ease: string): string | null {
  return LABELS.get(ease) ?? LABELS.get(contractEase(ease)) ?? null;
}
