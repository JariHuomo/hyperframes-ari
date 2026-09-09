# Sprint 3 final UX closeout — 9 September 2026

Sprint 3 is finalized for the tested constant-rate scene workflow. The required Fallow gate now passes against `origin/main`, with no introduced dead code, complexity or duplication findings. The previous implementation report remains historical; this report records the final follow-up repairs and a new, separately authored RajaMarket prototype. No paid providers were used ($0). Local commits only; no push.

## Follow-up dispositions

| Prior finding                    | Final disposition                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold-start missing scenes        | Ari’s authoring shelf was filtering timed-hidden elements. It now includes them, without changing upstream hit testing. Shared compiled bootstraps also refuse an unsafe soft reload. Mixed and headed UI-only cold runs both pass with **0 recovery reloads**. This covers the observed repro, not every possible startup race. |
| Selection jumps after nested add | A newly minted ID changed the selection key, creating a phantom multi-selection; stable source/hfId identity now replaces the old selection. URL and preview restoration preserve the exact element rather than its parent.                                                                                                      |
| Nested curve / frame operations  | AriEase passes the chosen instance. Curve-only updates validate the owned animation span, not the playhead. Nested frame samples convert to master time and rate. Two-instance targets still refuse ambiguity.                                                                                                                   |
| Resize tests 2/10 failed         | The tests assumed auto-record on, although Ari defaults it off. Tests now explicitly enable/clean up the intended mode. Resize plus soft-reload suite: **40/40**. No geometry assertion weakened.                                                                                                                                |
| Untracked fixtures               | New scenes UAT uses tracked synthetic Testikauppa SVG assets and an OFL font; GSAP is copied from the installed dependency. Real branded project/media remain local and ignored. The older motion regression still needs its documented local fixture.                                                                           |
| Headline vanishes after .9 s     | Synthetic scene duration/hold now extends to 7 s; MP4 checks include the .9 s endpoint and held frames at master 3.5 and 6.9.                                                                                                                                                                                                    |
| Undo leaves minted ID            | Still open: ID assignment and tween write are separate history operations. Undo removes motion but retains the harmless ID. Next sprint: one atomic transaction.                                                                                                                                                                 |
| Speed ramps / trimming           | Still open; current affine transform supports constant rates. Actual child timeline duration is not fully represented by the manifest; authored host-window validation is not a universal trim/speed contract.                                                                                                                   |
| Push pending                     | Not pushed; local closeout commit follows the existing Sprint 3 commit.                                                                                                                                                                                                                                                          |

## Reproducible verification

All commands run from the fork with Bun via `npx --yes bun`. Logs are under `screenshots/2026-09-09-sprint-final/`. Vitest emits its existing teardown notice after successful results; process exits are zero.

| Command                                                                                                                                                                                                                                                              | Result                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npx --yes bun run ari:test`                                                                                                                                                                                                                                         | 26 files, **383 passed**                                                                             |
| `npx --yes bun run --cwd packages/studio test src/hooks/gsapResizeIntercept.test.ts src/utils/gsapSoftReload.test.ts`                                                                                                                                                | 2 files, **40 passed**                                                                               |
| `npx --yes bun run --cwd packages/studio test src/utils/domEditHelpers.test.ts src/hooks/useStudioUrlState.hydration.test.ts src/hooks/useDomSelectionSelectionGuards.test.ts src/hooks/useTimelineSelectionPreviewSync.test.tsx src/webmcp/tools/lookTools.test.ts` | 5 files, **35 passed**                                                                               |
| `npx --yes bun run --cwd packages/studio test src/components/editor/EaseCurveSection.test.tsx`                                                                                                                                                                       | **28 passed**                                                                                        |
| `npx --yes bun run --cwd packages/studio typecheck`                                                                                                                                                                                                                  | pass                                                                                                 |
| `npx --yes bun run --cwd packages/studio-server typecheck`                                                                                                                                                                                                           | pass                                                                                                 |
| `npx --yes bun run ari:build`                                                                                                                                                                                                                                        | pass; existing bundle-size advisories                                                                |
| `npx --yes bun run ari:test:motion`                                                                                                                                                                                                                                  | `ok: true`, 9 checks, real MP4 download                                                              |
| `npx --yes bun run ari:test:scenes`                                                                                                                                                                                                                                  | mixed headless, `ok: true`, 15 checks, 0 page errors / recovery reloads                              |
| `ARI_UI_ONLY=1 ARI_HEADED=1 npx --yes bun run ari:test:scenes`                                                                                                                                                                                                       | visible UI-only, `ok: true`, 15 checks including source comparison, 0 page errors / recovery reloads |
| `./node_modules/.bin/oxfmt --check` / `oxlint` on changed code/docs                                                                                                                                                                                                  | pass                                                                                                 |

The scenes reports are [mixed](screenshots/2026-09-09-sprint-final/uat/mixed/report.json) and [UI-only](screenshots/2026-09-09-sprint-final/uat/ui-only/report.json). These are fresh suiteVersion 2 runs, not the earlier Sprint 3 reports. Both export 1080×1920, 30 fps, exactly 7 seconds; both have identical scene-file hashes and MP4 bytes. UI-only uses no direct test calls to `ariStudio.call`; controls invoke the shared bridge internally. Read-only source/receipt inspection remains part of verification.

- Headline source: `b2df9a1a6984fd6dc1cd01f6bcf82871fdb9246194edb09264c8603887d9bb03`
- Pack source: `94f65162d4a3af57b9e0157ee9f7af02261a8c5d39973a88c7cff316e0c906e5`
- UAT MP4: `e3a864f74c9c0ae8b67435013b039231d11bbdabbf0bddb2d84bcbb2af2770ce`

### The 1.5× proof, from encoded frames

| Scene time | A master / top px | B master / top px | Difference |
| ---------- | ----------------- | ----------------- | ---------- |
| 0.3 s      | 0.4333 s / 276    | 5.8 s / 277       | 1 px       |
| 0.45 s     | 0.5667 s / 262    | 5.9 s / 262       | 0 px       |
| 0.6 s      | 0.7333 s / 246    | 6 s / 247         | 1 px       |
| 0.9 s      | 1.0333 s / 217    | 6.2 s / 217       | 0 px       |

Rate-1 negative controls differ by 14/25/29 px. Both held frames at 3.5/6.9 s have headline top 217 px. The master samples for the chosen nested tween land at **5.95 / 6.10 / 6.25 s** and share one source revision.

## New RajaMarket ad: Pieni tauko.

[MP4](examples/rajamarket-tauko/renders/RajaMarket-Pieni-tauko-PROTOTYYPPI.mp4) · [project README](examples/rajamarket-tauko/README.md) · [source archive](examples/rajamarket-tauko/RajaMarket-Pieni-tauko-source.zip) · [editor screenshot](screenshots/2026-09-09-sprint-final/01-new-ad-editor.png) · [final export](screenshots/2026-09-09-sprint-final/03-final-export.png).

This is a **PROTOTYYPPI**, not customer-approved campaign output. The design uses a single large KitKat pack, a red/cream layout, “Pieni tauko.”, “KitKat mukaan.” and “Poikkea RajaMarketiin”. No old offer, price, expiry or current availability claim was carried forward. Existing frozen local product/logo assets were reused; provenance and hashes accompany the project.

Construction was scripted HTML/CSS/GSAP, including a nested product scene. Actual computer use then changed the message and CTA, enlarged the heading from 152 to 180 px, entered four custom curve coordinates using decimal commas, saved, undid and redid the curve, and exported the MP4 through **Vie video · MP4**. Source inspection confirmed the writes. The download link was activated; the delivered copy is the exact persisted UI export, not a separately rendered CLI substitute.

Visual review caught a white bottom band in the first export. An explicit page background fixed it; the second export was reviewed again in full. CLI check passed (0 layout issues, 22/22 contrast checks); this technical check does not certify creative effectiveness.

Final format: H.264, 1080×1920, 30 fps, 7.000000 s, silent. Reviewed all **140 frames sampled at 20 fps**, plus **8 native opening and 6 native tail frames**. [Manifest](screenshots/2026-09-09-sprint-final/video-final/manifest.json) and [review ledger](screenshots/2026-09-09-sprint-final/video-final/review-ledger.json). The opening is deliberately brief but sparse for .12 s; product appears after .35 s. Final product/copy/CTA hold is clean. The idea is clear and usable as a prototype, but not an exceptional advertising concept or a seamless loop. No audio review is claimed.

Final ad SHA-256: `3f0c98101280a2d7d7b6ed1ae3758589f5f3fc7e7c048c593262b8ec3d849b71`.

## How it feels to use

The combination works best when scripts construct a composition and computer use refines one visible element. Layer names, shared selection, decimal fields, curve handles, receipts and the master timeline make correction practical. Both input methods reach the same saved source and the same rendered output.

It is not yet a complete easy After Effects replacement. Starting a project, attaching media and authoring richer motion still sent me to source files. The right panel requires scrolling, includes duplicated controls and some English technical labels. The current “Vertaa edelliseen” plays the current motion twice and shows the previous curve as a reference; it must not be represented as actual A/B playback.

## Structural audit and final regression

The first commit attempt stopped at the required Fallow gate. The full branch contained unused exports, over-complex motion/preflight/readback functions and duplicate test infrastructure. These were repaired without changing Fallow configuration, bypassing hooks or adding suppressions: animation input parsing and source readback have separate helpers; motion timing/labels are separated from the form and pointer handling; scene tests share their numeric manifest; browser journeys share control, download and ffprobe primitives while retaining their own acceptance assertions.

The tracked synthetic fixture explicitly declares a fail-closed GSAP sentinel. Fixture preparation replaces it with the installed dependency before opening the project; the sentinel cannot masquerade as a working animation library.

`npx --yes bun x fallow audit --base origin/main --format json` now reports **pass**: zero introduced dead-code, complexity or clone findings. One inherited complexity finding and 18 inherited clone groups remain outside the repository's `new-only` gate. [Final structural report](screenshots/2026-09-09-sprint-final/fallow-refactor.json). Post-refactor Ari tests: **26 files / 383 passed**; targeted resize, soft reload, selection, curve and nested writer regressions: **9 files / 114 passed**. Studio typecheck and `ari:build` were rerun after the refactor. Both browser modes were rerun on the final source: each passed 15 checks, with identical scene hashes and MP4 bytes and zero recovery reloads.

## Next sprint, in order

1. **Create and assemble from the same surface.** Add project/template creation, local asset shelf, add/duplicate/reorder elements and scene commands with visible counterparts. Acceptance: new ad from supplied assets with no source-file repair in both mixed and UI-only flows.
2. **Atomic edits and true comparison.** Combine minted ID + motion in one undo; persist a previous revision and render previous/current A/B without changing approved source. Acceptance: undo restores byte-identical files and both previews state their revision.
3. **Pin selection and shorten the panel.** One selected-motion summary, consistent Finnish labels, essential fields above the fold, stable button positions and direct layer/occurrence selection. Acceptance: both viewport sizes complete the same five-minute edit task without searching hidden controls.
4. **Media timing and safe variants.** Expose actual scene duration, explicit trim/rate semantics, then speed ramps; add 1:1 and 16:9 layout checks. Refuse unsupported transforms before writing.
5. **Durable agent loop.** Store brief → assets/copy → actions → receipts → rendered review → bounded correction. Make final-frame/background and first-frame-message checks part of project templates. This is still an external agent workflow, not an autonomous agent inside Studio.

No new tool names were added (12). All changed production TS/TSX files remain below 600 lines. Real branded assets and screenshot evidence stay ignored; the synthetic fixture and code/docs are committed.
