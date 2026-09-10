# D1/D2 — durable source operations and read-only resumption

Implemented for the bounded source operations below. D4–D7 are not implemented here. No model calls, release approval or automatic retry. Local automation, not a human UX study. Spend: USD 0; no commit or push.

## Protocol and shared boundary

[operationJournal.ts](packages/studio-server/src/ari/operationJournal.ts) stores the immutable ID, target file set, exact nullable before/after snapshots, label/kind and whole-project base revision **before** the first source write. The same ID cannot be reused, even with the same payload; a different payload is refused explicitly. UI-generated IDs are UUIDs. Element and scene agent actions additionally accept an optional `operationId`.

The bounded write endpoint accepts only that ID and a bound path. Each conditional source write publishes an operation-specific proof; equal final text supplied by another writer is insufficient. History publication verifies proofs, exact history binding, final source bytes and the reconstructed base revision. Its receipt is published in the same version-index write as the history and result version. A successful receipt carries `id`, `binding`, `historyId`, `versionId` and `resultRevision`.

[studioFileHistory.ts](packages/studio/src/utils/studioFileHistory.ts), [sdkEditTransaction.ts](packages/studio/src/utils/sdkEditTransaction.ts) and [sourceOperations.ts](packages/studio/src/utils/sourceOperations.ts) provide the shared path. [projectVersions.ts](packages/studio/src/utils/projectVersions.ts) resolves a lost history response by rereading the durable receipt. An unverifiable response remains uncertain and does not trigger unsafe compensation. Known failures retain conditional rollback; foreign edits survive. `diskContent` still means an already-applied legacy write and is not relabelled as tracked.

The UI's **Muistikirja → Jatka työtä** and `studio_resume_work` share a read-only reconciliation endpoint. Completed entries are shown and never executed again. An entry without a verified history receipt is **Kesken — tulos epäselvä** with `retryAllowed: false`; no automatic replay is offered, including after a restart. `changedSince` warns that a later edit or undo changed the project. It does not invalidate proof that the original operation completed. This is conservative outcome reconciliation, not a queue that automatically finishes interrupted partial writes.

## Supported and excluded writes

Tracked: element and scene structural operations (including nullable creation/deletion and independent scene copies), ordinary SDK-compatible text/inline-style/attribute writes, motion insertion, metadata edits (start, duration, ease) and motion deletion. Nested sources use the same paths. [trackedDomEdit.ts](packages/studio/src/utils/trackedDomEdit.ts) and [trackedGsapEdit.ts](packages/studio/src/utils/trackedGsapEdit.ts) close the former panel-only gaps.

Excluded: custom/local history adapters, already-applied legacy writes, rich text and font-preparation paths, animated layer-position edits using the legacy batch writer, media imports and binary version restore. These are not advertised as safely replayable. The notebook includes a visible scope disclosure. The C-panel evidence contains an untracked `Move layer` entry alongside seven tracked operations; this is explicitly outside this batch's supported motion metadata operations. Undo/redo remain existing conditional history actions, not new replayable operation requests.

No action reuses an ID after uncertainty; an external agent must retain the original ID and inspect reconciliation before deciding what new work is appropriate. Resumption never treats a manual completed notebook task as source-write evidence. The reserved manual notebook `operations` array remains separate from the actual journal.

## Storage, retention and next interface

Intent files live under `.ari-notebook/operations/`; write proofs under `.ari-notebook/operation-writes/`; receipts live in `.ari-versions/index.json`. Paths and symlinks are confined by the existing conditional filesystem service. These metadata files do not alter the ad source revision. Legacy `.hyperframes/backup/` files are also excluded from source snapshots: a browser regression showed the old writer's own backup falsely invalidated the operation base revision.

Limits: 100 files and 8 MiB per intent, 1,000 intents and 32 MiB aggregate intent bytes. Capacity refusal happens before source writing. There is no automatic intent/proof deletion. Receipts survive version/history pruning, including the 103-version retention test; a pruned replay version is not resurrected from current assets. D4 must require an available frozen version separately. Four C-panel projects measured 24,115–24,123 bytes of journal/proof JSON each for seven receipts; this excludes the shared version store. See [measured receipts and history](screenshots/2026-09-10-d-operations/panel-operation-evidence.json).

D4–D7 can consume `studio_resume_work` results and exact receipt version IDs; they must not infer quality approval or authorize retries from `completed`. Review packages, approved-content protection, stop semantics and the two-round limit remain future work.

## Evidence

[Machine-readable acceptance index](screenshots/2026-09-10-d-operations/acceptance-index.json) hashes seven reports, all `ok: true`: 72 browser assertions. Each matrix uses UI-only/mixed and 1280×800/1440×900.

- [Operation acceptance](screenshots/2026-09-10-d-operations/accepted/report.json): 4 × 3 checks, including a deliberately lost response after real history publication, durable receipt readback, unchanged version index on repeated resume and no duplicate element.
- [Fresh server/browser](screenshots/2026-09-10-d-operations/reopen/report.json): 4 × 2 checks; identical receipt after host restart, no write during resume.
- [C panel](screenshots/2026-09-10-d-operations/panel-complete/report.json): 4 × 10, including shared scenes, motion/text edits, selection, exact undo/redo and real frozen comparison. The persisted index proves seven tracked source operations per project.
- Two independent clients: [UI 1280](screenshots/2026-09-10-d-operations/history-ui-1280/report.json), [UI 1440](screenshots/2026-09-10-d-operations/history-ui-only-1440/report.json), [mixed 1280](screenshots/2026-09-10-d-operations/history-mixed-1280/report.json), [mixed 1440](screenshots/2026-09-10-d-operations/history-mixed-1440/report.json), three checks each. Stale writes restore exact bytes; visible refresh preserves drafts and both clients' history through continuation and undo/redo.

No acceptance-source hand edits or corrective reloads. No page errors or external requests in these reports. Known optional `/api/environment/ffmpeg` 404 checks are recorded, not hidden. Early failed browser attempts remain in the evidence directory; they are not acceptance evidence.

Visually inspected [1280 notebook](screenshots/2026-09-10-d-operations/accepted/ui-only-1280-resume.png) and [1280 comparison](screenshots/2026-09-10-d-operations/panel-complete/ui-only-1280-review.png): completion is readable; previous/current text differs at the same time; no clipped primary notebook controls. Automation does not establish the human five-minute UX target.

| Check                                      | Result / log                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ari suite                                  | 489 passed, 42 files — [log](screenshots/2026-09-10-d-operations/ari-complete.log)                                                                              |
| Source/history/UI unit regressions         | 96 passed plus 7 atomic-motion tests — [96](screenshots/2026-09-10-d-operations/client-complete.log), [7](screenshots/2026-09-10-d-operations/atomic-final.log) |
| Real-file operation/version/notebook tests | 29 passed — [log](screenshots/2026-09-10-d-operations/server-final.log)                                                                                         |
| Studio / server typecheck                  | Exit 0 — [Studio](screenshots/2026-09-10-d-operations/typecheck-complete.log), [server](screenshots/2026-09-10-d-operations/server-typecheck-complete.log)      |
| Build                                      | Exit 0 — [log](screenshots/2026-09-10-d-operations/build-complete.log)                                                                                          |

Real-file tests cover interruption before writing, source/proof compensation, failure before history publication, lost successful response, unresolved receipt lookup, concurrent same-ID requests, external changes, nullable files, fresh history controllers, exact undo/redo, and evidence retention. [operationJournal.test.ts](packages/studio-server/src/ari/operationJournal.test.ts) verifies specific write provenance rather than matching text. [projectVersions.test.ts](packages/studio/src/utils/projectVersions.test.ts) verifies client recovery through the actual file-backed services. Some Vitest runs report a Vite shutdown delay after passing; they eventually exit 0. This does not resolve the separately recorded Bun/Vite host issue.

## Commands

Run from the repository root; the browser driver requires the foreground offline Node/Vite host documented below. Environment variables precede opening any page.

```sh
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/utils/projectVersions.test.ts src/utils/studioFileHistory.test.ts src/utils/atomicGsapAdd.test.ts src/ari/sceneOperations.test.ts src/webmcp/tools/notebookTools.test.ts src/hooks/useDomEditCommits.test.tsx
npx --yes bun run --cwd packages/studio-server test src/ari/operationJournal.test.ts src/ari/versionStore.test.ts src/ari/notebook.test.ts
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
npx --yes bun x --no-install fallow audit --base origin/main --fail-on-issues --format json
ARI_OFFLINE=1 HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false npx --yes bun run --cwd packages/studio node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
ARI_OPERATIONS_EVIDENCE=screenshots/2026-09-10-d-operations/accepted npx --yes bun run ari:test:operations
# Stop and restart the host before the reopen phase.
ARI_OPERATIONS_REOPEN=screenshots/2026-09-10-d-operations/accepted/report.json ARI_OPERATIONS_EVIDENCE=screenshots/2026-09-10-d-operations/reopen npx --yes bun run ari:test:operations
ARI_PANEL_EVIDENCE=screenshots/2026-09-10-d-operations/panel-complete npx --yes bun run node packages/studio/tests/e2e/ari-panel.mjs
# Repeat for each mode and width, with a separate evidence path.
ARI_HISTORY_MODE=ui-only ARI_HISTORY_WIDTH=1280 ARI_HISTORY_EVIDENCE=screenshots/2026-09-10-d-operations/history-ui-1280 npx --yes bun run node packages/studio/tests/e2e/ari-history-recovery.mjs
```

## Final gates

[Full-diff structure gate](screenshots/2026-09-10-d-operations/structure-final.json): pass, zero new findings, one inherited complexity finding and 25 inherited duplicate groups. No configuration or baseline change. [Production line gate](screenshots/2026-09-10-d-operations/line-gate.json): every changed production TypeScript file below 600 lines (largest 598). [Formatting](screenshots/2026-09-10-d-operations/format-check.log), [lint](screenshots/2026-09-10-d-operations/lint-final.log) and [diff check](screenshots/2026-09-10-d-operations/diff-check.log) pass. [Link validation](screenshots/2026-09-10-d-operations/links.json): no missing referenced paths.

Final scope-disclosure UI: [fresh-session recheck](screenshots/2026-09-10-d-operations/reopen-scope/report.json) passed another 4 × 2 checks after adding the supported/excluded operations disclosure. [1280 view](screenshots/2026-09-10-d-operations/reopen-scope/ui-only-1280-resume.png) and [1440 view](screenshots/2026-09-10-d-operations/reopen-scope/mixed-1440-resume.png) were visually inspected; controls and completion status remain readable. Owned hosts were stopped; port 3084 is free.
