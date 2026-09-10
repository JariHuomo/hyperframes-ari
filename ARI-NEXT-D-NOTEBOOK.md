# D1/D3: project-local notebook

The scoped notebook is implemented. **D1 remains partial:** goals, agreed copy, selected assets, manual tasks and observations persist; verified source-operation receipts are not populated yet. **D3's attributed observation entry is implemented. D2 and D4–D7 remain open.** No operation retry, model call, quality approval or customer release is implied by a completed manual task.

## Shared interface

[notebook.ts](packages/studio-server/src/ari/notebook.ts) stores schema 1 in the active project's `.ari-notebook/notebook.json`. [ariNotebook.ts](packages/studio-server/src/routes/ariNotebook.ts) exposes GET/POST at `/api/ari/projects/:id/notebook`. Project resolution is shared with version routes through [resolveAriProject.ts](packages/studio-server/src/ari/resolveAriProject.ts).

The visible **Muistikirja → Avaa muistikirja** path and the discovered [notebook tools](packages/studio/src/webmcp/tools/notebookTools.ts) use this same service:

- `studio_notebook`: reads `notebook`, its nullable content `token`, current source `revision` and `staleObservationIds`.
- `studio_update_notebook`: requires the last read `expectedToken` and one closed action. `brief` updates goal/texts; `assets` replaces selected project-relative path/checksum pairs after checking their actual bytes; `task` appends a manually described task; `task_status` changes its named state; `observation` appends an attributed observation bound to the read source revision.
- Successful writes return `stage: notebook_saved`, `sourceChanged: false`, the new token and full readback. The bridge adds the actual project id. Conflict or malformed input returns `ok: false` and a Finnish reason.
- The tool registry now contains **30 names**. Existing names remain compatible.

Tasks have server-generated ids and internal states `next/active/done`; [AriNotebook.tsx](packages/studio/src/ari/AriNotebook.tsx) displays **Seuraavaksi / Kesken / Tehty**. All these tasks are manual declarations. The reserved `operations` array's prepared receipt shape is `id, baseRevision, resultRevision, result`; it stays empty and has no notebook write action. The next implementation must connect verified receipts to the actual shared source/history transaction, add their validation and reconciliation, and migrate the schema when needed. It must not infer execution from a task label or a matching final text.

Observations carry server-generated id/time, declared author name, `human/external_agent/technical` author type, the exact content revision, declared coverage and text. The UI labels each type separately. These are declared authors, not authenticated identities. The two simulated author roles in automation do not constitute a human study or a model review. Source changes preserve old observations and mark their revision stale on the next notebook read. The UI describes the _read_ version; **Päivitä tilanne** refreshes that comparison while retaining the draft. This batch does not archive a review video or claim that declared coverage has actually been watched.

## Persistence and failure rules

Writes use the existing [conditional file service](packages/studio-server/src/ari/conditionalFiles.ts): confined paths, no symlink traversal, exclusive first creation, temporary-file replacement and conditional compensation. A stale token is rejected before writing. Invalid/unsupported notebook data is not replaced with an empty notebook. An injected failure after publication restores the original bytes; compensation preserves a concurrent external edit and reports an incomplete restoration.

The file is limited to 1 MiB, lists to 500 entries and prose fields to 8,000 UTF-16 code units (shorter identity/path limits also apply). Exceeding a limit refuses the new write; it does not prune old observations. The four acceptance notebooks each occupy **846 bytes**, with one asset reference, one manual task and one observation; media bytes are not duplicated. These are input bounds, not a measured performance promise. The inherited service provides single-process conditional publication/compensation, not a multi-process database transaction or crash journal.

The metadata directory is excluded from [version/export inputs](packages/studio-server/src/ari/versionFiles.ts), [project signatures](packages/studio-server/src/helpers/projectSignature.ts), the [CLI watcher](packages/cli/src/server/fileWatcher.ts) and the [Vite change broadcast](packages/studio/vite.config.ts). Notebook writes never enter the source-write coordinator or undo stack. Browser assertions compare the complete version index/history and source revision before and after notebook writes.

## Evidence

All paths below are from this batch; earlier failed attempts remain on disk.

| Check                                                       | Evidence                                                                                                                                                              | Result                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Real-file notebook safety plus version/signature regression | [server log](screenshots/2026-09-10-d-notebook/server-tests-verified.log)                                                                                             | 3 files, 27 tests passed; 10 notebook-specific tests                                  |
| Bounded client commands and error receipts                  | [client log](screenshots/2026-09-10-d-notebook/client-tests.log)                                                                                                      | 3 tests passed                                                                        |
| CLI metadata watcher                                        | [watcher log](screenshots/2026-09-10-d-notebook/watcher-tests.log)                                                                                                    | 4 tests passed                                                                        |
| Full Ari regression                                         | [Ari log](screenshots/2026-09-10-d-notebook/ari-tests-final.log)                                                                                                      | 42 files, 489 tests passed                                                            |
| Visible notebook paths                                      | [accepted report](screenshots/2026-09-10-d-notebook/accepted-final/report.json)                                                                                       | UI-only and mixed, 1280×800 and 1440×900; 4 checks each                               |
| New server and browser sessions                             | [reopen report](screenshots/2026-09-10-d-notebook/reopen/report.json)                                                                                                 | Four complete notebook/token/revision equality checks                                 |
| C-panel regression                                          | [panel report](screenshots/2026-09-10-d-notebook/panel/report.json)                                                                                                   | Four visible paths, 10 checks each                                                    |
| Studio / server types                                       | [Studio](screenshots/2026-09-10-d-notebook/typecheck.log), [server](screenshots/2026-09-10-d-notebook/server-typecheck-final.log)                                     | Pass                                                                                  |
| Workspace build                                             | [build log](screenshots/2026-09-10-d-notebook/build.log)                                                                                                              | Pass, exit 0                                                                          |
| Original whole-diff structure gate                          | [structure](screenshots/2026-09-10-d-notebook/structure-final.json)                                                                                                   | Pass, zero new findings; 1 inherited complexity finding and 25 inherited clone groups |
| Formatting, lint and production line gate                   | [format](screenshots/2026-09-10-d-notebook/format.log), [lint](screenshots/2026-09-10-d-notebook/lint.log), [lines](screenshots/2026-09-10-d-notebook/line-gate.json) | Pass                                                                                  |

The real-file tests cover absence versus empty/corrupt data, brief/tasks/assets/observations, stale authors' clients, source-change staleness, failure after first and subsequent publication, an external edit during compensation, symlinks and checksum/path rejection. They also verify that notebook saves preserve the frozen version index and source manifest.

The visible tests create local projects and import the tracked synthetic PNG through product controls. Each path records a brief, image choice, manual completed task and observation. Two independent browser contexts demonstrate refusal of an old token, retained draft text, explicit refresh and successful continuation without dropping prior tasks or observations. An actual UI/agent element addition then changes the source revision and makes the existing observation stale. No acceptance source is manually patched. Reopening uses a stopped/restarted Node/Vite host and fresh isolated browser contexts; the complete readback is compared, not merely the goal string.

Visually inspected: [1280 stale observation](screenshots/2026-09-10-d-notebook/accepted-final/ui-only-1280-stale-observation.png), [1440 retained conflict draft](screenshots/2026-09-10-d-notebook/accepted-2/mixed-1440-conflict.png), [1440 fresh-session notebook](screenshots/2026-09-10-d-notebook/reopen/mixed-1440-reopened.png), and [1280 C motion panel](screenshots/2026-09-10-d-notebook/panel/ui-only-1280-motion.png). Notebook fields, manual status headings and the stale warning are readable; its long content scrolls within the dialog. C's primary timing/ease controls remain visible without panel scrolling and its measured action positions remain stable. These are browser automation and agent visual inspection, not human UX acceptance.

[Aggregate hashes and measured notebook sizes](screenshots/2026-09-10-d-notebook/summary.json) bind the accepted reports and files. Expected 409 notebook conflicts are recorded separately from unexpected HTTP errors; the existing optional FFmpeg 404 probes are also separated. Accepted runs have no page errors, corrective reloads or browser external requests.

## Defects found during this batch

- The initial Vite watcher still broadcast notebook JSON changes. This triggered the source-drain path and blurred an input while typing. Adding the metadata-directory exclusion fixed the actual cause; the successful paths preserve keyboard input without a corrective reload. [Diagnostic report](screenshots/2026-09-10-d-notebook/browser-diagnostic/report.json) remains.
- A driver initially checked an old success message instead of waiting for the current save. The UI now announces the pending action; the driver waits for the current enabled completion. Another draft attempt began before the element form had finished loading; the driver now waits for its existing readiness condition. These attempts remain in the evidence directory.
- A config hot-restart failed to become ready; that [attempt](screenshots/2026-09-10-d-notebook/browser-4/report.json) failed before opening a project. A fresh foreground Node host worked. This does not resolve the separate Bun/Vite startup problem.
- The registry regression initially expected 28 tools. It now verifies the actual 30-name set including the two notebook tools. Structure findings were fixed by extracting shared project resolution and separating request/asset validation; no gate settings or baselines changed.
- The C-panel regression attempted Google Fonts reads. The server's preinstalled offline guard rejected them before network I/O; the [guard log](screenshots/2026-09-10-d-notebook/server-network-2.jsonl) preserves these attempted calls. The dedicated final notebook and reopen hosts have their own [final](screenshots/2026-09-10-d-notebook/server-network-final.jsonl) / [reopen](screenshots/2026-09-10-d-notebook/server-network-reopen.jsonl) logs. No external service call was made.
- Vitest retains its existing ten-second Vite shutdown warning on the successful Ari suite; the process exits successfully. Build retains existing bundle-size warnings.

## Reproduction

From the repository root; all long-running processes stay in foreground terminals.

```sh
npx --yes bun run --cwd packages/studio-server test src/ari/notebook.test.ts src/ari/versionStore.test.ts src/helpers/projectSignature.test.ts
npx --yes bun run --cwd packages/studio test src/webmcp/tools/notebookTools.test.ts
npx --yes bun run --cwd packages/cli test src/server/fileWatcher.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json

ARI_OFFLINE=1 ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-d-notebook/server-network-final.jsonl" HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false npx --yes bun run --cwd packages/studio node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
# Separate foreground terminal:
ARI_NOTEBOOK_EVIDENCE=screenshots/2026-09-10-d-notebook/accepted-final npx --yes bun run ari:test:notebook
ARI_PANEL_EVIDENCE=screenshots/2026-09-10-d-notebook/panel npx --yes bun run ari:test:panel
# Stop the host, start a fresh host with the same offline environment, then:
ARI_NOTEBOOK_REOPEN=screenshots/2026-09-10-d-notebook/accepted-final/report.json ARI_NOTEBOOK_EVIDENCE=screenshots/2026-09-10-d-notebook/reopen npx --yes bun run ari:test:notebook
```

D1's verified operations and all D2 reconciliation remain next. D4–D7's review package, bounded corrections, stopping and approval expiry are not implemented here. No model assessment, human study or release approval is claimed. USD 0; no commit, push, stash, checkout or reset. Owned processes are stopped; [port evidence](screenshots/2026-09-10-d-notebook/ports.json).

## Source-operation follow-up

The separate durable source journal and read-only resumption are now implemented for the bounded paths documented in [D1/D2 operations](ARI-NEXT-D-OPERATIONS.md). The evidence above remains the original notebook-only evidence; manual task completion still does not prove a source write.
