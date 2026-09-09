# Ari Studio sprint 3 — precise curves and nested-scene time, 2026-09-09

> Follow-up status: [Sprint 3 final UX closeout](ARI-SPRINT-FINAL-UX.md) supersedes the historical open-items list below.

Implementation report for [`plans/2026-09-09-ari-studio-curves-and-scene-time-sprint.md`](plans/2026-09-09-ari-studio-curves-and-scene-time-sprint.md), which continued the two items the easy-motion sprint left open: _"tarkemmat käyrät ja sisäkkäisten kohtausten aikamuunnokset jäivät jatkotyöksi."_

**Goal, in the plan's own acceptance sentence:** _"I see and adjust a motion's curve as a picture and as numbers, and a nested scene's motion is visible and adjustable in master time without opening the scene when the placement is unambiguous. A script gets the same curve and the same time conversion as a receipt."_

All of K1–K5, S1–S5, U1, U2 and D1 shipped. Everything runs locally in the fork on `ari/agent-studio`; **0 USD**, no model or vendor call in any step, no AdForge credits.

## What shipped, per plan item

### Curves

| Item                                 | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Files                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **K1** closed ease contract          | `parseEase(input)` accepts only the 27 `STUDIO_GSAP_EASE_OPTIONS` names, `custom(M0,0 C x1,y1 x2,y2 1,1)` with X ∈ [0,1], `spring(b)`, `wiggle(...)` and `hold`, reusing `resolveEaseCurveTuple`, `parseStudioCustomEaseData`, `parseSpringBounce`, `parseWiggleEase`. Both `studio_add_animation` and `studio_update_animation` refuse an unknown curve in Finnish **before the write**; `power2.uot` never reaches a source file. Y overshoot is allowed inside Studio's clamp domain (−0.6 … 1.6) and refused outside it rather than silently pulled back — same reasoning for a `spring(b)` outside 0–1.                                                               | `packages/studio/src/webmcp/easeContract.ts` (199), `webmcp/tools/animationTools.ts` (587)                                                                   |
| **K2** the receipt carries the curve | `settleAnimationWrite` compares through `easeMatches` on `parseEase`-normalised form, so a cubic that `sdkGsapTweenPersist`/`commitMutationSafely` rounded still verifies while a genuinely different curve still fails. A `verified` receipt and `studio_inspect` both carry `easeCurve { kind, ease, points \| bounce \| wiggle, label }`, read from the governing ease. Levels stay `dispatched < saved < verified`.                                                                                                                                                                                                                                                    | `webmcp/tools/animationReadback.ts`, `webmcp/tools/inspectTools.ts` (259)                                                                                    |
| **K3** keyframe feel                 | `studio_update_animation` resolves the owned animation in preflight and routes `ease` → `easeEach` when it has keyframes, exactly as `components/editor/AnimationCard.tsx:331`; an explicit `easeEach` on a keyframe-less animation is refused. The Ari form sends the same key.                                                                                                                                                                                                                                                                                                                                                                                           | `animationTools.ts`, `ari/AriMotion.tsx`                                                                                                                     |
| **K4** the curve as a picture        | Six Finnish groups (Tasainen / Pehmeä / Napakka / Palautuva / Jousi / Heilahdus) over the upstream `easePresetLibrary.ts` presets, each with a `MiniCurveSvg` glyph, for both a new and an existing motion. `AriEase` wraps upstream `EaseCurveSection`: a completed drag writes **once, on pointer-up only**, the pending row clears on the receipt (never a timer), a refusal restores the saved curve with its Finnish reason, and the status row has a fixed height so buttons do not move mid-drag. Four `AriNumber` control-point fields commit only on **Tallenna ohjauspisteet**; opening the panel writes nothing. The glyph also rides each timeline motion bar. | `ari/easeCatalog.ts` (121), `ari/AriEase.tsx` (337), `ari/AriMotion.tsx` (368), `ari/AriMotionBar.tsx` (184), `components/editor/EaseCurveSection.tsx` (574) |
| **K5** replay and frame series       | `studio_frame({ animationId, samples: [0.25, 0.5, 0.75] })` returns three revision-bound PNGs from one call, timed from the **saved source**; the call fails rather than mixing revisions. `url`/`time` mirror the first sample, so single-frame callers are untouched. **Vertaa edelliseen** replays the span twice with the previous curve kept in panel state only.                                                                                                                                                                                                                                                                                                     | `webmcp/tools/frameTools.ts` (292), `utils/frameCapture.ts`, `ari/replayMotion.ts` (54)                                                                      |

### Nested-scene time

| Item                                  | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Files                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **S1** the transform as a pure module | `resolveSceneInstances(manifest, sourceFile) → { instances, unsupported }`, `masterToLocal`, `localToMaster`, chaining rate and offset through every ancestor. No DOM, no React, no bridge. A non-numeric host start returns an explicit unsupported state, never `0`.                                                                                                                                                                                                                                                              | `ari/sceneTime.ts` (373) + test                                                                              |
| **S2** instance selection             | `studio_look().scenes[]` lists every placement of a nested scene file (`hostId`, `label`, master window, `playbackStart`, `playbackRate`, `sceneDuration`) plus `unsupported[]` with reasons. One placement auto-selects; several require an explicit choice and a write without `instance` is refused before anything is written. The shared-source warning stays and the receipt carries `affectsInstances`.                                                                                                                      | `webmcp/tools/animationScene.ts` (511), `lookTools.ts` (366), `selectionTools.ts` (266), `ari/AriMotion.tsx` |
| **S3** motion in master time          | Dual readout `Alkaa kohtauksessa 0,30 s · pääajassa 5,80 s · ×1,5`, either field editable and the other derived; the master rail draws the nested bar through the transform with a `×1,5` badge, and a drag converts back before the write. A motion outside the visible window is drawn clipped with the refusal sentence on its title. An opened scene shows local time only.                                                                                                                                                     | `ari/sceneMotion.ts` (132), `ari/useAriScene.ts` (84), `ari/AriMotionBar.tsx`, `ari/AriTimeline.tsx` (101)   |
| **S4** both time bases                | `timeBasis: "master" \| "scene"` and `instance` on `studio_add_animation`, `studio_update_animation` and `studio_seek`; conversion happens in preflight, before the writer is called, and the receipt carries `scene { sourceFile, instance, localPosition, masterPosition, playbackRate, … }`. `studio_seek` re-derives both clocks from where the playhead actually landed, so 30 fps rounding in master time is visible instead of hidden. The `useGsapAnimationOps` refusal survives only for a genuinely unresolved placement. | `animationScene.ts`, `animationTools.ts`, `selectionTools.ts`, `hooks/useGsapAnimationOps.ts` (328)          |
| **S5** fit validation                 | A motion must fit both the scene's own duration and the host's visible window, `playbackStart` and rate included — e.g. `liike ei näy pääajassa (kohtaus loppuu 4,00 s)`, `liike alkaa ennen kohtauksen näkyvää alkua (kohtaus alkaa 0,50 s)`.                                                                                                                                                                                                                                                                                      | `animationScene.ts`                                                                                          |

### Fixture, UAT and docs

| Item   | Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U1** | `examples/rajamarket-scenes/` — the 7 s / 1080×1920 RajaMarket prototype with the headline card as `scenes/headline-card.html` hosted **twice** (`headline-host-a` at 0,12 s rate 1; `headline-host-b` at 5,60 s `data-playback-rate="1.5"`, ending exactly at 7,00 s) and the six packs as `scenes/pack-grid.html` hosted once. `hyperframes check` passes: lint 0/0, runtime 0/0, layout 0 issues over 9 samples, motion 0/0, contrast 32/32 AA. The entrance is deliberately linear so a frame reads back scene time. Numbers, ids and evidence: [`examples/rajamarket-scenes/README.md`](examples/rajamarket-scenes/README.md). |
| **U2** | `packages/studio/tests/e2e/ari-scenes-and-curves.mjs` (866) + `ari:test:scenes`, in two modes, copying the fixture into a throwaway `examples/rajamarket-scenes-e2e` on every run.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **D1** | `ARI.md` sections for the ease contract, the two clocks, instance selection, the per-tool fields and `ari:test:scenes`, with a runnable script example; this report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The tool catalogue is still **12** names. Every new field is an addition to an existing schema, so earlier scripts keep working.

## UAT evidence

### Unit and regression

| Command                                                                                        | Result                                                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npx --yes bun run ari:test`                                                                   | **26 files / 378 tests passed** (20 / 299 before the sprint)                                 |
| `npx --yes bun run --cwd packages/studio test src/components/editor/EaseCurveSection.test.tsx` | 28 passed — upstream behaviour unchanged by the opt-in pointer-cancel prop                   |
| `npx --yes bun run --cwd packages/studio test src/player`                                      | 109 files / 1409 tests passed, covering the manifest repair                                  |
| `npx --yes bun run --cwd packages/studio typecheck`                                            | pass                                                                                         |
| `npx --yes bun run --cwd packages/studio-server typecheck`                                     | pass                                                                                         |
| `npx --yes bun run ari:build`                                                                  | pass, exit 0 — every workspace package built, no errors                                      |
| `npx --yes bun run ari:test:motion`                                                            | `ok: true`, all 9 checks, MP4 1080×1920 / 7 s — the previous sprint's regression stays green |
| `npx --yes bun run ari:test:scenes`                                                            | `ok: true`, all 14 checks, `pageErrors: []`, MP4 1080×1920 / 30 fps / 7,000000 s             |
| `oxfmt --check` + `oxlint` on the 74-file diff                                                 | all formatted; 0 warnings, 0 errors                                                          |

### Browser UAT — `ari:test:scenes`

Both modes report `ok: true`, 14 checks, `pageErrors: []`, `providerSpendUsd: 0`, `workspaceReloads: 0`.

- mixed (headless, bridge calls + clicks): [`screenshots/2026-09-09-scenes-curves/uat/mixed/report.json`](screenshots/2026-09-09-scenes-curves/uat/mixed/report.json)
- UI-only (`ARI_UI_ONLY=1 ARI_HEADED=1`, every step through visible controls, no DevTools): [`screenshots/2026-09-09-scenes-curves/uat/ui-only/report.json`](screenshots/2026-09-09-scenes-curves/uat/ui-only/report.json)

Both runs end with the same scene sources — the click-through and the script path produce the same file:

| file                        | sha256 (both modes)                                                |
| --------------------------- | ------------------------------------------------------------------ |
| `scenes/headline-card.html` | `4c4ac3c947c138160dabbc25495ddf86e9a9d6359f4a858feb5ae07e883ff58e` |
| `scenes/pack-grid.html`     | `5d718cf644af9960b53431aefaf84ada4cc264e8b7ffd3ba62f600fac8f6122e` |

The exported MP4s are byte-identical too (`6ae3e4369fd15a3bf3a196c03b12e0586c462d34382dfe75a79ae6e85862f60f`), which is stronger than the plan asked for.

Key receipts from the run:

- master 1,2 s on the single-placement pack grid → `insertedAtSeconds: 1.2`, `scene.localPosition 1.2 / masterPosition 1.2`, `affectsInstances: 1`, `stage: "verified"`, `index.html` untouched.
- one pointer drag on the graph → exactly one `studio_update_animation` receipt, `ease: "custom(M0,0 C0.26,0.92 0.3,1 1,1)"`, `easeCurve.points [0.26, 0.92, 0.3, 1]`.
- `studio_inspect` on the control-point write → `easeCurve { kind: "custom", points: [0.25, 0.9, 0.4, 1], label: "Mukautettu käyrä" }`, `easeEach: null`.
- an add on the twice-hosted headline **without** `instance` → `{ ok: false, kind: "invalid", stage: "refused", reason: "kohtauksella scenes/headline-card.html on 2 esiintymää, joten valitse instance", hint: "Esiintymät: headline-host-a (pääajassa 0,12–5,60 s), headline-host-b (pääajassa 5,60–7,00 s)." }`, scene file byte-identical.
- master 5,8 s on placement 2 → source `0.3`, receipt `scene { instance: "headline-host-b", localPosition: 0.3, masterPosition: 5.8, playbackRate: 1.5, instanceIndex: 2, instanceCount: 2 }`, `affectsInstances: 2`; the master bar sits at 5,80–6,40 s with the `×1,5` badge.
- `studio_frame({ animationId, samples: [0.25, 0.5, 0.75] })` → three PNGs at 1,350 / 1,500 / 1,650 s, all bound to one `sourceRevision`.

### The exported video

`ffprobe`: **1080 × 1920**, `avg_frame_rate 30/1`, `format.duration 7.000000` — asserted as 1080×1920 / 30 fps / 7 s ± 0,1 in both runs.

### The 1,5× proof, measured out of the MP4

The headline entrance is linear (`ease: 'none'`, y 90 → 0 over 0,9 s of **scene** time), so the headline's top edge reads back scene time. Matched scene states — host A at master `0,12 + t`, host B at `5,60 + t/1,5`:

| scene t | A frame / master | B frame / master |  A top |  B top | Δ px | A master elapsed | B master elapsed |
| ------: | ---------------- | ---------------- | -----: | -----: | ---: | ---------------: | ---------------: |
|  0,30 s | 13 / 0,4333 s    | 174 / 5,8000 s   | 276 px | 277 px |    1 |         0,3133 s |         0,2000 s |
|  0,45 s | 17 / 0,5667 s    | 177 / 5,9000 s   | 262 px | 262 px |    0 |         0,4467 s |         0,3000 s |
|  0,60 s | 22 / 0,7333 s    | 180 / 6,0000 s   | 246 px | 247 px |    1 |         0,6133 s |         0,4000 s |
|  0,75 s | 26 / 0,8667 s    | 183 / 6,1000 s   | 232 px | 232 px |    0 |         0,7467 s |         0,5000 s |

Host A needs 1,5 × the master seconds host B does, within the two frames a 30 fps grid can move a sample. The negative control reads host B **as if it played at rate 1** (master `5,60 + t`); if it did, these would match too:

| scene t |  A top | B naive top @ master | Δ px |
| ------: | -----: | -------------------- | ---: |
|  0,30 s | 276 px | 262 px @ 5,9000 s    |   14 |
|  0,45 s | 262 px | 237 px @ 6,0667 s    |   25 |
|  0,60 s | 246 px | 217 px @ 6,2000 s    |   29 |

A calibration-free line fit over host A gives **−100,82 px/s** against the authored −100 px/s, and all eight samples land within **0,004 s** of their expected scene time.

### Screenshots

Panel and timeline, from the implementation runs:

- `screenshots/2026-09-09-scenes-curves/01-ease-panel.png` — the graph, the four control-point fields, **Vertaa edelliseen** and the 25/50/75 % frame row; the fields show `0.16, 1, 0.3, 1`, exactly what `power2.out` resolves to, unwritten
- `screenshots/2026-09-09-scenes-curves/02-ease-presets.png` — the grouped Finnish Tuntuma picker open, a glyph beside every name
- `screenshots/2026-09-09-scenes-curves/03-dual-time-form.png` — scene 0,3 s ↔ master 5,8 s on the 1,5× placement
- `screenshots/2026-09-09-scenes-curves/04-master-timeline-rate-badge.png` — the saved bar at 5,80–6,40 s with the `×1,5` badge

From the UAT, per mode (`mixed` and `ui-only`):

- `screenshots/2026-09-09-scenes-curves/uat/<mode>/01-master-timeline-1440.png`, `02-workspace-1440.png`, `03-workspace-1280.png`
- `.../uat/<mode>/sample-25.png`, `sample-50.png`, `sample-75.png` — the three revision-bound frames
- `.../uat/<mode>/frames/a-scene-*.png`, `b-scene-*.png`, `b-naive-*.png` — the measured frames
- `.../uat/<mode>/downloads/*.mp4`

The fixture's own evidence is under `examples/rajamarket-scenes/evidence/` (`check.log`, `check.json`, `frames/`, `matched-scene-state-pairs.png`, `measure-headline.py`, `headline-rate-measurement.json`).

## Defects found on the way

Each was fixed in the product rather than worked around in a test, and each carries a unit test.

1. **`data-root="true"` on a scene root hijacks the whole composition.** It is the runtime's explicit root marker and `document.querySelector` takes the first match in document order, so the master resolved to the headline scene's 0,9 s duration and froze past it — packs never opened, the CTA never inverted. Found while building the U1 fixture; `data-root` now belongs to the master only, and the README records it.
2. **`compositionSrc` was `null` on every clip in the real studio.** The compiler renames a host's `data-composition-src` to `data-composition-file` when it inlines a sub-composition, and the manifest builder only read the original attribute. Everything S2–S5 keys on the scene _file_ therefore resolved **zero** placements in a project whose scenes were plainly on screen; the batch-2 unit tests hand in their own manifests, so it only showed in a browser. Repaired in the studio layer (`player/lib/compositionSourceFile.ts`, 73 lines, wired as one line in `useTimelineSyncCallbacks.ts` before `setClipManifest`) — additive, and the render path is unchanged.
3. **The nested add-writer gap.** `studio_add_animation` on an element inside a nested scene returned `failed · "the animation did not land"` while `studio_update_animation` on the same target worked. The cause was one dropped argument: the tool resolved the placement in preflight but `deps.addAnimation` had no parameter for it, so the writer re-decided from scratch, found two placements of `headline-card.html` and threw. The instance is now threaded through to the writer and its refusal narrowed to the genuinely ambiguous case. The minted auto-id now comes from the element's `data-hf-id` instead of the tag name — without it the first nested add wrote `id="div"` into a file hosted twice.
4. **A nested `<form>` swallowed the control-point write.** `CurvePointFields` rendered a `<form>` inside `MotionForm`'s `<form>`; invalid HTML, so React's `onSubmit` never fired, the browser performed a native GET submit and the page reloaded with the curve lost — silently, with no receipt. The four fields were unusable from the UI. Now a plain `<div>` and a `type="button"` that commits directly. Found by the U2 click-through.
5. **A twice-hosted scene lost a layer row.** `AriLayers` keyed rows by handle, and one scene file hosted twice contributes the same handle once per placement; React dropped a row and logged a duplicate-key warning continuously. Keyed by position now.
6. **Upstream `EaseCurveSection` committed a pointer-cancel** as if it were a release, which in Ari's panel would write a curve the author never let go of. New opt-in prop `discardDraftOnPointerCancel`; the default keeps upstream behaviour, so its 28 tests are untouched.
7. **A stale studio server produced a false test failure.** `ari:test:motion` failed on an assertion far upstream of the work because a dev server left on port 3080 by an earlier session was still holding old state — the launcher tolerates an occupied port. Every e2e run now kills a stale server on its port first.

## Corrections to the plan

- **S1's two-level fixture numbers.** The plan states _"pääaika 5 s = nested 5 s = title-card 4 s"_. That does not hold for `packages/studio/tests/e2e/fixtures/composition-reliability`: `nested-host` has `data-start="2"` and `nested-title-host` `data-start="1"`, so master 5 s → nested-shell 3 s → title-card **2 s**, which is what the runtime seek actually produces (verified against the real runtime primitives, not against the new module). The "host duration clamping" half of the sentence is real and is tested: the instance's window is master 3–7 s, `localToMaster(4) === 7`, and `masterToLocal(9)` clamps to 4.
- **`resolveSceneInstances` returns `{ instances, unsupported }`**, not a bare array. That is how "an explicit unsupported state, never 0 as a fallback" is met _per host_: one placement of a shared source can be transformable while a sibling is not, and dropping the refused one would be indistinguishable from "no such scene".
- **The U1 README's "0 → 0.90 s, then held"** is not quite right: `scenes/headline-card.html` is authored as a 0,9 s composition, so in the master the headline card disappears after its own 0,9 s even though `headline-host-a`'s window runs to 5,60 s. Nothing was ever sampled past master 1,02 s, so no measurement depends on it. The UAT measurement samples only inside the entrance and refuses a frame with no headline in it.

## What remains open

- **Speed-ramped and trimmed scenes.** The transform handles a constant `data-playback-rate` and `data-playback-start`; a scene retimed over its own length, or a host window authored _longer_ than its scene, is outside what the clip manifest can show this layer. `sceneDuration` is derived as `playbackStart + duration × playbackRate`, the local end of the host's visible window.
- **A cold-start placement race.** On the first page load after a cold studio server, a twice-hosted scene was sometimes missing from the layer tree entirely (20 rows instead of 30) and `studio_look().scenes` then listed one scene where the project has two; only a reload mounted it. Reproduced deterministically at the time, not reproducible once the studio had opened the project before. Root-causing it means going into the preview mount / sub-composition inlining path. The e2e handles it honestly rather than by relaxing an assertion: `readyWorkspace()` polls for both placements and reloads at most three times, recording `workspaceReloads` (0 in both final runs). **This is a named product defect, not a test flake.**
- **Undo leaves the minted `id` behind.** Undo removes the tween but not the `id` attribute the server-side id-assignment call wrote, because that call never enters the edit history. Pre-existing upstream behaviour for any id-less element, not scene-specific.
- **A pre-existing unit failure outside `ari:test`.** `packages/studio/src/hooks/gsapResizeIntercept.test.ts` fails 2/10 (`convert-to-keyframes` undefined; scale 0.9 vs 2). Confirmed by stashing this sprint's production edits and re-running — it fails identically without them. It sits outside `ari:test`'s paths, so no earlier sprint report would have caught it.
- **Per-keyframe curves in the Ari panel**, audio time and timeline stretch/loop attributes were explicitly out of scope for this sprint and remain so.
- **The fixtures are untracked.** `examples/*` is gitignored in this repo (only the OSS examples are negated), so `examples/rajamarket-scenes` — like `rajamarket-uat`, `rajamarket-sprint-uat` and `rajamarket-sprint-mixed` — lives only on this machine. `ari:test:scenes` fails with a clear message when it is missing. `screenshots/` is ignored for the same reason (its logs contain local filesystem paths).

## Verification commands

`bun` is not on PATH on this machine; `npx --yes bun` is the documented substitute.

```sh
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/components/editor/EaseCurveSection.test.tsx
npx --yes bun run --cwd packages/studio test src/player
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
npx --yes bun packages/cli/bin/hyperframes.mjs check examples/rajamarket-scenes

# browser, foreground, kill a stale server on the port first
npx --yes bun run ari:test:motion                              # port 3080
npx --yes bun run ari:test:scenes                              # port 3083, mixed
ARI_UI_ONLY=1 ARI_HEADED=1 npx --yes bun run ari:test:scenes   # the visible click-through

./node_modules/.bin/oxfmt --check <changed files>
./node_modules/.bin/oxlint <changed files>
```

Every changed production file stays under the 600-line gate. No paid provider was contacted at any point in the sprint: **0 USD**.
