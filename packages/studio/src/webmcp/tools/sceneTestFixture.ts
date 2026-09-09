/** Shared numeric manifest for the scene tool contract tests. */
export const TITLE_SCENE = "compositions/title-card.html";
export const PACK_SCENE = "compositions/pack-grid.html";

const sceneClip = (overrides: Record<string, unknown>) => ({
  id: "host",
  label: "Otsikkokortti",
  start: 0,
  duration: 4,
  kind: "composition",
  compositionId: "scene",
  parentCompositionId: null,
  compositionSrc: TITLE_SCENE,
  compositionAncestors: ["root"],
  playbackStart: 0,
  playbackRate: 1,
  ...overrides,
});

export const SCENE_MANIFEST = [
  sceneClip({ id: "title-host-a", compositionId: "title-a", start: 0, duration: 4 }),
  sceneClip({ id: "title-host-b", compositionId: "title-b", start: 4, duration: 4 }),
  sceneClip({
    id: "pack-host",
    compositionId: "pack",
    compositionSrc: PACK_SCENE,
    start: 2,
    duration: 5,
  }),
];
