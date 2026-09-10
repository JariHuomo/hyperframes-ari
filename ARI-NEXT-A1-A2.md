# Ari next features — A1–A2 implementation and evidence

Implemented locally on 9 September 2026 in `hyperframes-ari`, branch `ari/agent-studio`. This delivers new projects and copied image assets. It does **not** complete the whole next-features specification.

## Delivered scope

The visible **Uusi mainos / aineisto** dialog works both without an open project and inside Ari. Its three views are **Uusi mainos**, **Aineisto** and **Avaa mainos**. The customer chooses a name and either a blank or product template, checks the seven-second duration, 1080×1920 size and actual destination, then creates the project. Changing the proposal clears confirmation. An existing directory is never overwritten.

Both templates have a registered, paused, seekable GSAP master timeline. The blank contains only a background with a 0.8-second entrance; the product template has a synthetic product image, headline and CTA. Both last seven seconds and have no audio. Fonts, their licence, GSAP and MotionPathPlugin are copied from installed dependencies into the project. No CDN is needed by these templates.

The image shelf accepts PNG, JPEG and WebP, copies original bytes into the project and shows original names and thumbnails. Each selected file has its own outcome: a rejected image does not roll back another successful import. Identical bytes reuse the existing asset. Reopening the project works after the disposable source images have been deleted. Import does not yet place an image on the composition.

| Area                                                                | Implementation                                                                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project proposal, exclusive creation, real file receipts            | [adProjects.ts](packages/studio-server/src/ari/adProjects.ts), [projectTemplates.ts](packages/studio-server/src/ari/projectTemplates.ts)                                                            |
| Conditional source creation, replacement, deletion and compensation | [conditionalFiles.ts](packages/studio-server/src/ari/conditionalFiles.ts), [conditionalFileTransaction.ts](packages/studio/src/utils/conditionalFileTransaction.ts)                                 |
| Image validation, copying, checksums and shelf                      | [imageImport.ts](packages/studio-server/src/ari/imageImport.ts)                                                                                                                                     |
| Shared HTTP services and bounded requests                           | [ariAuthoring.ts](packages/studio-server/src/routes/ariAuthoring.ts), [vite.request-body.ts](packages/studio/vite.request-body.ts), [vite.config.ts](packages/studio/vite.config.ts)                |
| Visible UI and empty-workspace entry                                | [AriProjects.tsx](packages/studio/src/ari/AriProjects.tsx), [AriProjectStart.tsx](packages/studio/src/ari/AriProjectStart.tsx), [StudioSplash.tsx](packages/studio/src/components/StudioSplash.tsx) |
| Six discoverable agent operations using the same services as the UI | [projectTools.ts](packages/studio/src/webmcp/tools/projectTools.ts), [useStudioAgentTools.ts](packages/studio/src/webmcp/useStudioAgentTools.ts)                                                    |
| Selection surviving workspace refresh; Finnish layer labels         | [useServerConnection.ts](packages/studio/src/hooks/useServerConnection.ts), [domEditingDom.ts](packages/studio/src/components/editor/domEditingDom.ts)                                              |

The tool catalogue now has **18 names**: the original twelve plus `studio_projects`, `studio_prepare_project`, `studio_create_project`, `studio_open_project`, `studio_import_images` and `studio_images`. Imports receive explicit named base64 bytes, never an arbitrary server path or remote URL. Cancellation stops subsequent images while retaining completed receipts. When every file fails, the result is `ok: false`, `stage: "not_saved"`; mixed results retain per-file receipts and set `partial: true`.

The host owns the creation root (`StudioApiAdapter.authoringRoot`); the local Vite host supplies it. Hosts without that capability refuse creation. Customer identity, arbitrary destination roots and template source are not agent inputs.

## File contract and safety evidence

`expectedVersion: null` means the path must be absent; `content: null` means delete it. An empty string is an existing empty file, with its own hash. Reads return `exists`, nullable `content` and nullable `version`. Creates use exclusive publication; replacements are first written to a private temporary file, so a partial write does not truncate the original. Every written file is considered during compensation. A conflicting external change is retained and incomplete compensation is reported.

Paths are confined to the canonical project root; traversal and descendant symlinks, including dangling symlinks, are refused. Encoded image size is bounded while receiving the request, before decoding. Magic bytes, extension agreement, actual decoding, dimensions and single-image constraints are checked. Native decoding is serialized and has a ten-second timeout.

This is synchronous process-level compensation, **not** a crash-safe multi-file transaction or an operating-system-wide compare-and-swap primitive. Version checks reject observed conflicts; a hostile independent process racing between system calls is outside that guarantee. Full persistent history for creating/deleting source files remains an A3 integration task; this batch does not promise undo for project creation or media import.

The service tests cover missing versus empty files, stale versions, deletion, exclusive concurrent project creation, partial temporary writes, rollback after a later failure, preserving externally changed/recreated files, attempting the remaining compensations, path/symlink rejection, malformed/truncated images and shelf checksum tampering. Existing B1–B2 string callers retain the explicit `diskContent` precondition; null is no longer accidentally replaced by a fallback through `??`.

## Measured import limits

Retained **8 MiB encoded / 16,000,000 pixels decoded**, at most twenty files per selection, decoded one at a time. Measurement host: Darwin arm64, Sharp 0.35.3, libvips 8.18.3. Five decodes of each uniform synthetic PNG:

| Fixture  | Encoded bytes | Decoded RGB bytes | Measured decode time, ms                    | Outcome  |
| -------- | ------------: | ----------------: | ------------------------------------------- | -------- |
| 1 MP     |        16,007 |         3,000,000 | 1.68 / 1.45 / 1.74 / 1.19 / 1.24            | Accepted |
| 4 MP     |        60,175 |        12,000,000 | 3.38 / 2.65 / 3.27 / 2.67 / 2.91            | Accepted |
| 16 MP    |       224,449 |        48,000,000 | 9.05 / 8.77 / 10.41 / 8.92 / 9.32           | Accepted |
| 16.81 MP |       233,895 | No decoded output | Refused in 0.50 / 0.14 / 0.10 / 0.08 / 0.08 | Rejected |

A deterministic noisy 1500×1500 PNG was 6,763,537 bytes and decoded in 2.97 ms. A noisy 2000×2000 PNG was 12,023,329 bytes and was rejected before decoding in 0.05 ms. An 8,388,609-byte input was rejected in 0.03 ms. These are local synthetic measurements, not a general photograph-performance guarantee. The pixel ceiling bounds an RGBA pixel buffer to 64 MB; it is not a bound on total process RSS or all native allocations.

[Raw measurements](screenshots/2026-09-09-a1-a2/image-measurements.json), [generator](packages/studio-server/scripts/measure-ari-images.ts), [versionable fixture README](packages/studio/tests/e2e/fixtures/ari-authoring/README.md). The small raster fixtures are repository files rather than ignored `examples/*` assets; large noisy inputs are regenerated in memory. Tests do not depend on RajaMarket files.

## Verification

| Check                                      | Actual result                                                                          | Evidence                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Server authoring suites                    | 4 files, **33 passed**                                                                 | [server-tests.log](screenshots/2026-09-09-a1-a2/server-tests.log)                                                                        |
| Focused Studio suites                      | 6 files, **33 passed**                                                                 | [studio-tests.log](screenshots/2026-09-09-a1-a2/studio-tests.log)                                                                        |
| Ari regression suite                       | 27 files, **389 passed**                                                               | [ari-tests.log](screenshots/2026-09-09-a1-a2/ari-tests.log)                                                                              |
| Studio / studio-server typecheck           | Passed                                                                                 | [Studio](screenshots/2026-09-09-a1-a2/studio-typecheck.log), [server](screenshots/2026-09-09-a1-a2/server-typecheck.log)                 |
| `ari:build`                                | Passed                                                                                 | [build.log](screenshots/2026-09-09-a1-a2/build.log)                                                                                      |
| Headed UI-only and mixed paths             | **11 checks each**, `ok: true`, no page errors, no attempted external browser requests | [browser-report.json](screenshots/2026-09-09-a1-a2/browser-report.json), [browser.log](screenshots/2026-09-09-a1-a2/browser.log)         |
| Real composition checks, blank and product | `ok: true`; lint, runtime and sampled layout passed; duration seven seconds            | [check-blank.json](screenshots/2026-09-09-a1-a2/check-blank.json), [check-product.json](screenshots/2026-09-09-a1-a2/check-product.json) |
| Formatting and lint for this batch         | Passed                                                                                 | [format-lint.log](screenshots/2026-09-09-a1-a2/format-lint.log)                                                                          |
| Fallow changed-file audit                  | Passed; 22 inherited findings excluded by the diff gate                                | [fallow.log](screenshots/2026-09-09-a1-a2/fallow.log)                                                                                    |

The final gate check found 18 registered tool names and every changed production TypeScript file below 600 lines (largest 588, including the earlier B1–B2 work). The foreground server was stopped and port 3084 is free. [Final gates](screenshots/2026-09-09-a1-a2/final-gates.json).

The focused and Ari totals overlap and must not be added together as unique tests. Studio Vitest emits a ten-second shutdown timeout warning after successful test completion; the command exits zero. This warning is not presented as a test failure or concealed as a perfectly clean shutdown.

The browser runner uses real UI clicks and file input in UI-only mode; mixed mode uses discoverable tools for the same writes. Creation receipts in UI-only mode are observed from actual HTTP responses. It creates both templates, attempts duplicate names and compares original bytes, accepts three image formats among three individual rejections, compares copied bytes, deletes disposable originals and opens a fresh page. It checks the shelf at **1280×800 and 1440×900**, Escape and the visible headline after seeking to one second. There are no source-file hand repairs in either flow. Bootstrap setup uses the local project service. This is headed browser automation, **not human usability testing**.

Direct visual evidence: [UI-only shelf, 1280×800](screenshots/2026-09-09-a1-a2/ui-only-shelf-1280x800.png), [UI-only shelf, 1440×900](screenshots/2026-09-09-a1-a2/ui-only-shelf-1440x900.png), [mixed shelf, 1280×800](screenshots/2026-09-09-a1-a2/mixed-shelf-1280x800.png), [mixed shelf, 1440×900](screenshots/2026-09-09-a1-a2/mixed-shelf-1440x900.png), [creation review](screenshots/2026-09-09-a1-a2/ui-only-product-before-create.png), [composition at one second](screenshots/2026-09-09-a1-a2/ui-only-composition.png).

The complete screenshot set is in [the evidence directory](screenshots/2026-09-09-a1-a2/); filenames and creation project IDs are generated by [ari-authoring.mjs](packages/studio/tests/e2e/ari-authoring.mjs). The browser JSON contains the exact project directories, source hashes, real creation/import receipts and copied-image checksums. CLI check artifacts refer to the previous successful browser run's unchanged generated templates. They validate composition structure/runtime/layout; they are not an exported-video or creative-quality certificate. MP4 parity belongs to the later A5 end-to-end acceptance batch.

## Defects found during this batch

- Empty-workspace polling could replace a newly selected project using a stale URL hash. Selection now reads the current hash when the request completes; a regression test covers it.
- A failed single-image receipt initially interrupted the UI import loop. It now records that file's result and continues; the final headed flows cover rejection between successful imports. All-failed agent calls correctly report failure.
- The first truly static blank failed HyperFrames' static-sweep check. A real, visible background entrance fixes it without disabling the validator or adding an invisible sentinel.
- Finnish layer labels were mangled by ID humanization; explicit `data-label` now takes precedence and is tested.
- The Vite bridge previously buffered request bytes before route limits. It now rejects oversized authoring bodies while reading; the chunked-body regression proves it stops before consuming the remaining chunks.
- Creation's aggregate version initially represented only one asset. It now hashes the complete saved manifest, covered by a service test.

## Network and computer-use record

Paid/model/provider spend was **0 USD**. During initial exploration, opening the old `ari-sandbox` invoked the existing font normalizer, which fetched Google Fonts. This was an unintended external call, so the whole task cannot honestly be described as network-free. Early browser testing also intercepted an attempted CDN MotionPathPlugin load. The new templates were corrected to use locally copied fonts and plugin files. Final headed runs have `externalRequestsBlocked: []`; the fresh final server log has no font fetch. No external model or paid media service was used.

A separate Chrome computer-use session created `ari-a1-a2-tietokonetesti` through the visible form. Its extension refused file upload because file-URL access was disabled. That permission was not changed. The independent headed repository browser tests completed the upload flow instead. This is a tooling limitation, not evidence that computer-use upload succeeded. There was no human test participant.

## Interface for A3–A5 and remaining work

Use the same project ID and copied asset receipt (`path`, checksum, dimensions, format and byte count); do not reintroduce external image paths when placing media. New source operations can use `GET /api/ari/projects/:id/source?path=…` and `POST /api/ari/projects/:id/source-transaction` with `{ files: [{ path, expectedVersion, content }] }`. Null distinguishes absence/deletion from empty content. The route accepts 1–20 HTML/CSS/JS/JSON files, with a 2 MiB body bound, and returns saved file versions. It is not an arbitrary agent source-write tool.

Before exposing A3–A5 edits, connect these nullable snapshots to persistent history and common UI/agent operations. Add text/image/background placement, ordering and own-scene-copy operations; retain version checks and prove undo/redo across create/delete. Real persisted before/after comparison, the full panel redesign and the local notebook remain later batches. No claim is made for A3–A5, B3–B5, C1–C5 or D1–D7 completion. Human usability testing remains explicitly unperformed.

## Exact reproduction commands

Run from the repository root. Use two foreground terminals for the server and headed runner; stop the server with Ctrl-C afterwards.

```sh
npx --yes bun install --offline --frozen-lockfile --ignore-scripts
npx --yes bun run --cwd packages/studio-server test src/ari src/routes/ariAuthoring.test.ts
npx --yes bun run --cwd packages/studio test src/webmcp/tools/projectTools.test.ts src/webmcp/useStudioAgentTools.test.tsx src/utils/conditionalFileTransaction.test.ts src/hooks/useServerConnection.test.tsx src/components/editor/domEditingDom.labels.test.ts vite.request-body.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
npx --yes bun run ari:measure:images
npx --yes bun run ari:studio --port 3084
# In the second terminal, while the foreground server is available:
npx --yes bun run ari:test:authoring
```

Actual checked template directories (preserved locally):

```sh
HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 CI=1 npx --yes bun packages/cli/bin/hyperframes.mjs check packages/studio/data/projects/ari-a1a2-ui-only-blank-1788980982328 --json
HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 CI=1 npx --yes bun packages/cli/bin/hyperframes.mjs check packages/studio/data/projects/ari-a1a2-ui-only-product-1788980982328 --json
npx --yes bun x fallow audit --base origin/main --fail-on-issues
```

Formatting/lint inputs are listed in [changed-files.json](screenshots/2026-09-09-a1-a2/changed-files.json). Run installed `node_modules/.bin/oxfmt --check` on that list and `node_modules/.bin/oxlint` on its `.ts`, `.tsx`, `.mjs` entries. These checks apply to this batch; the earlier uncommitted B1–B2 implementation is preserved. Evidence and generated local projects are ignored runtime artifacts; synthetic fixture files and the runner are versionable. No commit, push, stash, checkout or reset was performed.
