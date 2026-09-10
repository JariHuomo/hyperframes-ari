# A5 — saved source and real export parity

A5 delivers local export verification for the approved [feature specification](plans/2026-09-09-ari-studio-next-features-spec.md). This is a synthetic, silent engineering ad, not a customer-approved campaign or a human usability test. B3–B5's persistent version store and comparison UI, C and D remain separate work.

## Implementation

- [The mutation coordinator](packages/studio/src/utils/studioFileMutationCoordinator.ts) exposes `waitForStudioFileMutations()`. [The shared render queue](packages/studio/src/components/renders/useRenderQueue.ts) waits for pending DOM saves and the common file transaction queue before requesting a render. [App](packages/studio/src/App.tsx) supplies the same save barrier to all queue consumers.
- [The render snapshot](packages/studio/vite.ariRenderSnapshot.ts) freezes local bytes before asynchronous rendering. Its verification now compares file membership as well as every checksum: changed, added or removed files during preparation reject the capture. Symlinks and nonregular files are refused. Project caches, dependency directories and output directories are excluded. This temporary render snapshot is deleted after the job; it is not the future persistent version store.
- [The adapter](packages/studio/vite.adapter.ts), [render routes](packages/studio-server/src/routes/render.ts) and [job types](packages/studio-server/src/types.ts) carry `sourceRevision` to the start receipt, job history and metadata. Metadata includes `sourceFiles`, a path-to-SHA-256 map. [AriExport](packages/studio/src/ari/AriExport.tsx) shows the export revision and explains that later edits require another export. Preparation, an active render or a failed attempt hides the previous download in this control.
- [Screenshot capture](packages/engine/src/services/screenshotCapture.ts) preserves the macOS regular-Chrome compositor safeguard even when DOM height fits the viewport. The previous later downgrade produced an 87-pixel background strip. [The remaining screenshot service](packages/engine/src/services/screenshotService.ts) keeps the existing API through explicit re-exports; both production files remain below 600 lines.
- [The scene writer](packages/studio/src/ari/sceneStructure.ts) assigns new scene hosts a CSS stacking layer as well as a timeline track. An existing authored override is preserved. Otherwise a base headline with its own z-index could sit above the new scene in preview. The added scene-operation regression checks both stored layer fields.
- [Undo/redo](packages/studio/src/hooks/useAppHotkeys.ts) reconciles structural preview rows before invalidating animation reads. This prevents refetching the just-deleted copy through stale timeline rows.
- [Scoped timeline registration](packages/core/src/compiler/scopedWindowScript.ts), used by [composition scoping](packages/core/src/compiler/compositionScoping.ts), preserves an authored alias already owned by another instance. A detached copy previously overwrote the first instance's actual timeline when the authored composition ID matched that host. Reads prefer this instance's runtime entry. This was caught by inspecting the actual video, although four equally wrong videos had passed the parity comparison.

## Acceptance method

[The visible scene journey](packages/studio/tests/e2e/ari-scene-structure.mjs) creates the project, imports the repository's synthetic raster, adds the headline and movements, creates/reorders/duplicates scenes, detaches one copy, edits only that copy, exercises undo/redo and reopens the project. [Authoring helpers](packages/studio/tests/e2e/ari-export-authoring.mjs) use visible controls for UI-only writes and the bounded tools for mixed writes. Tool reads inspect both paths; they do not write acceptance source files. The prepared bootstrap is separate from the ad created in the journey.

The before/after copy screenshots explicitly seek the same master time and wait for fonts and two browser paint frames; a saved receipt is not proof that the compositor has painted. Runtime times and clip styles are recorded beside those screenshots. The tolerance was not increased.

The result is 14 seconds: the initial seven-second canvas, a two-second original scene, a two-second independent copy and a three-second final scene. This duration follows the actual append operation; it is not reported as a seven-second video. The synthetic content intentionally includes empty space and a plain final scene; the test proves production behavior, not creative quality.

[The export driver](packages/studio/tests/e2e/ari-scene-export.mjs) clicks Studio's MP4 export and download controls. It checks the displayed revision, metadata and every saved input checksum. FFprobe must report 1080×1920, 30/1 fps and 14 seconds. It decodes first/last frames and frames on both sides of scene and movement boundaries. All 420 decoded frames must match across the four paths, with zero pixel tolerance. The image must also appear in both the original and detached scene: equal output alone is insufficient. A separate bottom-edge check allows at most three RGB levels for compression; the measured background pixels are identical.

## Constant-rate and failure regression

[The separate retimed driver](packages/studio/tests/e2e/ari-retimed-export.mjs) prepares [the repository fixture](packages/studio/tests/e2e/fixtures/ari-retimed/index.html), replacing its GSAP sentinel with the installed local package. It is explicitly a prepared regression fixture, not an ad built through the UI. It detaches the second instance and changes only that copy's motion through the normal tool. Both real exports are 1080×1920, 30 fps, six seconds. Original source bytes remain unchanged.

| Master time | Instance | Local time (`0.5 + elapsed × 0.5`) | Original x | Edited x | Expected edited x |
| ----------- | -------- | ---------------------------------- | ---------- | -------- | ----------------- |
| 0.5 s       | first    | 0.75 s                             | 250        | 250      | 250               |
| 1.5 s       | first    | 1.25 s                             | 350        | 350      | 350               |
| 3.5 s       | second   | 0.75 s                             | 250        | 167      | 166.667           |
| 4.5 s       | second   | 1.25 s                             | 350        | 300      | 300               |

[Pixel measurement](packages/studio/tests/e2e/ari-retimed-pixels.mjs) allows two pixels for H.264 chroma subsampling and fractional edges. This tolerance applies to measured edge location, not cross-path frame parity.

[Failure injection](packages/studio/tests/e2e/ari-export-faults.mjs) returns one deliberate POST transport 503. The UI displays the error and hides the previous download. The next attempt performs a real successful render. After the server's start receipt, a normal tool changes the active copy from red to blue while rendering continues. The exported red video retains the preceding source revision and decoded samples; the successful edit receipt identifies the newer blue source. Preparation-time create/change/delete races are tested on real temporary files in the snapshot unit tests. These are different tests, not a claim that the browser race happened during snapshot preparation.

## Offline execution and retained failures

All accepted browsers are visible and install external-request interception before navigation. The server runs with `ARI_OFFLINE=1` and its fetch guard. Render Chrome uses a loopback-only proxy configuration before launch; [the wrapper](screenshots/2026-09-10-a5/chrome-offline.sh), [arguments](screenshots/2026-09-10-a5/chrome-args.log) and [server guard log](screenshots/2026-09-10-a5/server-network.jsonl) retain the configuration. Font attempts were refused before network access. No external provider calls, USD spend, commit or push.

Earlier attempts remain in [the evidence directory](screenshots/2026-09-10-a5/): Bun's Vite process stalled, Node without the TypeScript loader could not load the producer, the unprepared regression fixture refused its GSAP sentinel, a draft driver used the visible time label rather than the input’s accessible name, and an early fixture lacked its local motion plugin. Corrected runs use Node with `--import tsx` through `npx --yes bun`, local dependencies and a fresh server after compiler changes. The `node` compiler export resolves built output, so core must be rebuilt before restarting after compiler edits. No acceptance source was manually repaired.

The rejected video runs retain the bottom-strip and overwritten-timeline evidence. One rejected browser run also records the obsolete undo animation-read 404. Known optional `/api/environment/ffmpeg` compatibility 404 probes remain separately listed; they are not hidden and do not represent the real MP4 export path. Some Vitest runs print a close-timeout warning after all tests pass; their exit status is checked separately. Human testing and audio assessment were not performed.

## Verification commands

Run from `/Users/jarihuomo/Documents/GitHub/hyperframes-ari`. `npx --yes bun` is used because Bun is not installed on PATH. The server command stays in a foreground terminal; browser commands run in another foreground terminal. Build before starting the server so the Node compiler export is current.

```sh
npx --yes bun run ari:build
ARI_OFFLINE=1 ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-a5/server-network.jsonl" HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false PRODUCER_LOW_MEMORY_MODE=1 PRODUCER_HEADLESS_SHELL_PATH="$PWD/screenshots/2026-09-10-a5/chrome-offline.sh" npx --yes bun run --cwd packages/studio node --import tsx node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
ARI_SCENE_EXPORT=1 ARI_SCENE_COPY=1 ARI_SCENE_STRUCTURE_EVIDENCE=screenshots/2026-09-10-a5/complete npx --yes bun run ari:test:scene-structure
ARI_SCENE_EXPORT=1 ARI_RETIMED_EVIDENCE=screenshots/2026-09-10-a5/final-retimed npx --yes bun run ari:test:retimed
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/ari/AriExport.test.tsx src/components/renders src/utils/studioFileMutationCoordinator.test.ts vite.ariRenderSnapshot.test.ts src/hooks/useAppHotkeys.previewForwarding.test.tsx src/ari/sceneOperations.test.ts
npx --yes bun run --cwd packages/studio-server test src/routes/render.test.ts
npx --yes bun run --cwd packages/core test src/compiler
npx --yes bun run --cwd packages/engine test src/services/frameCapture.test.ts src/services/screenshotService.test.ts
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run --cwd packages/core typecheck
npx --yes bun run --cwd packages/engine typecheck
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json
```

Formatting and lint cover the union of `git diff --name-only` and `git ls-files --others --exclude-standard`, existing `.ts/.tsx/.mjs/.md` files, excluding `examples/` and `screenshots/`. Run `./node_modules/.bin/oxfmt --check` on that complete list and `./node_modules/.bin/oxlint` on its code files. The exact expanded file list is retained in `checked-files.json`. The line gate checks changed/new production `.ts/.tsx` files under `packages/`, excluding tests; it requires strictly fewer than 600 lines. No new suppression or baseline change was introduced.

## Final evidence

[Four visible acceptance runs](screenshots/2026-09-10-a5/complete/report.json): `ok: true`, 14 checks per run, `equivalentSources: true`, `equivalentExportFrames: true`, no page errors, no unexpected HTTP errors, no external requests and no corrective reloads. Sixteen optional FFmpeg compatibility probes are separately recorded. Every MP4 measures 1080×1920 / 30 fps / 14 s. Every decoded frame matches, not just the sampled boundaries. The common 420-frame digest is `f3b439fdf21958c07b7dd0e82f40d8f5dd4eec2f49eb696e08b3d73bcd01a7bd`.

| Path    | Viewport | Export source revision                                             | MP4 SHA-256                                                        |
| ------- | -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| ui-only | 1280×800 | `45abef96c59f37589266b3c6f6b2d2799b853cc32cdd94fa7c7c036036a6418a` | `a707506684a58fcc55002b18bf97aaf3a7c0b898bf7b86466cb9a6f5992dce2c` |
| ui-only | 1440×900 | `29f661b280eeb1c06c4199f1c86e7cc3e4a565edb63932250f7c6af7e889544e` | `a707506684a58fcc55002b18bf97aaf3a7c0b898bf7b86466cb9a6f5992dce2c` |
| mixed   | 1280×800 | `b3b7ffaee2f777f19c6159bf44bb09453cf311c9737da96028d0adac4623f76c` | `a707506684a58fcc55002b18bf97aaf3a7c0b898bf7b86466cb9a6f5992dce2c` |
| mixed   | 1440×900 | `eff57620547da63934972c1957243c797d4dfeae34ce13f53b155d61c4070363` | `a707506684a58fcc55002b18bf97aaf3a7c0b898bf7b86466cb9a6f5992dce2c` |

The report stores each source-file hash, full FFprobe output, download path, frame PNG path and RGB digest, as well as the read/write receipts and reopened state. Before/after copy screenshots explicitly show the selected instance at the same time. Their normalized mean RGB error is 0, 0.4271, 0 and 0 out of 255; the existing limit remains 1. The nonzero pair was visually inspected: content and geometry match, with a narrow capture-edge difference. It is not described as byte-identical screenshots.

[Retimed and failure report](screenshots/2026-09-10-a5/final-retimed/report.json): `ok: true`; three successful real six-second exports, the intentional failed request, the successful retry and the saved blue edit receipt. Runtime and exported edge positions match the table above. No page errors, unexpected HTTP errors, external requests or corrective reloads.

[Visual review sheet](screenshots/2026-09-10-a5/final-contact-sheet.png) samples the 14-second video every 0.5 seconds in chronological order. In addition, first/last frames and scene/movement-boundary PNGs in the four export directories were checked. The background fade, headline hold, original image entrance, independent-copy message and plain final scene match the authored test content. The lower-edge strip and missing original scene are gone. This sampling and automated full-frame parity do not constitute a human UX study or a creative-quality certificate.

[Prepared regression composition check](screenshots/2026-09-10-a5/prepared-composition-check.json) also passed lint, runtime, layout, motion and contrast. Its earlier unprepared-fixture failure remains in `composition-check.json`. The CLI takes a positional project directory; `--project` was rejected before the corrected invocation.

## Final verification results

[Command outcomes and log paths](screenshots/2026-09-10-a5/verification.json) record exit 0 for every command below. Counts are per suite and must not be summed as unique tests.

| Gate                                                                | Actual result                                     |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| [ari](screenshots/2026-09-10-a5/gate-ari.log)                       | Test Files 37 passed (37), Tests 468 passed (468) |
| [studio-tests](screenshots/2026-09-10-a5/gate-studio-tests.log)     | Test Files 12 passed (12), Tests 63 passed (63)   |
| [server-tests](screenshots/2026-09-10-a5/gate-server-tests.log)     | Test Files 1 passed (1), Tests 38 passed (38)     |
| [compiler-tests](screenshots/2026-09-10-a5/gate-compiler-tests.log) | Test Files 10 passed (10), Tests 274 passed (274) |
| [engine-tests](screenshots/2026-09-10-a5/gate-engine-tests.log)     | Test Files 2 passed (2), Tests 60 passed (60)     |
| [studio-types](screenshots/2026-09-10-a5/gate-studio-types.log)     | Pass, exit 0                                      |
| [server-types](screenshots/2026-09-10-a5/gate-server-types.log)     | Pass, exit 0                                      |
| [core-types](screenshots/2026-09-10-a5/gate-core-types.log)         | Pass, exit 0                                      |
| [engine-types](screenshots/2026-09-10-a5/gate-engine-types.log)     | Pass, exit 0                                      |
| [build](screenshots/2026-09-10-a5/gate-build.log)                   | Pass, exit 0                                      |

[Formatting](screenshots/2026-09-10-a5/final-format.log): 148 files checked, clean. [Lint](screenshots/2026-09-10-a5/final-lint.log): 135 code files, zero warnings/errors. [Whole-diff structure](screenshots/2026-09-10-a5/final-structure.json): pass under the unchanged `new-only` gate; zero introduced findings, one inherited complexity finding and 25 inherited duplicate groups remain visible. [Production line counts](screenshots/2026-09-10-a5/line-gate.json): pass; largest changed production file is 598 lines. No configuration/baseline change or new suppression. `git diff --check` also passes.

The final verification driver is [retained](screenshots/2026-09-10-a5/verify-final.py). The Studio server and its render processes were stopped; [process cleanup](screenshots/2026-09-10-a5/stopped-processes.json) records the owned processes. Port 3084 is free. Existing unrelated sessions were left alone. Changes remain uncommitted on `ari/agent-studio`; no push, stash, checkout or reset.

[The synthetic MP4](screenshots/2026-09-10-a5/complete/ui-only-1280-export/scene-ops-ui-only-1280-1788999590502_2026-09-10_03-20-01.mp4) is the UI-only 1280×800 result. [The UI-built composition check](screenshots/2026-09-10-a5/main-composition-check.json) passes with zero lint, runtime, layout, motion and contrast errors. It is supplementary to, not a replacement for, the real export comparisons.
