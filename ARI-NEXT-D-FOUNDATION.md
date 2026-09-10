# B/C foundation: two-session history recovery

The shared project/history refresh is implemented and verified in one visible two-session journey. D1–D3 (the notebook and durable operation reconciliation) remain unimplemented. The wider B/C viewport regression matrix is now verified in the acceptance follow-up below.

## Shared interface and consistency rules

- [usePersistentEditHistory.ts](packages/studio/src/hooks/usePersistentEditHistory.ts) exposes `refresh(readSources: () => Promise<void>)` on both the controller and the project-bound hook. It replaces the complete undo/redo state through the history queue, not just a token around old stacks.
- [projectVersions.ts](packages/studio/src/utils/projectVersions.ts) implements the storage adapter's checked refresh. It reads the server index, runs the source-reading callback, then re-reads the index. Both the project revision and index token must match. Only then does it publish the new history token and return the stacks. Source, shelf, final-index or consistency failures leave the old local stacks and token unchanged. Legacy nullable history remains supported; `diskContent` write preconditions are unchanged.
- [studioFileMutationCoordinator.ts](packages/studio/src/utils/studioFileMutationCoordinator.ts) drains accepted source mutations before the checked read. Its temporary read barrier refuses new source transactions with a recoverable message while the refresh is running. It releases the barrier on success or failure. This is a local coordination barrier, not a cross-browser lock: later remote writes still face the existing source and history preconditions.
- [refreshProjectTool.ts](packages/studio/src/webmcp/tools/refreshProjectTool.ts) adds the discoverable `studio_refresh_project({ sourceFile })`. It reads source-backed elements and the image shelf within that checked refresh, returning `ok`, `stage: "refreshed"`, `projectId`, the project `revision`, source `version`, `sourceFile`, `elements`, `assets`, `affectsInstances`, `undoCount` and `redoCount`. The project revision check covers the captured project, including changes outside the requested source. Failure returns the ordinary `ok: false / kind / reason` contract. It does not write source files or create a version.
- [AriElements.tsx](packages/studio/src/ari/AriElements.tsx) calls the same tool from **Päivitä tilanne**. It updates the remote rows and shelf without resetting the local name/text/image/color draft or applying a selection. Normal post-save refresh remains separate. The current selection continues to come from the shared selection owner. The history conflict now directs the user to this action instead of reopening the project.

The next notebook batch may invoke the same checked refresh before reconciling an operation. This is **not** an idempotent operation journal and must not be described as safe automatic retry of an unknown write.

## New evidence

| Verification                                                                                                                      | Result                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Targeted history, real-file, coordinator, tool and dialog tests](screenshots/2026-09-10-history-recovery/tests-complete.log)     | 6 files / 37 passed                                                                                              |
| [Final selection and tool tests](screenshots/2026-09-10-history-recovery/selection-and-tool-final.log)                            | 2 files / 8 passed; includes a newer selection during delayed refresh                                            |
| [Ari regression suite](screenshots/2026-09-10-history-recovery/ari-tests-final.log)                                               | 41 files / 486 passed                                                                                            |
| [Studio typecheck](screenshots/2026-09-10-history-recovery/typecheck-complete.log)                                                | Pass                                                                                                             |
| [Full workspace build](screenshots/2026-09-10-history-recovery/build.log)                                                         | Pass, exit 0                                                                                                     |
| [Whole-diff structure audit](screenshots/2026-09-10-history-recovery/structure-complete.json)                                     | Original `new-only` gate passes; zero new findings, 1 inherited complexity finding and 25 inherited clone groups |
| [Production line gate](screenshots/2026-09-10-history-recovery/line-gate.json)                                                    | 99 changed/new production TypeScript files, all below 600 lines; maximum 598                                     |
| [Formatting](screenshots/2026-09-10-history-recovery/format-final.log) / [lint](screenshots/2026-09-10-history-recovery/lint.log) | Pass on this task's files                                                                                        |

The real-file tests use two independent history controllers against the actual Studio API and a temporary project directory. They prove both successful edits survive a refresh, undo and redo; a stale write returns the exact prior bytes; source-read failure, a concurrent source write, and an index-only change reject the refresh without replacing the old token/stacks. A following stale write still refuses and compensates its source write. The coordinator test proves accepted writes finish before refresh, new writes are refused during it, and a failed read releases the barrier.

The [visible browser report](screenshots/2026-09-10-history-recovery/browser-settled/report.json) records **3 checks, `ok: true`**, two independent browser contexts at **1280×800**, zero page errors, zero corrective reloads and zero external requests. Both clients are opened before the first edit. The second client's stale history write is refused; the source remains byte-identical. Its visible refresh preserves both draft fields, then save/undo/redo succeeds. The first client uses the discovered refresh tool, preserves its selected handle, and saves/undoes/redoes another change. The final persisted history has three undo entries and no redo entries. Source hashes, source content, refresh/write receipts and selection identities are in the report. No acceptance source was manually repaired.

Visually reviewed: [conflict and retained draft](screenshots/2026-09-10-history-recovery/browser-settled/conflict.png), [recovered preview](screenshots/2026-09-10-history-recovery/browser-settled/recovered.png), [agent continuation](screenshots/2026-09-10-history-recovery/browser-settled/agent-recovered.png). The deliberately overlapping synthetic text is a history fixture, not an ad-design acceptance result. The preview screenshots wait for the restored content to appear. The only HTTP errors are the existing optional `/api/environment/ffmpeg` 404 probes, separately listed in the report.

## Commands and limitations

Run from the repository root:

```sh
npx --yes bun run --cwd packages/studio test src/webmcp/tools/refreshProjectTool.test.ts src/utils/studioFileMutationCoordinator.test.ts src/utils/projectVersions.test.ts src/hooks/usePersistentEditHistory.refresh.test.ts src/hooks/usePersistentEditHistory.test.ts src/ari/AriElements.test.tsx
npx --yes bun run --cwd packages/studio test src/ari/AriElements.test.tsx src/webmcp/tools/refreshProjectTool.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json
ARI_OFFLINE=1 ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-history-recovery/server-network.jsonl" HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false npx --yes bun run --cwd packages/studio node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
# In a separate foreground terminal while that server runs:
ARI_HISTORY_EVIDENCE=screenshots/2026-09-10-history-recovery/browser-settled npx --yes bun run ari:test:history-recovery
```

[Server network guard log](screenshots/2026-09-10-history-recovery/server-network.jsonl): installed before opening a project. The successful browser driver uses Node via the Bun package script. An initial direct Bun driver attempt failed serializing a DOM handle (`e.focus is not a function`); its [report](screenshots/2026-09-10-history-recovery/browser/report.json) remains. A later [attempt](screenshots/2026-09-10-history-recovery/browser-verified/report.json) timed out because the screenshot wait looked only for light-DOM iframes; the final driver inspects the actual frame tree, including shadow-hosted previews. Neither failure was repaired by reloading a page. Earlier reports remain untouched.

Vitest reports its existing ten-second Vite shutdown delay on some successful test runs; this is not a browser failure or evidence that the separate Bun/Vite issue is fixed. The build retains existing bundle-size warnings. No format/lint/structure exemptions or baseline changes were added.

Owned browser contexts and the foreground server are stopped; [process/port evidence](screenshots/2026-09-10-history-recovery/ports.json). No provider calls, external services, commit, push, stash, checkout or reset; USD 0. No human UX test was performed.

## Earlier checkpoint (historical)

The initial foundation only supplied a queued controller refresh and two in-memory tests: [original log](screenshots/2026-09-10-d-foundation/history.log), 2 files / 13 passed. It did not connect UI/agent refresh or test real files. That limited result is superseded for history recovery by the evidence above, but is not reclassified as notebook delivery. D1–D7 remain open; the broader B/C acceptance matrix is recorded below.

## B/C acceptance follow-up — verified

[Aggregate report](screenshots/2026-09-10-bc-acceptance/report.json) records **148 successful checks** across the following visible, offline runs. This is new evidence on the checked refresh and existing seek/advance implementation, not a reclassification of earlier results. No production changes were needed in this batch. The history driver now supports both viewport sizes and UI-only writes/selection/refresh; the comparison driver measures both actual frozen runtime clocks while seeking during playback.

| Journey                                             | New evidence                                                                        | Result        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| Two independent browser contexts, UI-only, 1280×800 | [report](screenshots/2026-09-10-bc-acceptance/history-ui-verified-1280/report.json) | 3 checks      |
| Two independent browser contexts, UI-only, 1440×900 | [report](screenshots/2026-09-10-bc-acceptance/history-ui-verified-1440/report.json) | 3 checks      |
| Two independent browser contexts, mixed, 1280×800   | [report](screenshots/2026-09-10-bc-acceptance/history-mixed-1280/report.json)       | 3 checks      |
| Two independent browser contexts, mixed, 1440×900   | [report](screenshots/2026-09-10-bc-acceptance/history-mixed-1440/report.json)       | 3 checks      |
| Frozen comparison, both paths and sizes             | [report](screenshots/2026-09-10-bc-acceptance/comparison-verified/report.json)      | 4 × 10 checks |
| Element regression, both paths and sizes            | [report](screenshots/2026-09-10-bc-acceptance/elements/report.json)                 | 4 × 14 checks |
| C-panel regression, both paths and sizes            | [report](screenshots/2026-09-10-bc-acceptance/panel/report.json)                    | 4 × 10 checks |

Both clients open before editing. The stale write restores the exact source bytes; the visible refresh retains the unsaved name and text. The next save and undo/redo preserve both clients' work. The first client then refreshes through its assigned path, retains selection, and adds/undoes/redoes another edit. Each final persisted history has three undo entries and no redo entries. Reports contain receipts, versions, final source bytes and selection identities; the aggregate adds SHA-256 hashes. UI-only mutations and selection use visible controls; source/history inspection uses read-only tool/API probes. Comparison creation/editing follows the assigned path; **the targeted playback-seek probe deliberately uses the agent command on every path**.

The seek probe starts from running playback beyond four seconds, requests **1.2 seconds**, then reads both `window.__player.getTime()` values across four samples separated by two animation frames. All eight values per case are exactly **1.2**. Resumed playback reaches **1.4333333333333333** in both frames in every case. Active-source SHA-256 remains unchanged through comparison and seeking; restore/undo/redo returns the expected source hashes. The requested time is on the 30 fps frame grid: initial [timeout](screenshots/2026-09-10-bc-acceptance/comparison/report.json) and [diagnostic](screenshots/2026-09-10-bc-acceptance/comparison-diagnostic/report.json) reports retain the test's mistaken exact 1.25-second expectation. The diagnostic measured 1.2333333333333334 on both runtimes; no product workaround or tolerance was added.

Visual review: [comparison and nested-image contact sheet](screenshots/2026-09-10-bc-acceptance/visual-contact.png), [1280 panel](screenshots/2026-09-10-bc-acceptance/panel/ui-only-1280-motion.png), [1440 review](screenshots/2026-09-10-bc-acceptance/panel/mixed-1440-review.png), and [retained history content](screenshots/2026-09-10-bc-acceptance/history-ui-only-1440/recovered.png). Frozen frames show a cream/blue and text difference. Nested-image selection remains on the second instance. C-panel fields have `scrollTop: 0`; their before/after rectangles match, including the save button at y=603, height=40 in both sizes. The empty panel-preview frame at 9 seconds is before the motion begins at 9.2; the comparison at 9.5 shows both texts. Overlapping text in the history fixture is intentional for source/history testing, not ad-design acceptance. This is automation plus agent visual inspection, not human UX testing.

Every accepted report has zero page errors, corrective reloads and external requests. Existing optional FFmpeg capability 404s remain separately listed. The [server guard log](screenshots/2026-09-10-bc-acceptance/server-network.jsonl) records installation before opening any project and no outbound attempts. No acceptance sources were manually repaired. The original [red C element report](screenshots/2026-09-10-c-panel/elements-final/report.json) remains `ok: false`, untouched; its checksum is in the aggregate.

Validation: [486 Ari tests / 41 files](screenshots/2026-09-10-bc-acceptance/ari-tests.log), [37 targeted tests / 8 files](screenshots/2026-09-10-bc-acceptance/targeted.log), [Studio typecheck](screenshots/2026-09-10-bc-acceptance/typecheck.log), [lint](screenshots/2026-09-10-bc-acceptance/lint-final.log), [format check](screenshots/2026-09-10-bc-acceptance/format.log). The existing Vitest ten-second shutdown warning remains, with successful test exits. [Whole-diff structure](screenshots/2026-09-10-bc-acceptance/structure-last.json): original `new-only` gate passes, zero new findings, one inherited complexity finding and 25 inherited clone groups. Configuration/baselines were not changed. The initial new test helper exceeded complexity; it was split without removing checks. [Line gate](screenshots/2026-09-10-bc-acceptance/line-gate.json): 129 production TypeScript files changed/new relative to origin/main, maximum 599 lines, all below 600.

Reproduction (repository root; foreground Node/Vite host through Bun, as above, with `ARI_OFFLINE_LOG` pointed at this evidence directory):

```sh
ARI_HISTORY_MODE=ui-only ARI_HISTORY_WIDTH=1280 ARI_HISTORY_EVIDENCE=screenshots/2026-09-10-bc-acceptance/history-ui-verified-1280 npx --yes bun run ari:test:history-recovery
# Repeat with width 1440; use mode=mixed for the two mixed cases and distinct evidence directories.
ARI_COMPARISON_EVIDENCE=screenshots/2026-09-10-bc-acceptance/comparison-verified npx --yes bun run ari:test:comparison
ARI_ELEMENTS_EVIDENCE=screenshots/2026-09-10-bc-acceptance/elements npx --yes bun run ari:test:elements
ARI_PANEL_EVIDENCE=screenshots/2026-09-10-bc-acceptance/panel npx --yes bun run ari:test:panel
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/utils/projectVersions.test.ts src/hooks/usePersistentEditHistory.refresh.test.ts src/utils/studioFileMutationCoordinator.test.ts src/ari/versionComparison.test.ts src/webmcp/tools/versionTools.test.ts src/webmcp/tools/refreshProjectTool.test.ts src/ari/AriElements.test.tsx src/ari/AriPanelSections.test.tsx
npx --yes bun run --cwd packages/studio typecheck
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json
```

Owned browser contexts and foreground server stopped; [port 3084 free](screenshots/2026-09-10-bc-acceptance/ports.json). USD 0. No external service calls, commit, push, stash, checkout or reset. D1–D7 remain unimplemented; the Bun/Vite-specific startup issue and human UX study are not claimed resolved.
