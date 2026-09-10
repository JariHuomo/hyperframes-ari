# B3–B5: project-local version storage

Storage foundation delivered. The subsequent [visible comparison batch](ARI-NEXT-B-COMPARISON.md) completes the local B3–B5 technical path. At the time of this storage-only report, **B3–B5 were not complete**. The two-version viewer, synchronized playback/seek, visible checkpoint controls and visual before/after acceptance belong to the next batch. This report does not claim a human UX test or a new rendered ad.

## What changed

- [Version store](packages/studio-server/src/ari/versionStore.ts): `.ari-versions/index.json` publishes the history and complete manifests together, using the existing conditional multi-file writer. Immutable object files are named by SHA-256 and shared between versions. UUID version IDs identify individual checkpoints; `revision` identifies the exact sorted path/hash manifest.
- [File capture and dependency checks](packages/studio-server/src/ari/versionFiles.ts) and [A5 export capture](packages/studio/vite.ariRenderSnapshot.ts) now use the same manifest and checksum calculation. Adding history does not change the active source revision or get copied into an export. [Preview signatures](packages/studio-server/src/helpers/projectSignature.ts) and the [CLI watcher](packages/cli/src/server/fileWatcher.ts) exclude the store.
- [History wire validation](packages/studio-server/src/ari/versionHistory.ts), [version types](packages/studio-server/src/ari/versionTypes.ts), [HTTP routes](packages/studio-server/src/routes/ariVersions.ts), and the [browser service](packages/studio/src/utils/projectVersions.ts) provide save, list, validated read, prepare-restore and explicit deletion. A read returns frozen bytes only; it never writes the active project or substitutes current assets.
- [Shared history](packages/studio/src/hooks/usePersistentEditHistory.ts) now defaults to project-backed storage. IndexedDB is read only as a migration source if no project history exists. Legacy string snapshots and nullable snapshots remain readable. New entries receive `beforeVersionId` and `afterVersionId`. A stale history session refuses publication; it cannot silently replace another session's stack.
- [History snapshots](packages/studio/src/utils/editHistory.ts) support an optional `encoding: "base64"` for binary restoration. [History I/O](packages/studio/src/hooks/useHistoryFileIO.ts) preserves binary bytes on undo/redo. Preview diffs receive decoded source text; binary media forces a full preview refresh. Existing UTF-8 edits and the separate `diskContent` precondition retain their meaning.

A restore requires the prepared whole-project revision, per-file before bytes and the ordinary project writer's queue identity. It uses the same conditional compensation core as ordinary saves and records one separate edit. A source change during preparation or before publication refuses the restore; rollback attempts every written path and preserves conflicting external bytes. The export barrier also waits for queued version restores.

## Storage and supported dependencies

Automatic snapshots retain the most recent **100 versions within a 32 MiB source budget**. The budget conservatively counts UTF-8 source bytes plus each manifest, even when source objects are deduplicated. A single automatic snapshot larger than that budget is refused before publication; it never returns an unavailable version ID. Named checkpoints are exempt and remain until an explicit index-bound delete. Unreferenced objects are collected after a successful publication. Collection failure leaves harmless extra files and is retried later; it does not turn a published version into a failed write.

Capture includes all regular project files, including local HTML scenes, CSS, scripts, raster images, SVG, fonts, audio/video and `.hyperframes` edit manifests. The store, `.git`, `node_modules`, renders, outputs, evidence, snapshots and documented caches are excluded. Total capture is bounded to **512 MiB / 4096 files**. Symlinks and nonregular files are refused; paths are confined to the resolved project directory. Existing empty files are distinct from absent files.

Dependency validation covers HTML `src`, `poster`, `data-composition-src` and `link[href]`, inline/external CSS `url(...)` and quoted `@import`. Missing references and remote URLs refuse an explicit checkpoint and any replay. Automatic edit history can preserve an incomplete state with `replayError`, so restoring a healthy checkpoint and undoing that restore remains possible even when the current image is missing. Those incomplete snapshots are never substituted with live assets or treated as playable. `base`, module scripts and `srcset` are explicitly unsupported. Data URLs remain inline. This is the local classic-script/GSAP project contract, not a general JavaScript dependency evaluator: computed runtime URLs, dynamic loaders and build-time package resolution are outside the replay contract. The next viewer must serve **only this frozen manifest**, block external requests and refuse missing runtime resources; it must not route them to the active project.

History binary requests have a **48 MiB** transport ceiling, including base64 and JSON; ordinary image imports remain at 8 MiB. The [Vite request boundary](packages/studio/vite.request-body.ts) matches the server limit. An oversized history request fails, allowing the existing conditional compensation to restore the source. This does not claim support for restoring arbitrarily large video assets in a single inline history entry.

Publication is a synchronous, process-level compensating transaction, not a power-loss-safe filesystem transaction. SHA-256 validates every requested frozen object. A corrupt/missing object makes that version unavailable. The missing-current-image regression proves healthy restore and exact undo/redo while reading the incomplete baseline fails. Legacy edits do not acquire invented historical dependencies: their old undo bytes remain usable, and complete versions begin when the project-backed store captures them.

## Verification

| Command / evidence                                                     | Result                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio history integration and regression command below                | 6 files / **44 passed**, including 8 project-store integration tests and 2 IndexedDB tests; [log](screenshots/2026-09-10-b-version-store/history-tests.log) |
| Server version, conditional-file and signature tests                   | 3 files / **30 passed**; [log](screenshots/2026-09-10-b-version-store/server-tests.log)                                                                     |
| A5 export, request boundary, render queue and undo-preview regressions | 12 files / **39 passed**; [log](screenshots/2026-09-10-b-version-store/export-regression.log)                                                               |
| CLI watcher                                                            | 1 file / **4 passed**; [log](screenshots/2026-09-10-b-version-store/watcher-tests.log)                                                                      |
| `ari:test`                                                             | 37 files / **468 passed**; [log](screenshots/2026-09-10-b-version-store/ari-tests.log)                                                                      |
| Studio / studio-server typecheck                                       | Exit 0; [Studio](screenshots/2026-09-10-b-version-store/typecheck.log), [server](screenshots/2026-09-10-b-version-store/server-typecheck.log)               |
| `ari:build`                                                            | Exit 0; [log](screenshots/2026-09-10-b-version-store/build-final.log)                                                                                       |

The [whole-diff structural gate](screenshots/2026-09-10-b-version-store/structure.json) passes with zero new findings, using the existing `new-only` gate; 26 inherited findings remain visible. No baseline, limit or suppression changed. [Production file lengths](screenshots/2026-09-10-b-version-store/file-lines.json) remain below 600 (largest changed file: 598). [Lint](screenshots/2026-09-10-b-version-store/lint.log) and [format](screenshots/2026-09-10-b-version-store/format.log) cover the [complete changed-file list](screenshots/2026-09-10-b-version-store/format-files.json), including pre-existing work, and pass.

[Real-file tests](packages/studio/src/utils/projectVersions.test.ts) cover a real repository PNG, old-source/image independence, nullable creation/deletion, restart/reload, restoration as one edit, undo/redo, stale history, stale restore, partial failure and conflicting rollback on both undo and redo. The IndexedDB migration test replaces the IndexedDB instance entirely before replaying the project-backed redo. [Store tests](packages/studio-server/src/ari/versionStore.test.ts) exercise missing/corrupt objects, dependencies and symlinks, interrupted manifest publication, count/byte retention and explicit named deletion. A path-collision regression also verifies simultaneous edits to `index.html` and `before/index.html`: object collection never uses a synthetic path namespace that could overwrite a real dependency.

Some Studio Vitest commands print the existing ten-second close-timeout diagnostic after their passing summary, then exit 0. This is recorded in the logs, not counted as an extra test.

### Fresh server and browser

The [create report](screenshots/2026-09-10-b-version-store/browser/create/report.json) and [reopen report](screenshots/2026-09-10-b-version-store/browser/reopen/report.json) use the running Studio, normal `studio_edit_element`, and the shared storage/restoration services. Each phase opens a fresh visible browser; the server is stopped and started between them. Two creation checks and three reopening checks pass. They compare the entire persisted history and the frozen source/dependency maps, then verify exact restored/undone/redone source strings. Both report zero page errors, external browser requests and corrective workspace reloads. Known optional FFmpeg capability 404s are listed separately.

[Opened project screenshot](screenshots/2026-09-10-b-version-store/browser/reopen/reopen-opened.png) is a visual check of the reopened active project, captured **before** exercising the storage-only restore. It is not a two-version comparison or proof of a finished restore UI. The restore test uses a new shared history controller; wiring it into a visible viewer and its preview-refresh lifecycle is next-batch work.

Measured on the browser fixture: **8 objects / 151,144 bytes** after creation and after restore/undo/redo; the index grows from **5,976 to 13,817 bytes**. The unchanged object size demonstrates sharing across those versions. The 105-edit retention test retains 100 automatic versions plus one named checkpoint, with 102 distinct objects and under 6,000 bytes of fixture objects. The independent 4 MiB-source test retains seven automatic versions within the byte budget, plus the named checkpoint.

A Bun-hosted Vite restart became unresponsive to HTTP in initial attempts, and a direct Bun/Puppeteer invocation stalled. The successful browser runs use the repository's Node browser driver and **Node-hosted Vite**, both launched through `npx --yes bun run`. This runtime/startup issue is not resolved or hidden by a corrective page reload. The [server-session record](screenshots/2026-09-10-b-version-store/server-sessions.json) identifies the separate successful processes. Server-side offline guards are installed before the first request; [first Node host](screenshots/2026-09-10-b-version-store/node-server-network-create-final.jsonl), [fresh host](screenshots/2026-09-10-b-version-store/node-server-network-reopen-final.jsonl). No paid or external service call was made.

## Next viewer's interface

```ts
const versions = projectVersions(projectId);
const list = await versions.list();
const saved = await versions.save("Hyväksytty lähtökohta");
const frozen = await versions.read(saved.version.id); // base64 bytes, validated manifest
const prepared = await versions.prepareRestore(saved.version.id);
const receipt = await restoreProjectVersion(
  projectId,
  prepared,
  editHistory.recordEdit,
  writeProjectFile, // same project writer identity as ordinary edits
);
// receipt: restoredFrom, revision, paths
```

Use IDs, not names or list positions. Always call `read` before playback; the recorded `replayError` is not a substitute for validating the current stored objects. Reading is independent of active sources. Prepare again after a source conflict. Refresh the live preview from `receipt.paths` after a successful restore, using the existing selection-revision guard; a preview problem must not become a false source-save failure. Undo/redo must use `useHistoryFileIO` to preserve the snapshot encoding. Delete a named checkpoint only through `versions.delete(id, list.indexToken)` after the user's explicit deletion action. Snapshot limits can make an old automatic ID unavailable; show the refusal instead of playing today's content twice.

## Reproduction commands

Run from the repository root, except where `--cwd` is explicit:

```sh
npx --yes bun run --cwd packages/studio test src/utils/projectVersions.test.ts src/utils/nullableHistory.test.ts src/utils/studioFileHistory.test.ts src/hooks/usePersistentEditHistory.test.ts src/hooks/usePersistentEditHistory.projectOwnership.test.tsx src/utils/editHistoryStorage.nullable.test.ts
npx --yes bun run --cwd packages/studio-server test src/ari/versionStore.test.ts src/ari/conditionalFiles.test.ts src/helpers/projectSignature.test.ts
npx --yes bun run --cwd packages/studio test vite.ariRenderSnapshot.test.ts vite.request-body.test.ts src/hooks/useAppHotkeys.previewForwarding.test.tsx src/ari/AriExport.test.tsx src/components/renders src/utils/studioFileMutationCoordinator.test.ts
npx --yes bun run --cwd packages/cli test src/server/fileWatcher.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json
```

Start the host in the foreground, then run the browser command in a separate foreground terminal:

```sh
ARI_OFFLINE=1 HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false npx --yes bun run --cwd packages/studio node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
npx --yes bun run ari:test:versions create
# Stop the host, start a fresh host with the same command, then:
npx --yes bun run ari:test:versions reopen
# Stop that host as well.
```

The browser driver constructs its own local bootstrap using the existing authoring API. It needs no RajaMarket material. Tests do not assert human usability results. No commit, push, stash, checkout or reset belongs to this batch; provider spend is **0 USD**.

[Consolidated results](screenshots/2026-09-10-b-version-store/acceptance-summary.json) and the [link check](screenshots/2026-09-10-b-version-store/links.json) accompany the individual logs. All owned hosts and acceptance browsers are stopped; [port 3084 is free](screenshots/2026-09-10-b-version-store/ports.json).
