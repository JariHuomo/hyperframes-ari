# B3–B5: visible frozen-version comparison

The visible comparison is implemented. This batch completes the local technical B3–B5 path; C, D and the separate human UX study remain open. It does not claim a new exported ad or customer release.

## Implementation

- [Frozen preview compiler](packages/studio-server/src/ari/versionPreview.ts) reads the checked version manifest, materializes only those bytes in a disposable directory, bundles the existing runtime and replaces remaining resources with data URLs. Temporary files are removed on success and failure. It never reads active source bytes as a fallback. [Route](packages/studio-server/src/routes/ariVersions.ts): `GET /api/ari/projects/:id/versions/preview/:version` returns exact version metadata, dimensions, duration and self-contained HTML.
- [Visible controls](packages/studio/src/ari/AriVersions.tsx) provide named checkpoints, two explicit version choices, equal-aspect frames, shared seek/play, **Säilytä muutos** and separate **Palauta edellinen**. The interval is explicitly zero to the shorter duration; differing aspect ratios refuse. The viewport scales without replacing authored element transforms. Iframes omit `allow-same-origin`; their content policy denies connections, forms and child frames, and permits only embedded resources. Runtime resource failures hide the picture and stop playback.
- [Common comparison service](packages/studio/src/ari/versionComparison.ts) backs both controls and [four agent tools](packages/studio/src/webmcp/tools/versionTools.ts). Comparison reads and closing do not mutate active sources. Restore retains the opening revision, refuses intervening edits and uses [the existing project-history restore](packages/studio/src/utils/projectVersions.ts). Project-scope checks also run inside the write queue and before history publication. Failed scope checks compensate changed files. Selection restoration uses the existing revision guard; a removed target clears selection. A preview error returns a successful persisted receipt with `previewReady: false`, never a false save failure.
- [AriEase](packages/studio/src/ari/AriEase.tsx) now opens the real version selector. The previous double replay was removed. The registered set has 27 tools; the registration test checks the explicit names.

No extra baseline, suppression or structural limit was introduced. A shared [temporary-project test fixture](packages/studio-server/src/ari/versionTestProject.ts) removes duplicated setup while retaining both existing and new tests.

## Evidence

| Check                                                                                                        | Recorded result                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [Ari tests](screenshots/2026-09-10-b-comparison/ari-tests.log)                                               | 39 files / 477 passed                                                           |
| [Targeted restore, selection and tool regressions](screenshots/2026-09-10-b-comparison/regression-tests.log) | 4 files / 30 passed                                                             |
| [Real-file version store and preview tests](screenshots/2026-09-10-b-comparison/server-tests.log)            | 2 files / 12 passed                                                             |
| [Whole-diff structure](screenshots/2026-09-10-b-comparison/structure.json)                                   | Original new-only gate: zero new findings; 26 inherited findings remain visible |
| [Production file lengths](screenshots/2026-09-10-b-comparison/file-lines.json)                               | All changed production files below 600; largest 598                             |

The [visible main journey](packages/studio/tests/e2e/ari-version-comparison.mjs) creates projects using normal authoring controls/tools. It saves **Ennen**, adds a blue background and headline, saves **Jälkeen**, compares both, restores, undoes/redoes and reopens. Four runs cover UI-only and mixed at 1280×800 and 1440×900. Read-only source inspection records hashes; no acceptance source is hand-repaired. UI-only uses visible fields/buttons (including the native color control); read-only tools collect receipts and assertions. Browser automation is not a human test.

[Complete color-comparison report](screenshots/2026-09-10-b-comparison/complete/report.json): four runs × nine checks, `ok: true`. Same-size UI-only and mixed frame PNGs have identical SHA-256 hashes; before and after hashes differ. Runtime text and time are read separately from both frames, so the screenshot difference is not just a label difference. [1280×800 screenshot](screenshots/2026-09-10-b-comparison/complete/ui-only-1280-comparison.png) and [1440×900 screenshot](screenshots/2026-09-10-b-comparison/complete/ui-only-1440-comparison.png) show the pale original and blue edited version with its new headline. These images were visually reviewed. The final post-refactor run is recorded separately below.

[Fresh server/browser report](screenshots/2026-09-10-b-comparison/reopen/report.json): four runs × three checks. Both saved IDs replay after restarting the Node host and opening a fresh browser. Keeping the change preserves the source revision; an ordinary additional edit makes the open comparison's restore stale and is preserved. [Offline guard log](screenshots/2026-09-10-b-comparison/reopen-offline.jsonl) records guard installation before requests. All these successful browser reports have zero page errors, external requests and corrective reloads; optional FFmpeg capability 404s are listed separately.

[Preview tests](packages/studio-server/src/ari/versionPreview.test.ts) use a repository PNG and actual GSAP dependency. After deleting the active image and replacing the active HTML, old preview HTML still contains the exact original image bytes and does not overwrite current HTML. A missing frozen image, corrupt source or absent ID refuses. [Service tests](packages/studio/src/ari/versionComparison.test.ts) cover unequal durations/aspect ratios, invalid time, missing version, stale restore and post-save preview failure. [Real-file history tests](packages/studio/src/utils/projectVersions.test.ts) retain exact binary undo/redo and fault compensation, and add a project-change failure after the restore writes but before history publication. The newer bytes return and no history entry is recorded. [Selection regressions](packages/studio/src/ari/useElementReceiptSelection.test.tsx) retain delayed-preview/resolve protection for newer selection and clearing.

## Boundaries and failed attempts

Replay supports the version store's local classic-script dependency contract with an `index.html` entry. Computed loaders and other unsupported dependencies do not fall back to the active project. This is a local read-only viewer, not a general untrusted-web browsing environment. The compiled framework runtime is the installed local runtime; saved project bytes and dependencies are immutable, but the runtime build itself is not a historical project asset.

The first browser driver used an ambiguous text locator that matched a control other than the textbox. It timed out before the element edit; [failure report](screenshots/2026-09-10-b-comparison/browser/report.json) is retained. The driver now selects the textbox role. The first screenshot review found excess area around the portrait preview; the frame geometry was corrected, then the color proof rerun. Registration tests initially expected 23 tools and now assert all 27 explicitly. The new fixture initially ran under the wrong test environment; the Node environment is explicit. No product assertion was weakened. Some passing Studio Vitest runs retain the pre-existing close-timeout diagnostic and exit zero; it is not counted as a test.

## Commands

From the fork root, no provider or external service calls:

```sh
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/utils/projectVersions.test.ts src/ari/versionComparison.test.ts src/ari/useElementReceiptSelection.test.tsx src/webmcp/tools/versionTools.test.ts
npx --yes bun run --cwd packages/studio-server test src/ari/versionPreview.test.ts src/ari/versionStore.test.ts
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json
```

Start the host in a foreground terminal, with the guard active before any page opens:

```sh
ARI_OFFLINE=1 HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false npx --yes bun run --cwd packages/studio node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
# Separate foreground terminal:
ARI_COMPARISON_EVIDENCE=screenshots/2026-09-10-b-comparison/final npx --yes bun run ari:test:comparison
# Stop the host and start a fresh host before:
ARI_COMPARISON_PRIOR=screenshots/2026-09-10-b-comparison/final/report.json ARI_COMPARISON_EVIDENCE=screenshots/2026-09-10-b-comparison/final-reopen npx --yes bun run ari:test:comparison reopen
```

The existing Node-host workaround is retained; the Bun-hosted Vite startup issue is not claimed resolved. Cost: **0 USD**. No commit, push, stash, checkout or reset.

## Final verification

The final [receipt-verified browser run](screenshots/2026-09-10-b-comparison/verified/report.json) repeats all four visible paths (nine checks each). It also records the actual restore receipt and asserts `ok: true` plus `previewReady: true`. The [fresh-host rerun](screenshots/2026-09-10-b-comparison/verified-reopen/report.json) repeats all four three-check reopen/stale-restore paths. Both viewport sizes were visually reviewed via the [1280×800 comparison](screenshots/2026-09-10-b-comparison/verified/ui-only-1280-comparison.png) and [1440×900 comparison](screenshots/2026-09-10-b-comparison/verified/ui-only-1440-comparison.png). Same-size UI-only and mixed frame hashes match exactly; before/after hashes differ. No corrective source edits or page reloads were used.

The final source change also corrects the empty-selection restore case: preview readiness no longer requires a target handle when selection should remain clear. The selection suite now has 13 tests. Totals above include this regression: 477 Ari tests and 30 targeted tests. [Studio typecheck](screenshots/2026-09-10-b-comparison/typecheck.log), [server typecheck](screenshots/2026-09-10-b-comparison/server-typecheck.log), [build](screenshots/2026-09-10-b-comparison/build.log), [whole-diff lint](screenshots/2026-09-10-b-comparison/lint.log) and [format check](screenshots/2026-09-10-b-comparison/format-check.log) pass. The build retains ordinary chunk-size warnings. [File coverage](screenshots/2026-09-10-b-comparison/format-files.json) and [local-link check](screenshots/2026-09-10-b-comparison/links.json) are recorded.

The latest [server log](screenshots/2026-09-10-b-comparison/verified-server.log) and [offline guard log](screenshots/2026-09-10-b-comparison/verified-offline.jsonl) record the final fresh host. All owned hosts and browsers are stopped; [port check](screenshots/2026-09-10-b-comparison/ports.json) records port 3084 free. No commit or push was made.

## B/C audit corrections — new acceptance evidence

The [full acceptance follow-up](ARI-NEXT-D-FOUNDATION.md#bc-acceptance-follow-up--verified) and [aggregate report](screenshots/2026-09-10-bc-acceptance/report.json) now verify the checked project/history refresh and playing agent seek. Four independent two-context history journeys retain drafts and both editors' changes through refresh/save/undo/redo. Both frozen runtime clocks hold 1.2 seconds over four samples and resume together. Comparison, elements and C-panel regressions pass in UI-only and mixed paths at 1280×800 and 1440×900: 4×10, 4×14 and 4×10 checks respectively. All accepted runs have zero page errors, corrective reloads and external requests. The earlier red element report remains unchanged as historical evidence; its recovery failure is now superseded by the new green runs.

486 Ari tests and 37 targeted tests pass; typecheck, lint, formatting and the original whole-diff structure gate pass without new exemptions. Panel fields remain visible with unchanged before/after button rectangles. Screenshots were visually reviewed; this is not a human usability study. D1–D7 remain open. Local USD 0, no production changes in this acceptance batch, no commit/push; owned browsers and server stopped.
