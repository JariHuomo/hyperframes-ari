# D4 review package — server foundation, changed-motion boundaries, the visible/agent path and attributed assessments

The server prepares a persistent, verified package from one frozen version — the whole video, its first and last frame, and the frames around every changed motion boundary compared against a chosen previous frozen version — and the visible **Tarkistus** path and five bounded agent tools prepare it, show it and record attributed per-category assessments over that same service. D4's technical scope is now complete. It never becomes a quality approval: preparing, showing or assessing a package is not evidence that anyone watched it, an unassessed category reads **puuttuu**, and no human test was performed.

## Shared interface

- [reviewPackage.ts](packages/studio-server/src/ari/reviewPackage.ts): `prepareReviewPackage(root, versionId, render)` returns the published manifest. Use `createReviewRenderer(adapter.startRender.bind(adapter))` as the local Studio adapter. The injected renderer is a trusted server dependency, never a client-supplied callback. Settings are fixed to MP4, standard quality, 30 fps and `index.html`.
- [reviewRenderer.ts](packages/studio-server/src/ari/reviewRenderer.ts): uses Studio's existing `startRender` contract on the private frozen directory and awaits its terminal state. The adapter owns execution, cancellation and timeouts. A failed or cancelled job never produces a ready package. A CSP inserted inside each HTML head blocks external resources and script connections; unsupported headless HTML fragments are refused before rendering. Run the host in the existing offline mode too.
- [versionSnapshot.ts](packages/studio-server/src/ari/versionSnapshot.ts): materializes checksum-verified sources and dependencies, with no current-project fallback. Preparation always disposes this temporary copy. Later source changes cannot alter its bytes. CSP insertion affects only the disposable rendering envelope, not the stored version.
- `readReviewPackage(root, id)` validates the manifest, frame bindings and every offered asset's length/hash. `readReviewAsset(root, id, path)` only serves a manifest-listed video/frame through confined, non-symlink paths. Neither reader needs the current project or an in-memory job table.
- [reviewMedia.ts](packages/studio-server/src/ari/reviewMedia.ts) runs local FFprobe and FFmpeg with argument arrays. [reviewValidation.ts](packages/studio-server/src/ari/reviewValidation.ts) checks output dimensions and frame count against the frozen root composition, refusing truncated or differently sized output.

The package directory is `.ari-notebook/review-packages/<UUID>/`. A private `.preparing-*` directory receives the video, two PNGs, raw FFprobe JSON and manifest. One same-filesystem rename publishes the directory only after all steps succeed. Exceptions remove private staging. A process crash may leave an unlisted `.preparing-*` directory; it is not a readable package. This is atomic publication, not an fsync/power-loss durability guarantee.

The manifest binds package ID, version ID/name, source revision, settings, measured width/height/fps/frame count/duration/audio-stream presence, and each video/frame checksum and byte length. Frame timestamps are `frame / fps`; the final frame is `frameCount - 1`, not the exclusive duration boundary. Coverage was `whole-video-first-last-only` in that foundation batch; the current values are listed under changed-motion boundaries below. Raw FFprobe retains the historical staging filename; clients use manifest assets, never that path.

Storage is under the already excluded notebook directory. Preparation and reads do not change source revision, the version index or undo history, and do not trigger the project signature watcher. Completed packages remain readable independently of later version pruning. There is no package list/delete or retention UI in this foundation.

## Evidence

[Final machine-readable render report](screenshots/2026-09-10-d-review-package/final/report.json) is `ok: true`. The committed-tree synthetic [retimed fixture](packages/studio/tests/e2e/fixtures/ari-retimed/index.html) was copied and its documented GSAP sentinel files replaced from installed local dependencies before freezing. The [reproducible harness](scripts/ari-review-package-evidence.ts) uses the same producer `createRenderJob` / `executeRenderJob` pipeline and Studio manual-edit/motion scripts as the local adapter, through `createReviewRenderer`. No mock video was used for this evidence.

| Measurement                              | Result                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Codec / dimensions                       | H.264 / 1080 × 1920                                                                                                |
| FPS / duration / frames                  | 30 / 6 s / 180                                                                                                     |
| Audio                                    | No audio stream; no audio-quality judgement                                                                        |
| First / final sample                     | Frame 0 at 0 s / frame 179 at 5.966666666666667 s                                                                  |
| Independent FFmpeg extraction            | Both PNGs byte-identical; zero tolerance                                                                           |
| Active source revision and history index | Unchanged                                                                                                          |
| Fresh server-service process             | [reopen.json](screenshots/2026-09-10-d-review-package/final/reopen.json), verified same package and video checksum |
| Vendor spend                             | USD 0                                                                                                              |

Video SHA-256: `5382f38d1a69586b7034574e873169a82afa973216b19af4c68e1a79c5e739d3`.

[First image](screenshots/2026-09-10-d-review-package/final/independent-first.png) and [last image](screenshots/2026-09-10-d-review-package/final/independent-last.png) were visually inspected (the final run is byte-identical to the inspected render-4 images). The first shows a red measurement bar on white; the last is white. This records actual fixture output, not a customer ad or a motion-craft approval. Full-video viewing and movement-boundary correctness are not claimed.

[Tests](screenshots/2026-09-10-d-review-package/tests-final.log): **25 passed in 5 files**. The seven package tests cover current edits during preparation, unchanged history/signature, independent verified reads, corrupt/missing dependencies and outputs, render failure/retry, concurrent preparation, symlink/path refusal, truncated render refusal and altered frame metadata. Three renderer tests cover adapter wiring, CSP and failures. Existing frozen snapshot/preview and signature tests remain green. Package lifecycle tests use a tiny real FFmpeg-generated test clip; the separate final harness provides genuine HTML rendering evidence.

[Typecheck](screenshots/2026-09-10-d-review-package/typecheck.log) and [server build](screenshots/2026-09-10-d-review-package/build.log) passed. [Lint](screenshots/2026-09-10-d-review-package/lint.log) reported zero warnings/errors. Formatting passed. [Whole-diff structure gate](screenshots/2026-09-10-d-review-package/structure-final.json) passes the unchanged original `new-only` policy: zero new findings; one inherited complexity finding and 25 inherited duplicate groups remain visible. No baseline or suppression changes. Largest new production module: 118 lines.

## Changed-motion boundaries

`prepareReviewPackage(root, versionId, render, { previousVersionId })` compares the two frozen versions statically and adds boundary sampling. Without `previousVersionId` nothing changes except the coverage name.

- [reviewStructure.ts](packages/studio-server/src/ari/reviewStructure.ts) reads one frozen version: every composition reachable from `index.html`, each placement's affine level, and each file's motions through the existing `parseGsapScriptAcorn`. Studio's [sceneTime.ts](packages/studio/src/ari/sceneTime.ts) owns the master ↔ scene-local contract, but it derives its numbers from the clip manifest a running player publishes, and `@hyperframes/studio` depends on this package rather than the other way round. The same recurrence is therefore applied here to the authored attributes, where `data-start` is already parent-local: `A = A_parent + (start − P_parent) / R_parent`, `P = data-playback-start`, `R = R_parent · data-playback-rate`, and `master = A + (local − P) / R`. An instance ends at its host window or at its own local clamp, whichever comes first. Attributes that are not constant, a non-positive rate or duration, a source outside the project, a cycle and a depth above eight are all recorded as notes and excluded — never guessed.
- [reviewBoundaries.ts](packages/studio-server/src/ari/reviewBoundaries.ts) diffs motions per composition file by parser id and a fingerprint over selector, method, position, resolved start, duration, ease, properties and keyframes. An added or changed motion is sampled from the CURRENT version's video; a removed one from the PREVIOUS version's video, which is rendered only when such a boundary exists. Every boundary names its `versionId`, its source file, its motion id, its instance (`hostPath`, label, `index/count`) and both its scene-local and master time. Boundaries are sorted by master time and capped at 60, and the cap is stated in the notes.
- Frame rule: `frame = round(time × fps)`; the three samples are that frame minus one, that frame, and that frame plus one. A frame outside `[0, frames)` is published as `outside-video` with no image. A frame another sample already captured from the same video is published as `reused` pointing at the same bytes. Nothing is silently dropped.
- `withinInstance: false` marks an edge that this instance's clock never reaches — for example a scene-local time before the instance's `data-playback-start`. The master time is still reported and still sampled, because the reviewer needs to see what is on screen there.
- Coverage is one of `first-version` (no previous version given), `changed-motion-boundaries`, `changed-motion-boundaries-partial` (every refusal listed verbatim in `coverageNotes`) and the legacy `whole-video-first-last-only`, which readers still accept but the producer no longer writes. A structure that cannot be read as constant timing can never produce complete coverage.
- [reviewCapture.ts](packages/studio-server/src/ari/reviewCapture.ts) extracts the PNGs; [reviewAssets.ts](packages/studio-server/src/ari/reviewAssets.ts) binds each published file by length and SHA-256.

### Package contract for the UI batch

`ReviewPackage` now also carries `previousVersionId`, `previousVersionName`, `previousMeasured`, `previousVideo` (`previous.mp4`, or `null`), `coverage`, `coverageNotes`, `boundaryFrames` (`boundary-<n>.png` with `frame`, `time`, `versionId`) and `boundaries` (each with three samples). `readReviewPackage` validates every binding — a renamed, duplicated or retimed boundary frame, a sample naming an unpublished frame, a sample from the other version's video, an `outside-video` sample that still claims an image, a boundary bound to neither version, and a legacy coverage value that nevertheless carries boundaries. `readReviewAsset` serves only manifest-listed paths, including the boundary frames and the previous video. `ffprobe.json` now holds `{ current, previous }`. Preparation still writes nothing outside `.ari-notebook/review-packages/`, changes no source revision, version index or undo history, and refuses `previousVersionId === versionId`.

### Boundary evidence

One real local render pair from the committed synthetic [retimed fixture](packages/studio/tests/e2e/fixtures/ari-retimed/index.html), whose `scenes/card.html` is placed twice at `data-playback-start=0.5` and `data-playback-rate=0.5`. The harness authored the two versions itself: version 1 adds a second `#marker` tween (`opacity`, 1.2 s → 1.6 s scene-local) and version 2 removes it and shortens the `fromTo` from 2 s to 1.5 s. This is a server harness, not a browser acceptance run.

[Machine-readable report](screenshots/2026-09-10-d-review-boundaries/final/report.json) is `ok: true`, coverage `changed-motion-boundaries`, no notes. Both videos measured 1080 × 1920, 30 fps, 6 s, 180 frames. Eight boundaries, eighteen published frames, twenty independent FFmpeg extractions — the two whole-video frames and every boundary frame — byte-identical at zero tolerance against the video the manifest names.

| Change  | Edge  | Instance | Scene-local | Master | Reachable | Sampled from | Frames                           |
| ------- | ----- | -------- | ----------- | ------ | --------- | ------------ | -------------------------------- |
| changed | start | 1/2      | 0 s         | −1 s   | no        | current      | −31/−30/−29, all `outside-video` |
| removed | start | 1/2      | 1,2 s       | 1,4 s  | yes       | previous     | 41/42/43                         |
| changed | end   | 1/2      | 1,5 s       | 2 s    | yes       | current      | 59/60/61                         |
| changed | start | 2/2      | 0 s         | 2 s    | no        | current      | 59/60/61, all `reused`           |
| removed | end   | 1/2      | 1,6 s       | 2,2 s  | yes       | previous     | 65/66/67                         |
| removed | start | 2/2      | 1,2 s       | 4,4 s  | yes       | previous     | 131/132/133                      |
| changed | end   | 2/2      | 1,5 s       | 5 s    | yes       | current      | 149/150/151                      |
| removed | end   | 2/2      | 1,6 s       | 5,2 s  | yes       | previous     | 155/156/157                      |

The retimed second placement is exactly `2 + (local − 0,5) / 0,5` and the first is `(local − 0,5) / 0,5`; both match the runtime seek in `packages/core/src/runtime/init.ts`. The images were inspected visually: [previous frame 42](screenshots/2026-09-10-d-review-boundaries/final/independent-boundary-1.png) and [previous frame 132](screenshots/2026-09-10-d-review-boundaries/final/independent-boundary-10.png) show the red measurement bar at the same position, which is what two placements of the same scene at the same scene-local time must look like. A fresh process reread the package and its video checksum: [reopen.json](screenshots/2026-09-10-d-review-boundaries/final/reopen.json).

Video SHA-256 `2b92b84e184bb8dd3e949c101dac190c3c0764f06d2b2b907dbc1cdc6b92bc1d`; previous video `cf086a0b0baf129ebb477913f13c023e0a34a53a7b630b52fee287bd7ffd88cf`. [FFprobe of both](screenshots/2026-09-10-d-review-boundaries/ffprobe.json). Vendor spend USD 0.

[Tests](screenshots/2026-09-10-d-review-boundaries/tests.log): **56 passed in 8 files**, including 8 boundary-planning tests (added, changed, removed, a repeated scene whose second instance is retimed, `data-playback-start`, an unreachable edge, the frame rule and out-of-video frames), 2 structure tests (a two-level chain multiplying 2 × 1,5, a missing file, a cycle, non-constant timing) and 18 manifest-validation tests. Whole suite [ari:test](screenshots/2026-09-10-d-review-boundaries/ari-test.log): **489 passed in 42 files**. [Server typecheck](screenshots/2026-09-10-d-review-boundaries/typecheck.log) and [lint](screenshots/2026-09-10-d-review-boundaries/lint.log) clean; formatting passes. [Whole-diff structure gate](screenshots/2026-09-10-d-review-boundaries/structure.json) passes the unchanged original `new-only` policy with **zero new findings** (one inherited complexity finding, 25 inherited duplicate groups); `.fallowrc.jsonc` is unchanged and nothing is suppressed. Largest new production module: 245 lines.

### What this batch found and did not fix

The 1,5 s boundary frames of the shortened tween are blank in both versions, and so is everything after master 2 s in the first placement. That is not a boundary-mapping error: the timeline seek in `runtime/init.ts` scales scene-local time by the host's rate, but clip visibility in `packages/core/src/runtime/clipTree.ts` resolves a nested clip's window with `resolveStartForElement` plus its own `data-duration` in UNSCALED master time. A `data-duration="2"` clip inside a scene played at rate 0,5 therefore disappears at master 2 s even though its scene is on screen until master 3 s. This is pre-existing runtime behaviour, visible in the previous version too, and it is exactly the kind of thing a boundary package exists to surface. It is recorded here, not fixed, and `withinInstance` deliberately describes the timeline window only — it never promises the animated element is painted.

## Issues found during validation

The initial CSP prefix before the document broke composition parsing; insertion now occurs inside the existing head and is tested. The first nested render attempt also revealed the fixture's intentional unprepared GSAP sentinel; the harness now resolves both GSAP files from the local installation before freezing. A later harness import used the wrong package resolution root and was fixed. Failed attempts remain in the evidence directory; none published a complete package. The stalled sentinel run's owned process tree was stopped. Successful render logs are in [render.log](screenshots/2026-09-10-d-review-package/render.log).

## Verification commands

Run from repository root; use a fresh evidence directory for a new render. These commands perform local work only.

```sh
npx --yes bun run --cwd packages/studio-server test src/ari/reviewPackage.test.ts src/ari/reviewRenderer.test.ts src/ari/versionSnapshot.test.ts src/ari/versionPreview.test.ts src/helpers/projectSignature.test.ts
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run node --import tsx scripts/ari-review-package-evidence.ts screenshots/2026-09-10-d-review-package/final
npx --yes bun run node --import tsx scripts/ari-review-package-evidence.ts screenshots/2026-09-10-d-review-package/final --read
npx --yes bun x --no-install oxlint packages/studio-server/src/ari/review*.ts scripts/ari-review-package-evidence.ts
npx --yes bun x --no-install oxfmt --check packages/studio-server/src/ari/review*.ts scripts/ari-review-package-evidence.ts ARI-NEXT-D-REVIEW-PACKAGE.md plans/2026-09-09-ari-studio-next-implementation.md
npx --yes bun run --cwd packages/studio-server test src/ari/reviewBoundaries.test.ts src/ari/reviewStructure.test.ts src/ari/reviewValidation.test.ts
npx --yes bun run node --import tsx scripts/ari-review-package-evidence.ts screenshots/2026-09-10-d-review-boundaries/final --boundaries
npx --yes bun run node --import tsx scripts/ari-review-package-evidence.ts screenshots/2026-09-10-d-review-boundaries/final --read
npx --yes bun run ari:test
npx --yes bun x --no-install fallow audit --base origin/main --fail-on-issues --format json
```

## Visible path and agent tools

Preparation and viewing now run through one service from both sides. D4 remains partial: there are still no attributed assessments, no viewing record and no quality approval.

- [ariReview.ts](packages/studio-server/src/routes/ariReview.ts) registers four routes under `/api/ari/projects/:id/review`: `GET` lists, `POST /prepare` renders and publishes, `GET /:pkg` returns the verified manifest, and `GET /:pkg/asset?path=` serves one manifest-listed file. The asset route resolves the media type from the published path and refuses anything else — `manifest.json` and `ffprobe.json` beside it are not served. The renderer is injected server-side from the Studio adapter; the client never supplies one.
- [reviewList.ts](packages/studio-server/src/ari/reviewList.ts) reads each manifest and validates its internal bindings, newest first, and deliberately does not hash the media: a row is a menu entry, not an integrity certificate. One damaged manifest becomes `readable: false` with its reason instead of failing the whole listing. Private `.preparing-*` staging can never appear, because it does not match the package-id shape.
- [reviewPackages.ts](packages/studio/src/utils/reviewPackages.ts) is the single client transport. [reviewTools.ts](packages/studio/src/webmcp/tools/reviewTools.ts) exposes `studio_prepare_review_package`, `studio_list_review_packages` and `studio_read_review_package` over it, with `viewed: false`, `approved: false` and `assetUrls` derived from the manifest so an agent never guesses a path. The registry is now 36 tools, the two extra names being the assessment commands below.
- [AriReview.tsx](packages/studio/src/ari/AriReview.tsx) is the **Tarkistuspaketti** control inside the **Tarkistus** section, and it calls those same tools rather than a private fetch. The visible state is the request's own — _kesken_, _valmis_, _epäonnistui_ — because preparation is one awaited publish, and a failed attempt publishes nothing, so the retry needs no cleanup. [AriReviewView.tsx](packages/studio/src/ari/AriReviewView.tsx) shows the video, the first and last frame and every boundary's before/at/after frames with its version name, scene-local and master time; an `outside-video` sample states that it has no image, a `reused` sample says it is the same frame as an earlier boundary. The Finnish coverage sentence names what was sampled, and the panel states that a prepared package is material to look at, not evidence anyone watched it and not a quality approval.
- [reviewRenderer.ts](packages/studio-server/src/ari/reviewRenderer.ts) now carries the adapter's own failure reason into the refusal; without it every failed preparation read identically.

### Evidence

[Final acceptance report](screenshots/2026-09-10-d-review-ui/final/report.json) is `ok: true`: four visible headed runs — ui-only and mixed at 1280 × 800 and 1440 × 900 — nine checks each, `pageErrors`, `unexpectedHttpErrors`, `externalRequestsBlocked` and `workspaceReloads` all zero, `providerSpendUsd: 0`. The twelve recorded 409s are the refusals this journey provokes on purpose and are asserted to be exactly three per case: one confined-path read of `manifest.json` and two failed preparations (the agent tool and the visible button). `acceptanceRun` gained an explicit `expectedHttpError` predicate for that; every other journey still fails on any non-2xx.

Each case builds the same synthetic ad with the current project, element and motion actions, freezes **Ennen** and **Jälkeen**, and prepares a package for **Jälkeen** against **Ennen**.

| Measurement                              | Result                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real MP4 (ffprobe of the published file) | 1080 × 1920, 30 fps, 210 frames — equal to the manifest in every case                                                                                                      |
| Coverage                                 | `changed-motion-boundaries`, no notes                                                                                                                                      |
| Boundaries / boundary frames             | 2 (the added motion's start at master 1 s and end at 1,6 s) / 6, all `captured`                                                                                            |
| Shown assets                             | Every `img`/`video` source fetched in the page: 9 files, each byte length and SHA-256 equal to the manifest                                                                |
| Path outside the manifest                | Refused (409)                                                                                                                                                              |
| Source revision / version index          | Unchanged by preparation                                                                                                                                                   |
| Failed preparation                       | A version whose frozen `index.html` blob was deleted refuses with `Version aineisto puuttuu tai on vioittunut: index.html`; the listing is byte-identical before and after |
| Vendor spend                             | USD 0                                                                                                                                                                      |

[Fresh-server reopen report](screenshots/2026-09-10-d-review-ui/final-reopen/report.json) is `ok: true` for all four projects: a server and browser started after the packages were written list the same package id, read the same video checksum and the same boundary count, and the page still carries the no-approval sentence. This run happens **after** the deleted version blob, so it also proves a published package keeps working when its own frozen version has lost a dependency.

Screenshots were inspected visually: [ui-only 1280](screenshots/2026-09-10-d-review-ui/final/ui-only-1280-review.png), [mixed 1440](screenshots/2026-09-10-d-review-ui/final/mixed-1440-review.png), [mixed 1440 reopen](screenshots/2026-09-10-d-review-ui/final-reopen/mixed-1440-reopen.png). The failed attempts that produced the current shape remain as `attempt-1.log` … `attempt-7.log` in the same directory: a `studio_elements` target used where a look handle was required, a layer click that landed on a control disabled by an in-flight write, a receipt wait that asked `studio_inspect` after the write had cleared the selection, a mis-spelled Finnish substring, and a version count that assumed no automatic checkpoints.

The offline server logs ([final](screenshots/2026-09-10-d-review-ui/server-network-final.jsonl), [reopen](screenshots/2026-09-10-d-review-ui/server-network-final-reopen.jsonl)) contain only the offline guard's own installation line. The producer host runs under a Chrome wrapper pinned to a dead proxy, so a render cannot reach the network either.

[ari:test](screenshots/2026-09-10-d-review-ui/ari-test.log): **496 passed in 44 files**. [Targeted server tests](screenshots/2026-09-10-d-review-ui/server-tests.log): **47 passed in 7 files**, including three new listing tests and three new route tests (prepare/list/read/serve, refused ids and paths, failed render publishing nothing, and a package whose media was altered after publication). Studio adds four `reviewTools` tests and three `AriReviewView` tests. [Typechecks](screenshots/2026-09-10-d-review-ui/typecheck.log) and [ari:build](screenshots/2026-09-10-d-review-ui/build.log) pass; [lint](screenshots/2026-09-10-d-review-ui/lint.log) reports zero warnings and errors and formatting passes over the whole diff. [Whole-diff structure gate](screenshots/2026-09-10-d-review-ui/structure.json) passes the unchanged original `new-only` policy with **zero introduced findings** (one inherited complexity finding, 25 inherited duplicate groups); `.fallowrc.jsonc` is unchanged and nothing is suppressed. Its first run reported three introduced duplicate groups, which were removed by sharing `ariaSelect`, `panelTab` and `startAcceptanceCase` from the acceptance harness and by reordering the prepare route — not by suppression. Largest new production module: 209 lines.

## Attributed assessments

An assessment is what a **named** reviewer said about one package, in one of four separate categories: message, layout, motion and audio. It is stored in the project notebook that already holds the brief, the tasks and the observations — there is no second, parallel record of the same thing.

- [reviewAssessments.ts](packages/studio-server/src/ari/reviewAssessments.ts) binds one row to a manifest: the package id, its frozen `versionId`, its `sourceRevision` and its declared `coverage` are **copied from the verified manifest**, never from the caller, so a `*-partial` package can never carry a claim of full coverage. `checkedBoundaries` is `"all"` or indexes into that package's own boundary list, deduplicated and sorted; an index the package never had is refused. `reviewerType` is `human`, `external_agent` or `test_data` — there is deliberately **no** `technical` value, because ffprobe, frame extraction and this repository's own browser journeys are measurements, not opinions.
- [notebook.ts](packages/studio-server/src/ari/notebook.ts) gained one `assessment` action over its existing conditional save. It calls `readReviewPackage` first, which re-verifies every published asset, so an assessment can never name a package whose media is missing or altered. A notebook written before this batch reads back with no assessments rather than failing. The shared value guards moved to [notebookValues.ts](packages/studio-server/src/ari/notebookValues.ts) so the notebook and the assessments cannot disagree about what a valid value is.
- [reviewAssessmentsView.ts](packages/studio-server/src/ari/reviewAssessmentsView.ts) joins the stored rows with the packages still on disk and always reports **all four** categories, so an unassessed one is `missing` instead of absent. `measured` (including `measured.audio`) is reported beside the categories and never inside one. A row is `stale` when the project's current source revision has moved past the package's own revision (`source_changed`) or when the package can no longer be read (`package_unreadable`); either way the assessment stays in history with its reasons.
- [ariReview.ts](packages/studio-server/src/routes/ariReview.ts) adds `GET`/`POST /assessments`, registered **before** `/:pkg` because `assessments` is a word, not a package id. The write is conditional on the notebook token the read returned, so two sessions holding the same token cannot both append and neither reviewer's row is silently lost.
- [reviewTools.ts](packages/studio/src/webmcp/tools/reviewTools.ts) exposes `studio_record_review_assessment` and `studio_read_review_assessments` over the same transport the visible path uses, both returning `approved: false`.
- [AriReviewAssessments.tsx](packages/studio/src/ari/AriReviewAssessments.tsx) is the visible **Arviot** block under the package view. It calls those tools, shows the measurement in its own line, offers the four categories, the reviewer, the reviewer type, the verdict, "Katsoin koko videon", "Tarkastin kaikki N rajaa" or individual boundaries and a justification, and lists every recorded row with **puuttuu**, **kirjattu** or **vanhentunut** and, when stale, the reason plus "Arvio säilyy historiassa".

Recording an assessment writes only `.ari-notebook/notebook.json`: no source revision, no version index, no undo stack and no new version checkpoint. Recording is still not a release approval — that is D7.

### Assessment evidence

[Final acceptance report](screenshots/2026-09-10-d-review-assessments/final/report.json) is `ok: true`: four visible headed runs — ui-only and mixed at 1280 × 800 and 1440 × 900 — **12 checks each**, with `pageErrors`, `externalRequestsBlocked` and `workspaceReloads` all zero. The 409s are the same three deliberate refusals per case as before; the sixteen 404s are the optional `/api/environment/ffmpeg` probe.

| Assessment measurement    | Result                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before any assessment     | All four categories `missing` in every case                                                                                                                                                 |
| Recorded                  | message, layout and motion, each `Hyväksyntäajo` / `test_data`, `packageCoverage` equal to the package's own `changed-motion-boundaries`, `versionId` equal to the package's frozen version |
| Deliberately not recorded | audio — status stays `missing` beside `measured.audio: false`, and the page reads "Ääni: puuttuu … Puuttuva arvio ei ole hyväksyntä."                                                       |
| After recording           | Source digest, version count and revision all unchanged                                                                                                                                     |
| After a real source edit  | message, layout and motion all `stale` with `staleReasons: ["source_changed"]`, one assessment each — none deleted, none rewritten; audio still `missing`                                   |
| Fresh server and browser  | Same four statuses, same rows, audio still `puuttuu`                                                                                                                                        |
| Vendor spend              | USD 0                                                                                                                                                                                       |

The recorded assessments are marked `test_data` because a browser journey typed them. **No human watched these videos and no human test was performed.** Preparing a package, extracting frames, probing with ffprobe and running this journey are technical work; none of them is a viewing record or a quality approval.

[Fresh-server reopen report](screenshots/2026-09-10-d-review-assessments/final-reopen/report.json) is `ok: true` for all four projects with **5 checks each**: a server and browser started after the writes list the same package, read the same video checksum and boundary count, and show the same three stale assessments and the same missing audio category.

Screenshots inspected visually: [ui-only 1280 recording](screenshots/2026-09-10-d-review-assessments/final/ui-only-1280-assessments.png), [ui-only 1440 after the source edit](screenshots/2026-09-10-d-review-assessments/final/ui-only-1440-assessments-stale.png), [mixed 1280 after the source edit](screenshots/2026-09-10-d-review-assessments/final/mixed-1280-assessments-stale.png), [mixed 1440 reopen](screenshots/2026-09-10-d-review-assessments/final-reopen/mixed-1440-reopen.png). [attempt-tdz-failure.png](screenshots/2026-09-10-d-review-assessments/attempt-tdz-failure.png) is the first failed attempt, kept as evidence: the journey's category table was a `const` evaluated after the top-level run had already started.

[ari:test](screenshots/2026-09-10-d-review-assessments/ari-test.log): **500 passed in 45 files**. [Server tests](screenshots/2026-09-10-d-review-assessments/server-tests.log): **369 passed in 31 files**, including five new assessment route tests (recording and missing categories, a refused stale token that loses neither session's row, staleness after a source edit, staleness when the package becomes unreadable, and refusals for `technical`, an unknown package, an out-of-range boundary, a non-boolean coverage claim, a blank reviewer and tampered media) and four new unit tests (manifest binding, byte-exact restore when a save fails midway, a pre-assessment notebook, and the always-four-categories rule). Studio adds two `reviewTools` cases and three `AriReviewAssessments` cases. [Typechecks](screenshots/2026-09-10-d-review-assessments/typecheck.log) and [ari:build](screenshots/2026-09-10-d-review-assessments/build.log) pass; [lint](screenshots/2026-09-10-d-review-assessments/lint.log) and [formatting](screenshots/2026-09-10-d-review-assessments/format.log) are clean over [every changed file](screenshots/2026-09-10-d-review-assessments/checked-files.txt). The [whole-diff structure gate](screenshots/2026-09-10-d-review-assessments/structure.json) passes the unchanged original `new-only` policy with **zero introduced findings** (one inherited complexity finding, 25 inherited duplicate groups — one fewer than before, because the review route fixture is now shared); `.fallowrc.jsonc` is unchanged and nothing is suppressed. Its first run reported five introduced dead exports, three introduced complexity findings and one introduced duplicate group; all were removed by narrowing exports, extracting the tool dispatch and the package-row defaults, and sharing the reopen helper — not by suppression. Largest new production module: 288 lines.

The offline server logs ([final](screenshots/2026-09-10-d-review-assessments/server-network.jsonl), [reopen](screenshots/2026-09-10-d-review-assessments/server-network-reopen.jsonl)) contain only the offline guard's own installation line.

### Interface for D5–D7

- `readReviewAssessments(root)` returns `{ token, revision, packages[] }`; each package row carries `packageId`, `versionId`, `coverage`, `boundaryCount`, `measured`, `readable`, `sourceChanged` and the four `categories`, each `missing`, `current` or `stale` with its assessments.
- An assessment row carries `packageId`, `versionId`, `packageRevision`, `packageCoverage`, `category`, `reviewer`, `reviewerType`, `createdAt`, `wholeVideoWatched`, `checkedBoundaries`, `verdict`, `stale` and `staleReasons`. D5's repair-round limit and D7's version-bound approval can key off `packageId` + `packageRevision` and must treat `missing` and `stale` as **not** assessed.
- Everything is stored in the notebook's conditional save, so a repair-round counter or an approval belongs in the same file and the same token contract rather than a new store.

## Remaining delivery

D5–D7 follow: a task-bound limit of at most two repair rounds, protection for approved copy, **Pysäytä työ**, an orderly end to a half-finished save, and a version-bound local approval that expires on a source change. No viewing record, quality approval, human testing or D5–D7 completion is claimed here. No external service calls, commits or pushes; owned render processes and the foreground host were stopped and port 3084 is free.

## Verification commands for this batch

```sh
ARI_OFFLINE=1 ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-d-review-ui/server-network-final.jsonl" HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false PRODUCER_LOW_MEMORY_MODE=1 PRODUCER_HEADLESS_SHELL_PATH="$PWD/screenshots/2026-09-10-d-review-ui/chrome-offline.sh" npx --yes bun run --cwd packages/studio node --import tsx node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
ARI_REVIEW_EVIDENCE=screenshots/2026-09-10-d-review-ui/final npx --yes bun run ari:test:review
# restart the server, then:
ARI_REVIEW_EVIDENCE=screenshots/2026-09-10-d-review-ui/final-reopen ARI_REVIEW_PRIOR=screenshots/2026-09-10-d-review-ui/final/report.json npx --yes bun run ari:test:review reopen
npx --yes bun run --cwd packages/studio-server test src/ari/reviewList.test.ts src/routes/ariReview.test.ts src/ari/reviewPackage.test.ts src/ari/reviewBoundaries.test.ts src/ari/reviewStructure.test.ts src/ari/reviewValidation.test.ts src/ari/reviewRenderer.test.ts
npx --yes bun run --cwd packages/studio test src/webmcp/tools/reviewTools.test.ts src/ari/AriReviewView.test.tsx src/ari/AriReviewAssessments.test.tsx src/webmcp/useStudioAgentTools.test.tsx
npx --yes bun run --cwd packages/studio-server test src/ari src/routes
ARI_REVIEW_EVIDENCE=screenshots/2026-09-10-d-review-assessments/final npx --yes bun run ari:test:review
# restart the server, then:
ARI_REVIEW_EVIDENCE=screenshots/2026-09-10-d-review-assessments/final-reopen ARI_REVIEW_PRIOR=screenshots/2026-09-10-d-review-assessments/final/report.json npx --yes bun run ari:test:review reopen
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck && npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
npx --yes bun x --no-install fallow audit --base origin/main --fail-on-issues --format json
```
