# Ari Studio · whole-delivery regression and audit (A1–D7)

One synthetic ad, built four times from the same starting point — `ui-only` and `mixed` at
1280×800 and 1440×900 — through the creation actions the product actually ships, with no
hand-edited source anywhere in the run. This report is the single piece of evidence for the whole
delivery; the per-batch reports (`ARI-NEXT-*.md`) stay as they were.

**Nothing here is a human test and nothing here is a release.** Every assessment and approval the
journeys recorded is marked `test_data` because a browser journey typed it; every exported MP4 is
a local draft file.

## The final-delivery journey

[`packages/studio/tests/e2e/ari-final-delivery.mjs`](packages/studio/tests/e2e/ari-final-delivery.mjs)
(`npm run ari:test:final`), with
[`ari-final-helpers.mjs`](packages/studio/tests/e2e/ari-final-helpers.mjs) and
[`ari-final-export.mjs`](packages/studio/tests/e2e/ari-final-export.mjs) on the shared acceptance
harness. Each case, in order:

1. **A1–A3** — a project from the `blank` template, a synthetic PNG imported from the repository's
   own fixture, a background, the approved main message _Pieni tauko._ and an image element.
2. **A3–A4** — an `Avaus` scene (2 s), a second placement of it, and that second placement
   detached into its own `scenes/oma.html`.
3. **Curves and the two clocks** — one motion added on the detached placement **in master time**
   (typed into _Uusi liike · Koko videossa (s)_, and the run waits for the panel to convert it to
   scene-local 0,4 s before the write) and then given `custom(M0,0 C0.25,0.9 0.4,1 1,1)` through
   the four control-point fields. The saved scene source is read back and must contain that curve.
4. **B3–B5** — versions _Ennen_ and _Jälkeen_, the visible comparison, and a genuine picture
   difference at the same shared time.
5. **Error path** — a write naming a source version the project has moved past.
6. **D4** — a real review package for _Jälkeen_, four `test_data` assessments, and the local
   approval bound to that package. The change between the two versions is elements only, so this
   package's coverage is `changed-motion-boundaries` with **zero** boundaries to sample; the
   boundary sampling itself is proven by `ari:test:review` and by
   `screenshots/2026-09-10-d-review-boundaries/`.
7. **D6** — _Pysäytä työ_, a refused write, _Jatka pysäytettyä työtä_.
8. **D6 ageing** — one more element, which ages the approval to `source_changed` in place.
9. **Error path** — a version whose frozen `index.html` blob is deleted underneath it; preparation
   fails and publishes nothing, while the already published package still reads.
10. **D5** — the locked main message refused, two repair rounds spent, the third refused.
11. **A5 / D7** — one injected `503` on the render POST, then a real export: MP4, ffprobe, the
    source-version receipt and the _Luonnos, ei hyväksytty_ wording.

A separate reopen phase (`ARI_FINAL_REOPEN=…`) replays every case against a fresh server process
and browser session.

## A1–D7, criterion by criterion

| Criterion                                                                                     | Delivered       | Evidence                                                                                | Limit                                                                                                                    |
| --------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A1** project from a template, name/duration/location shown first                            | yes             | `e2e/authoring/browser-report.json` (2 modes, 22 checks); final journey step 1          | —                                                                                                                        |
| **A2** PNG/JPEG/WebP import, copied into the project                                          | yes             | same report: 3 imported, 3 rejected independently; the copied bytes match the originals | measured limits stay 8 MiB / 16 MP                                                                                       |
| **A3** add/name/copy/delete/order elements and scenes                                         | yes             | `e2e/elements` (4×14), `e2e/scene-structure` (4×10), final steps 1–2                    | element overlap order and scene chronology are separate controls                                                         |
| **A4** own copy keeps look and timing, its edit changes nothing else                          | yes             | `e2e/scene-structure`, final step 2                                                     | a copy that itself hosts further scene sources is refused before the write                                               |
| **A5** reopen keeps everything; both paths agree, saved content and export agree              | yes             | `final/report.json`: `equivalentSources: true`, `equivalentExportFrames: true`          | —                                                                                                                        |
| **B1–B2** one action is one undoable change; a failed multi-step write leaves no half         | yes             | `e2e/history-recovery`, `e2e/operations`                                                | —                                                                                                                        |
| **B3–B4** real two-version comparison, shared playback and seek, active sources untouched     | yes             | `e2e/comparison` (4×10), final step 4                                                   | —                                                                                                                        |
| **B5** a visible difference proves it is not the same version twice                           | yes             | `final/*-version-0.png` vs `*-version-1.png`, different sha256 at the same runtime time | —                                                                                                                        |
| **C1–C4** the four sections, both viewports, no scrolling for the basics                      | yes             | `e2e/panel` (4×10)                                                                      | —                                                                                                                        |
| **C5** UX path in both viewports                                                              | automation only | `e2e/panel`                                                                             | the under-five-minutes human goal is **not** measured                                                                    |
| **D1** goal, agreed copy, media, tasks, completed operations, versions, observations          | yes             | `e2e/notebook` (4×4), `e2e/operations` (4×3)                                            | —                                                                                                                        |
| **D2** reopening repeats no completed operation; an unclear result is resolved first          | yes             | `e2e/operations`, final reopen phase (`studio_resume_work` rewrites no byte)            | image imports, binary version restores, rich text and legacy animated-position edits stay outside the tracked write path |
| **D3** external-agent and human observations, no model verdict claimed from a technical check | yes             | `e2e/notebook`, `e2e/review`                                                            | `reviewerType` has no `technical` value                                                                                  |
| **D4** first/last frame, changed motion boundaries, whole video, per-area assessments         | yes             | `e2e/review` (4×12), final step 6; package coverage `changed-motion-boundaries`         | package completion is not viewing and not a quality approval                                                             |
| **D5** two repair rounds per task, approved copy protected                                    | yes             | `e2e/repair` (4×5), final step 10                                                       | a lock is a mechanical string match                                                                                      |
| **D6** Pysäytä työ, orderly end, ageing that keeps history                                    | yes             | `e2e/stop` (4×9), final steps 7–8                                                       | the stop reaches exactly as far as the tracked write path                                                                |
| **D7** local draft export, no approval for an unreviewed or rejected version                  | yes             | `e2e/stop`, final step 11                                                               | the export is a local file; this fork creates no customer approval and publishes nothing                                 |

## The e2e suites

Every `ari:test:*` script in `package.json`, each with the stale servers on 3080/3083/3084 killed
first. Logs and reports under `screenshots/2026-09-10-final-delivery/e2e/<name>/`.

| Suite                       | Result      | Checks                | pageErrors / external requests / corrective reloads |
| --------------------------- | ----------- | --------------------- | --------------------------------------------------- |
| `ari:test:authoring`        | ok          | 2 modes, 22           | 0 / 0 / —                                           |
| `ari:test:browser`          | ok          | 9                     | 0 / 0 / —                                           |
| `ari:test:comparison`       | ok          | 4 × 10                | 0 / 0 / 0                                           |
| `ari:test:elements`         | ok          | 4 × 14                | 0 / 0 / 0                                           |
| `ari:test:history-recovery` | ok          | 3                     | 0 / 0 / 0                                           |
| `ari:test:motion`           | ok          | 9                     | 0 / 0 / —                                           |
| `ari:test:notebook`         | ok          | 4 × 4                 | 0 / 0 / 0                                           |
| `ari:test:operations`       | ok          | 4 × 3                 | 0 / 0 / 0                                           |
| `ari:test:panel`            | ok (5 runs) | 4 × 10                | 0 / 0 / 0                                           |
| `ari:test:repair`           | ok          | 4 × 5                 | 0 / 0 / 0                                           |
| `ari:test:retimed`          | ok          | 1                     | 0 / 0 / 0                                           |
| `ari:test:review`           | ok          | 4 × 12                | 0 / 0 / 0                                           |
| `ari:test:scene-structure`  | ok          | 4 × 10                | 0 / 0 / 0                                           |
| `ari:test:scenes`           | ok          | mixed 14, ui-only 16  | 0 / 0 / 0                                           |
| `ari:test:selection-race`   | ok          | 3                     | 0 / 0 / —                                           |
| `ari:test:stop`             | ok          | 4 × 9                 | 0 / 0 / 0                                           |
| `ari:test:versions`         | ok          | 2                     | 0 / 0 / 0                                           |
| `ari:test:final`            | ok          | 4 × 13 + reopen 4 × 2 | 0 / 0 / 0                                           |

Every suite is green. `ari:test:scenes` and the `ari:test:panel` flake were closed in a follow-up
pass; its evidence is under `screenshots/2026-09-10-final-delivery/e2e/scenes-fixed/` (both modes)
and `e2e/panel-x3/` (five consecutive runs). The earlier red scenes report is kept at
`e2e/scenes/mixed/report.json`.

## Measured numbers

**Cross-path source equality.** All four cases end at the same bytes once the project name is
normalised away (`equivalentSources: true`):

| File                | sha256                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `index.html`        | `960f6cf55f9deebc6ae1e11ac807e1d5496864606a3cc67707ca4e8b56e1dd64` |
| `scenes/avaus.html` | `ee6903fa47c9de82d0c1b424af166ef80710a60e3c57b3bda1414b5bec74e8c4` |
| `scenes/oma.html`   | `98200a4e422b7fe0c61a5d140432f031950dc47e5a730d13294f9d3d51837f85` |

**The exported videos.** Four real local renders, one per case, each measured with `ffprobe` from
the downloaded file: **1080 × 1920, 30 fps, 330 frames, 11 s**. Every frame of every video is
compared with `ffmpeg -f framemd5`, and all four produce the identical digest
`bf04a5ef6451040e2036156278bd5da0adb3cb717b0c1403448bc0ebf630e668` over 330 frames.

**Pixel tolerance: 0.** The four videos come from byte-equal sources, rendered by the same local
producer at the same size and frame rate, so a difference anywhere would be a real defect rather
than an encoder artefact. (Where a tolerance _is_ justified — measuring an edge position inside a
frame — the retimed regression keeps its documented 2 px for chroma subsampling.)

**Before / after.** The two frozen replays are screenshotted at the same runtime time; their
sha256 differ, the earlier one does not contain _Uusi hyvä hetki_ and the later one does. Both
runtime clocks read the same value.

**Refusals.** 16 deliberate refusals per full run, asserted by route: 3 × 4 on
`versions/operations` (the stopped write, the locked message, the third repair round) and 1 × 4 on
`review/prepare` (the deleted dependency). The stale-target write is refused inside the browser
and never reaches the network; the injected export failure is answered inside the page.

**Screenshots** (inspected, not just captured):
`screenshots/2026-09-10-final-delivery/final/{ui-only,mixed}-{1280,1440}-{comparison,assessments,final}.png`
and `…/final-reopen/*-reopened.png`.

## Defects found and fixed in this pass

1. **`ari:test:browser` pinned the old tool count.** The registry grew to 36 during this delivery;
   the journey still asserted 12. Updated to 36, the same number `useStudioAgentTools.test.tsx`
   pins.
2. **Three journeys predated the tabbed panel.** `ari-edit-loop.mjs`, `ari-motion-sprint.mjs` and
   `ari-scenes-and-curves.mjs` reached for controls that now live under **Teksti**, **Ulkoasu**,
   **Liike** or **Tarkistus**, and for motion fields renamed by the dual-time form
   (`Liike 1 alkaa (s)` → `Liike 1 · Kohtauksessa (s)`). Tabs are opened and labels updated.
3. **A tracked write drops the selection.** Every journey that read a per-element field after a
   write had to choose its target again. This is the documented behaviour of the shared write path
   (the preview reloads), and it is now handled explicitly rather than by luck.
4. **The ease panel is a closed disclosure.** A control inside a closed `<details>` has no box, so
   a pointer drag lands on nothing. The scenes journey now opens the disclosure that owns the
   motion under test, not the first one on the page.
5. **`ari:test:retimed` could not run without `ARI_SCENE_EXPORT=1`.** The pixel and fault proofs
   were called unconditionally while the renders they measure were opt-in. The guard moved into
   the two helpers, so the plain command is coherent again.
6. **The injected export failure matched the old write route.** `isAnimationWrite` still looked for
   `/gsap-mutations/` and `/files/`; tracked writes go through `/versions/operations/write`.
7. **`Browser.setDownloadBehavior` targets the default browser context.** The final journey
   originally ran each case in an isolated context, and every exported file was silently dropped.
8. **The version store shares one blob between identical files.** Freezing a "doomed" version from
   unchanged bytes and deleting its blob took the published package's dependency with it. The
   removed-dependency fault is now injected from a different source state, after the package
   exists.
9. **`scripts/ari-studio.mjs` could not start at all.** Bun's Vite module runner dies here with
   _transport was disconnected, cannot call fetchModule_, which the launcher can only report as a
   startup timeout — it blocked `ari:test:motion` and `ari:test:browser` outright. The launcher now
   accepts `ARI_STUDIO_HOST=node` and runs the same dev server under Node.

### Fixed in the follow-up pass that closed the last two suites

10. **A scene write lost the canvas selection for good.** After a source write the preview reloads,
    and a nested scene mounts a beat after the new document is queryable. The single post-reload
    re-resolve (`useStudioSelectionPublisher` consumes exactly one per reload) landed in that gap,
    found nothing and cleared — nothing retried, so every scene edit ended in _Ei valintaa_.
    `refreshDomEditSelectionFromPreview` now waits, bounded, for the selection's own file to be
    present before believing the element is gone
    (`packages/studio/src/hooks/selectionSourcePresence.ts`, 9 unit tests).
11. **Undo/redo could drop the selection at random.** The timeline reports itself ready while its
    element list is still the pre-rebuild one; the selection sync found none of the selected ids
    and cleared. That was the `ari:test:panel` flake at _the selection survives undo and redo_
    (one run in three or four). The sync now waits, bounded, for the rebuilt list to name the ids
    again, and still clears when it never does — a clip that really was removed cannot keep the
    canvas pointed at it (`packages/studio/src/hooks/timelineSelectionPresence.ts`, 6 unit tests
    plus two on the hook).
12. **The preview needed a CDN.** `routes/preview.ts` injected `gsap`, `CustomEase` and
    `MotionPathPlugin` from jsdelivr, and the browser bootstrap in `gsapSoftReload.ts` did the
    same. With the network blocked, the aborted scripts raised page errors and the soft reload
    after an edit lost its timeline, so undo never reached the source. They are now served from
    this server's own `gsap` dependency at `/api/vendor/gsap/<file>`
    (`packages/studio-server/src/routes/vendorScripts.ts`, 4 unit tests, fixed allow-list only).
    The injected plugin no longer matches the composition's own gsap version; the server's version
    is used for both.
13. **The scenes journey was not offline.** It had no request guard at all, which is how the CDN
    dependency stayed invisible. It now launches Chrome with
    `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` and records every non-local request.
    CDP request interception was tried first and rejected: it serialises every request through the
    driver and the studio's own save/undo round trip then misses its budget.

## Known limits

- **Writes outside the tracked path.** Image imports, binary version restores, rich text and
  legacy animated-position edits do not carry an operation id, so the stop, the repair-round limit
  and the approved-copy lock do not reach them. Documented in `ARI-NEXT-D-OPERATIONS.md` and said
  in Finnish in the panel.
- **A lock is mechanical.** The exact agreed string, whitespace-normalised. Approved copy split
  across inline tags inside one element will not match, and a lock that never matched protects
  nothing.
- **Nested clip visibility below rate 1.** The timeline seek scales scene-local time by the host
  rate, but clip visibility resolves a nested clip's window in unscaled master time, so a
  `data-duration="2"` clip inside a scene played at rate 0,5 disappears at master 2 s. Pre-existing
  runtime behaviour, recorded in `ARI-NEXT-D-REVIEW-PACKAGE.md`.
- **The Bun/Vite startup jam is not solved**, only routed around: `ARI_STUDIO_HOST=node`.
- **`gsapResizeIntercept.test.ts` fails 2 of 10** without any edit from this delivery, outside the
  Ari test paths. Untouched.
- **`useRazorSplit.test.ts` (3) and `useTimelineEditing.test.tsx` (7) also fail** in the same
  `packages/studio/src/hooks` sweep — 10 failures out of 806. Neither file nor the module it tests
  is modified in this working tree and neither imports anything this pass changed; they are
  outside the `ari:test` paths, like `gsapResizeIntercept`. Recorded here because no earlier report
  named them; not investigated.
- **A layer row renames itself after the first write to its file.** Serialising the scene emits an
  `id` mirroring `data-hf-id`, and an id outranks a class in `buildElementLabel`, so `.hc-offer`
  reads as _Hc Offer_ until it is edited and _Headline Card Offer_ afterwards. Pre-existing, and
  the same minting the undo residue is about.
- **`examples/*` is gitignored**, so the RajaMarket fixtures the motion and scenes journeys use
  exist only on this machine. Everything the final journey needs ships in the repository
  (`packages/studio/tests/e2e/fixtures/`).
- **The synthetic ad is not a designed ad.** Every root text element is created at the same default
  position, so the acceptance ad's headlines overlap on screen. That is what the current _add
  element_ action does; it is a product backlog item, not a defect in the tooling under test.
- **`packages/studio/data/projects/` fills up.** Each acceptance case leaves a project behind; a
  few hundred of them make the dev server's watcher hit `EMFILE`. Housekeeping, but it recurs.

## What is not green

Nothing in the suite table. The two suites this pass left open were closed afterwards:

**`ari:test:scenes`** now passes in both modes — mixed with 14 checks and ui-only (headed) with
16, the extra two being the cross-mode comparisons. Both wrote byte-identical scene sources
(`scenes/headline-card.html` `31b646bc…`, `scenes/pack-grid.html` `9655edfa…`) and exported
**frame-identical** MP4s: 1080×1920 / 30 fps / 7 s / 210 frames, the same `framemd5` digest
`b877bd32…`, and all 210 frames identical under a per-frame PSNR comparison whose floor is 60 dB.
Reports: `e2e/scenes-fixed/{mixed,ui-only}/report.json`. Zero page errors, zero external requests,
zero corrective reloads; the run is now offline at the browser level
(`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`).

**`ari:test:panel`** ran five times in a row, green each time (4 cases × 10 checks). Reports:
`e2e/panel-x3/run1…run5/report.json`.

Two product defects and one server dependency were fixed to get there; they are listed under
**Defects found and fixed in this pass**. Three test files outside the Ari paths still fail
without any edit of their own — see **Known limits**.

## Ihmistestaus: ei tehty

No human tested any part of this delivery. Every journey in this report is automation:

- the assessments and approvals it recorded are `test_data`, and the reviewer-type vocabulary has
  no value that would let automation sign as a person;
- rendering frames, `ffprobe`, playing a video and taking a screenshot are measurements — a silent
  render reports "no audio stream" and leaves the audio assessment **missing** rather than passing
  it;
- **C5's under-five-minutes goal is not measured.** The automation shows the path works in both
  viewports; it says nothing about how long a person needs.

## Final verification pass before the commit

Re-run from this working tree immediately before the single sprint commit, in this order. Evidence
under `screenshots/2026-09-10-final-verification/`.

| Step                                                                           | Result                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx --yes bun run ari:test`                                                   | **pass — 46 files / 505 tests**                                                                                                                                                                            |
| `--cwd packages/studio typecheck`                                              | **pass**, exit 0                                                                                                                                                                                           |
| `--cwd packages/studio-server typecheck`                                       | **pass**, exit 0                                                                                                                                                                                           |
| `--cwd packages/studio-server test src/ari src/routes`                         | **pass — 36 files / 393 tests**                                                                                                                                                                            |
| `npx --yes bun run ari:build`                                                  | **pass**, exit 0, no non-zero package exit                                                                                                                                                                 |
| `oxfmt --check`, 288 changed/new `.ts`/`.tsx`/`.mjs`/`.md`                     | **clean**, no findings to fix                                                                                                                                                                              |
| `oxlint`, the 267 code files of that set                                       | **0 warnings, 0 errors** (88 rules)                                                                                                                                                                        |
| Whole-diff structure gate (`fallow audit --base origin/main --fail-on-issues`) | **pass**, exit 0 — 0 dead-code issues, **1 inherited** complexity finding, **25 inherited** duplicate groups; identical to the recorded baseline; `git diff -- .fallowrc.jsonc` empty; no new suppressions |
| 600-line gate                                                                  | **pass** — largest changed/new production files 598 (`packages/engine/src/services/screenshotService.ts`), 596 (`useDomEditSession.ts`), 595 (`App.tsx`)                                                   |
| `ari:test:final`                                                               | **ok: true** — 4 runs × **13** checks, 0 page errors / 0 external requests / 0 corrective reloads                                                                                                          |
| `ari:test:review`                                                              | **ok: true** — 4 runs × **12** checks, 0 / 0 / 0                                                                                                                                                           |
| `ari:test:stop`                                                                | **ok: true** — 4 runs × **9** checks, 0 / 0 / 0                                                                                                                                                            |
| `ari:test:scenes` mixed                                                        | **ok: true** — **14** checks, 0 / 0 / 0                                                                                                                                                                    |
| `ari:test:scenes` ui-only (headed)                                             | **ok: true** — **14** checks, 0 / 0 / 0                                                                                                                                                                    |

Ports 3080, 3083 and 3084 were killed before each browser run and are **free** afterwards; 3077–3079
were untouched. Nothing failed, so no source was changed in this pass and no assertion was
weakened. 0 USD, no external requests, foreground processes only.

## Verification commands

```sh
npx --yes bun run ari:test                                  # 46 files / 505 tests
npx --yes bun run --cwd packages/studio-server test src/ari src/routes   # 36 files / 393 tests
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
xargs ./node_modules/.bin/oxfmt --check < screenshots/2026-09-10-final-delivery/checked-files.txt
xargs ./node_modules/.bin/oxlint < screenshots/2026-09-10-final-delivery/checked-code.txt
npx --yes bun x --no-install fallow audit --base origin/main --fail-on-issues --format json
# one offline studio on 3084, then the journey and its reopen phase:
screenshots/2026-09-10-final-delivery/with-server.sh final \
  env ARI_FINAL_EVIDENCE=screenshots/2026-09-10-final-delivery/final npx --yes bun run ari:test:final
screenshots/2026-09-10-final-delivery/with-server.sh final-reopen \
  env ARI_FINAL_EVIDENCE=screenshots/2026-09-10-final-delivery/final-reopen \
      ARI_FINAL_REOPEN=screenshots/2026-09-10-final-delivery/final/report.json \
      npx --yes bun run ari:test:final
# every suite, stale servers killed first:
screenshots/2026-09-10-final-delivery/sweep.sh <name> <server|self> [ENV=…]
```

**Gates.** Whole-diff structure audit `new-only`: **pass**, 0 introduced findings (1 inherited
complexity, 25 inherited duplicate groups), `.fallowrc.jsonc` unchanged, no suppressions. Largest
changed or new production `.ts`/`.tsx` under `packages/`: **598** lines
(`packages/engine/src/services/screenshotService.ts`) — every one under 600. The agent tool
registry answers **36** names at runtime, the number `useStudioAgentTools.test.tsx` and
`ari:test:browser` both assert.
