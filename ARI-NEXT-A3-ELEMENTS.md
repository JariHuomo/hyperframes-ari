# A3: element authoring

Status: the **A3 element path is implemented and browser-verified**, including existing template elements, animated copies, shared-scene selection and image placement. This remains a **partial A3 delivery**: scene operations, A4, A5 and the wider A–D specification are not complete. No commit or push. The final UI-integration evidence below supersedes the primitive-only browser results.

## Implementation

- [AriElements.tsx](packages/studio/src/ari/AriElements.tsx): visible **Elementit** dialog, **Teksti / Kuva / Tausta**, shelf selection, **Nimeä**, **Kopioi**, **Poista**, **Tuo edemmäs / Vie taaemmas**, status and recoverable error. This orders overlapping elements, not scenes in time. Ordinary keyboard activation works.
- [elementTools.ts](packages/studio/src/webmcp/tools/elementTools.ts): discovered `studio_elements` and `studio_edit_element`. The visible dialog calls those same tools. `studio_elements` returns source-backed targets and a SHA-256 version. Writes require that version and a closed action; no arbitrary source-code input. The registry now has 20 tools.
- [elementOperations.ts](packages/studio/src/ari/elementOperations.ts): detached SDK candidate, unique SDK identities, literal escaped text, positioned text/image/background primitives, labels and overlap order. Copied images keep the imported project path and checksum; nested-source image URLs are relative to that source. Image addition and image duplication recheck the verified shelf. Source changes, removed targets and active-project changes refuse writes.
- [studioFileHistory.ts](packages/studio/src/utils/studioFileHistory.ts) supplies the previous batch's nullable transaction/history path. Each successful operation records one before/after source entry. Conditional writes and history-failure compensation preserve the original bytes.
- [useStudioContextValue.ts](packages/studio/src/hooks/useStudioContextValue.ts), [StudioContext.tsx](packages/studio/src/contexts/StudioContext.tsx), [StudioAgentTools.tsx](packages/studio/src/webmcp/StudioAgentTools.tsx), [useStudioAgentTools.ts](packages/studio/src/webmcp/useStudioAgentTools.ts), [App.tsx](packages/studio/src/App.tsx) and [AriControlPanel.tsx](packages/studio/src/ari/AriControlPanel.tsx) connect the project-bound writer/history and panel. Structural saves request a preview refresh; the browser test does not call a corrective workspace reload.

A successful receipt contains `ok`, `stage: "saved"`, `target`, `sourceFile`, actual `version`, `affectsInstances`, and `deleted`. It proves persisted source, not visual approval. Shared-scene counts come from the current scene manifest, not client-supplied numbers.

## Original primitive-only browser evidence

The prior batch reported the following primitive-only headed runs. Its `screenshots/2026-09-10-a3-elements/report.json` path was reused during exploratory follow-up runs, so that file is no longer an archive of the original six-check run. The current auditable browser evidence is the separate [UI-integration report](screenshots/2026-09-10-a3-ui-integration/report.json) below.

| Path    | Viewport   | Result | Checks | Element receipts |
| ------- | ---------- | ------ | ------ | ---------------- |
| UI-only | 1280 × 800 | passed | 6      | 9                |
| UI-only | 1440 × 900 | passed | 6      | 9                |
| Mixed   | 1280 × 800 | passed | 6      | 9                |
| Mixed   | 1440 × 900 | passed | 6      | 9                |

Each path creates a new blank project, imports the repository's synthetic [one.png](packages/studio/tests/e2e/fixtures/ari-authoring/one.png), adds text/image/background, renames, duplicates, changes overlap order, deletes, undoes/redoes and reopens. Invalid text on the visible path and a stale version on the mixed path leave the source unchanged; the next valid action succeeds. UI-only writes are visible controls, including Enter activation; read-only tool calls inspect saved results. Receipts are observed through bridge subscriptions. The four `savedElements` arrays are identical, including names, identities, order and image checksum. No acceptance source files are hand-edited. Both final browser error arrays are empty: `pageErrors: []`, `externalRequestsBlocked: []`.

Screenshots are named `<mode>-<width>-elements.png` and `<mode>-<width>-reopened.png` in that evidence directory. UI refusal screenshots also exist. The [1280 reopened view](screenshots/2026-09-10-a3-elements/ui-only-1280-reopened.png) was visually inspected: the headline and imported synthetic green square are visible over the background. These are automation results, not human usability testing, and do not prove MP4/export parity (A5).

| Verification                                | Actual result               |
| ------------------------------------------- | --------------------------- |
| Targeted element/history/registration tests | 3 files / 36 tests passed   |
| `ari:test`                                  | 28 files / 396 tests passed |
| Studio typecheck                            | exit 0                      |
| `ari:build`                                 | exit 0                      |
| Changed-file oxlint                         | 0 warnings / 0 errors       |

[Element tests](packages/studio/src/ari/elementOperations.test.ts) cover unique identifiers, literal text, rename/copy/order/delete, image identity, color syntax, missing targets, bound tween removal, shared-tween deletion and animated duplication (the original refusal assertions were replaced by positive reference-preservation assertions in the source/motion follow-up). A real temporary filesystem and the conditional server writer prove an exact source-version receipt, one history entry, history reopening, byte-identical undo/redo, stale-version refusal, image-verification refusal (including duplication), and rollback when recording history fails. [Nullable history tests](packages/studio/src/utils/nullableHistory.test.ts) retain the broader create/delete/multi-file rollback coverage; that earlier evidence is not relabelled as a browser test of this feature.

Saved logs: [targeted tests](screenshots/2026-09-10-a3-elements/tests.log), [Ari suite](screenshots/2026-09-10-a3-elements/ari-tests.log), [typecheck](screenshots/2026-09-10-a3-elements/typecheck.log), [build](screenshots/2026-09-10-a3-elements/build.log), [lint](screenshots/2026-09-10-a3-elements/lint.log), [format](screenshots/2026-09-10-a3-elements/format.log). The task-owned foreground server was stopped; port 3084 is free.

Test output includes missing build source-map warnings and Vitest's ten-second shutdown warning; the recorded test commands exit successfully. Build output includes bundle-size warnings.

## Gaps and discovered problems

- Resolved in the source/motion follow-up: the list now includes existing local-template text, image and background elements without adding `data-ari-element`. The panel and discovered tool descriptions no longer claim a primitive-only list.
- Resolved for supported static-selector GSAP calls: animated duplication has separate identities and tween calls, and deleting a shared target preserves the other targets. Dynamic selectors, stagger, calls inside control-flow/non-immediate functions and nested element groups still refuse before writing.
- Resolved by the UI-integration follow-up below: shared dialog/canvas/layer identity, structural refresh, undo/redo and the second instance are browser-tested.
- Resolved by the UI-integration follow-up: a portable repeated-scene fixture exercises the nested image URL, actual image decoding and effect counts.
- Scene operations (remaining A3), private scene copies (A4), final export parity (A5), persistent version comparison, the panel redesign and notebook are not delivered here.
- The **first exploratory browser run violated the no-external-request constraint**: its old starting project caused a server-side Google Fonts fetch. Browser interception blocked CDN plugin requests but cannot block server-side font fetching. That run failed and is not acceptance evidence. Subsequent runs create a fresh local-template bootstrap through the existing project service before opening it; final browser reports have no external requests. No paid provider was called; provider spend is 0 USD.
- Directly executing Puppeteer with Bun produced locator errors (`getBoundingClientRect`). The final command follows the existing repository pattern: Bun invokes a package script that runs Node. The driver also explicitly opens **Preview** from the initial Storyboard view. Neither workaround changes acceptance source files or weakens assertions.

## Commands and continuation interface

Run from the fork root; keep the server in the foreground and stop it afterwards. Use the repository fixture for registration; the test creates its own local bootstrap before the first browser opening. Use `--offline` to block server-side outbound fetches before the API/font services load.

```sh
npx --yes bun run ari:studio --port 3084 --offline --project packages/studio/tests/e2e/fixtures/ari-scenes
npx --yes bun run ari:test:elements
npx --yes bun run --cwd packages/studio test src/ari/elementOperations.test.ts src/utils/nullableHistory.test.ts src/webmcp/useStudioAgentTools.test.tsx
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run ari:build
```

The starting registration no longer depends on machine-specific A1–A2 projects. The test prepares throwaway copies of the repository scene fixture and copies GSAP plus its two plugins from installed local dependencies before opening them. It never renders the fixture's unprepared GSAP sentinel.

The next structural batch can call `saveElementOperation` with a project-bound `ElementFiles`, exact expected source version and server-verified image callback. It should extend supported candidate operations and keep the same transactional writer. The source/motion follow-up below extends the supported list and animation operations; it does not supply the next batch's browser selection acceptance.

## Source and motion follow-up — 10 September 2026

Scope: complete the element-source gap only. No scene operations, version comparison, new browser acceptance, server, external request, commit or push. Cost: 0 USD. The original browser table above remains evidence for the original primitives only.

### Implementation and supported source shapes

- [elementOperations.ts](packages/studio/src/ari/elementOperations.ts) keeps the existing version-bound `saveElementOperation` / nullable history transaction for UI and agent operations. `readElements` now classifies existing local-template texts, images and leaf backgrounds, preserving their source identities. Ordering includes existing siblings rather than filtering them out. The `imported` field distinguishes shelf-backed images: their path/checksum is still verified for duplication, including refusal when imported provenance is incomplete. Existing template images retain their existing relative URL without pretending to be imported shelf assets.
- [elementSource.ts](packages/studio/src/ari/elementSource.ts) uses the same SDK identity minting (`ensureHfIds`) on the original source for structural copies/deletion. A copy stays beside its original under the same parent, preserves classes, inline styles, clip timing, track and image attributes, and gets collision-checked DOM/SDK identities. Renaming changes the label, not the identity.
- [elementStyleCopy.ts](packages/studio/src/ari/elementStyleCopy.ts) extends embedded CSS ID and quoted SDK-identity selectors to the copy with equal-specificity `:is(...)` selectors. Declaration values, image URLs and neighboring ID prefixes are not rewritten. Embedded grouping rules keep their grouping. Styles using `@import` refuse copying rather than silently dropping the import through CSSOM. This is source-level style evidence, not a rendered visual certification.
- [elementMotionCopy.ts](packages/studio/src/ari/elementMotionCopy.ts) uses the same `parseGsapScriptAcornForWrite` AST and source ranges as the SDK writer. Supported `to`, `from`, `fromTo`, timeline `set` and off-timeline `gsap.set` calls retain raw vars, including keyframes and `easeEach`. Static ID/class/selector-array targets resolve against the original document. Copies get distinct calls; the original target set is frozen so a class selector does not animate the copy a second time. Deletion removes only the chosen target from a shared call, or removes the call segment when no targets remain. Absolute resolved positions preserve later implicit/relative starts. Independent SDK tween edits on the copy are tested.
- [elementTools.ts](packages/studio/src/webmcp/tools/elementTools.ts) and [AriElements.tsx](packages/studio/src/ari/AriElements.tsx) describe the expanded operation set. The existing receipt remains `target`, `sourceFile`, persisted `version`, `affectsInstances`, `deleted` and `stage: "saved"`. There is no general source-writing tool.

Unsupported structures fail before persistence with a Finnish reason: nested element groups, dynamic selector resolution, stagger/index-dependent shared timing, and tween calls inside loops, conditional branches or non-immediate function bodies. The ordinary four-element local product template and Studio-created single-element tweens are covered positively; these restrictions are not a blanket animated-copy refusal.

### New tests and verification

[Source tests](packages/studio/src/ari/elementSource.test.ts) use the actual repository [local product template](packages/studio-server/src/ari/projectTemplates.ts), plus small synthetic sources. They cover discovery of all four old elements; rename/copy/delete of each; CSS/timing/image-attribute preservation; separate copy motion IDs and independent SDK property editing; old/new overlap peers; static shared targets; keyframes; global sets; immediate function wrappers; chained/implicit timing; and explicit unsupported-structure refusal.

[Real-file integration tests](packages/studio/src/ari/elementSourcePersistence.test.ts) exercise rename, animated duplicate, delete, forward and backward on the old animated headline. Every operation proves one history entry, the receipt's actual source checksum, history reopening, byte-identical CRLF undo and redo, rollback after a failed history write, stale-version refusal, and external-write preservation with unchanged undo/redo stacks. Deletion also checks that a removed identity cannot be written using a fresh source version. The earlier [element persistence tests](packages/studio/src/ari/elementOperations.test.ts) retain imported-image verification and failure coverage.

| Verification                                       | Result                                    |
| -------------------------------------------------- | ----------------------------------------- |
| Targeted source/element/history/registration tests | 6 files / 63 tests passed                 |
| `ari:test`                                         | 30 files / 417 tests passed               |
| Studio typecheck                                   | exit 0                                    |
| `ari:build`                                        | exit 0                                    |
| Changed-file lint / format                         | 0 warnings / 0 errors; formatting checked |

Logs: [targeted tests](screenshots/2026-09-10-a3-source-motion/tests.log), [Ari tests](screenshots/2026-09-10-a3-source-motion/ari-tests.log), [typecheck](screenshots/2026-09-10-a3-source-motion/typecheck.log), [build](screenshots/2026-09-10-a3-source-motion/build.log), [lint](screenshots/2026-09-10-a3-source-motion/lint.log), [format](screenshots/2026-09-10-a3-source-motion/format.log), [structural audit](screenshots/2026-09-10-a3-source-motion/structure.log).

The whole-tree structural audit is **not green**: exit 1, two dead-code issues, six complexity findings and 23 duplicate groups in the accumulated diff against `origin/main`. The new element source/motion/style functions no longer appear in its findings after decomposition; existing `elementTools.ts` parsing/execution complexity remains (this batch changes its descriptions only), together with findings in other earlier work. No suppression was added. This remains a repository gate for the continuation task, not a passing result. Test runs may print Vitest's existing ten-second shutdown warning; builds print bundle-size warnings. Neither is reported as a failed test or build.

Exact commands from the fork root:

```sh
npx --yes bun run --cwd packages/studio test src/ari/elementSource.test.ts src/ari/elementSourcePersistence.test.ts src/ari/elementOperations.test.ts src/utils/nullableHistory.test.ts src/utils/conditionalFileTransaction.test.ts src/webmcp/useStudioAgentTools.test.tsx
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues
./node_modules/.bin/oxlint packages/studio/src/ari/elementOperations.ts packages/studio/src/ari/elementOperations.test.ts packages/studio/src/ari/elementSource.ts packages/studio/src/ari/elementSource.test.ts packages/studio/src/ari/elementSourcePersistence.test.ts packages/studio/src/ari/elementMotionCopy.ts packages/studio/src/ari/elementStyleCopy.ts packages/studio/src/ari/AriElements.tsx packages/studio/src/webmcp/tools/elementTools.ts
./node_modules/.bin/oxfmt --check packages/studio/src/ari/elementOperations.ts packages/studio/src/ari/elementOperations.test.ts packages/studio/src/ari/elementSource.ts packages/studio/src/ari/elementSource.test.ts packages/studio/src/ari/elementSourcePersistence.test.ts packages/studio/src/ari/elementMotionCopy.ts packages/studio/src/ari/elementStyleCopy.ts packages/studio/src/ari/AriElements.tsx packages/studio/src/webmcp/tools/elementTools.ts ARI-NEXT-A3-ELEMENTS.md plans/2026-09-09-ari-studio-next-implementation.md
```

Continuation from the source/motion batch: the UI-integration follow-up below now supplies its browser evidence. Human testing, A3 scene operations, A4 and A5 remain open.

## UI integration and acceptance — 10 September 2026

Scope: finish the A3 **element** path. No scene authoring, private scene copies, export parity, human study, provider call, commit or push. Provider spend: **0 USD**.

### What changed

- [AriElements.tsx](packages/studio/src/ari/AriElements.tsx) opens with the shared selection and its current name. A dropdown choice calls `studio_select`; it no longer creates a separate editable selection. The open dialog pins its source while the preview rebuilds, displays the shared-source impact **before** saving and keeps stale versions until the user explicitly refreshes them. Template labels use readable text/alt text instead of generated SDK IDs.
- [AriLayers.tsx](packages/studio/src/ari/AriLayers.tsx) presents one button per source target and supported host. Each button passes its explicit instance and only the chosen instance is pressed. [selectionTools.ts](packages/studio/src/webmcp/tools/selectionTools.ts), [domEditingElement.ts](packages/studio/src/components/editor/domEditingElement.ts) and [useDomSelection.ts](packages/studio/src/hooks/useDomSelection.ts) now carry the **physical preview host**, not just a remembered time choice. Canvas selection records the host too. A missing stable identity refuses to fall back to a different same-class element; an asynchronous refresh cannot overwrite a newer selection/clear.
- [useElementReceiptSelection.ts](packages/studio/src/ari/useElementReceiptSelection.ts) waits for the refreshed preview and reselects the saved target in the chosen host. Deletion clears selection. It cancels superseded/project-switched work. Both UI and agent operations await this same callback. The saved receipt additionally reports `previewReady`; a preview timeout never pretends the source write was rolled back.
- [handles.ts](packages/studio/src/webmcp/handles.ts) and [inspectTools.ts](packages/studio/src/webmcp/tools/inspectTools.ts) re-resolve a selected explicit handle in its actual host. [useGsapTweenCache.ts](packages/studio/src/hooks/useGsapTweenCache.ts) and [useDomEditWiring.ts](packages/studio/src/hooks/useDomEditWiring.ts) use the SDK identity, source and instance when matching copied motion, rather than the first element sharing its class.
- [elementTools.ts](packages/studio/src/webmcp/tools/elementTools.ts) returns scoped handles with its source list and derives scene ownership/counts from the manifest, independently of temporary layer-tree loading. [elementOperations.ts](packages/studio/src/ari/elementOperations.ts) places new images proportionally inside their scene, including small nested scenes, while retaining the copied project path/checksum contract.
- [vite.offline.ts](packages/studio/vite.offline.ts), enabled by [ari-studio.mjs](scripts/ari-studio.mjs) `--offline`, rejects non-loopback server fetches before API/font initialization. This is an application fetch guard, not an OS firewall. Browser interception is installed before each first navigation. The local startup no longer depends on the earlier A1–A2 project directory.

### Browser evidence and limits

[Machine-readable report](screenshots/2026-09-10-a3-ui-integration/report.json) and [complete browser log](screenshots/2026-09-10-a3-ui-integration/browser.log):

| Path    | Viewport   | Result     | Checks |
| ------- | ---------- | ---------- | ------ |
| UI-only | 1280 × 800 | `ok: true` | 14     |
| UI-only | 1440 × 900 | `ok: true` | 14     |
| Mixed   | 1280 × 800 | `ok: true` | 14     |
| Mixed   | 1440 × 900 | `ok: true` | 14     |

The runner is [ari-elements.mjs](packages/studio/tests/e2e/ari-elements.mjs), with [old-template checks](packages/studio/tests/e2e/ari-elements-template.mjs) and [shared-scene checks](packages/studio/tests/e2e/ari-elements-nested.mjs). It uses the repository [synthetic scene fixture](packages/studio/tests/e2e/fixtures/ari-scenes/README.md) and [raster](packages/studio/tests/e2e/fixtures/ari-authoring/one.png). Fixture preparation happens before the experiment: clone, install local GSAP/plugin assets and wire their local tags. No acceptance source is patched by the driver after opening. This prepared scene fixture is **not** presented as a new scene arrangement created through the UI.

The primary UI-only path writes through visible controls. The mixed path uses discovered tools plus visible controls. Read-only tools and filesystem reads verify both. Rejected tool probes supplement the visible failure paths; a separate editor tab supplies the concurrent write for the stale-dialog test. Inputs are selected with the browser's native input selection, then entered using keyboard events; Enter activates actions. This is headed automation, **not human testing**.

Checks cover new text/image/background, old template text/image/background, animated copy and independent naming, deletion, overlap order, exact undo/redo versions, selected second host and pressed layer identity, a decoded nested image with the copied checksum, reopened source, removed-target refusal and visible recovery after another editor invalidates a dialog version. Receipts, inspected copy animations, selection snapshots, per-write source SHA-256 checks and decoded image dimensions are stored in the report. The four final **nested-source** versions match; no MP4 or whole-project equivalence is claimed.

Final browser evidence has zero page exceptions, zero workspace reloads, zero external request attempts and zero unexpected HTTP errors. It preserves **40 HTTP 404 responses** from the optional `/api/environment/ffmpeg` compatibility probe. This route exists in the CLI host, not this Vite host; [useFfmpegStatus.ts](packages/studio/src/components/renders/useFfmpegStatus.ts) explicitly treats an older/unreachable endpoint as unknown. Classification matches [webmcp-edit-loop.mjs](packages/studio/tests/e2e/webmcp-edit-loop.mjs); the responses are not silently discarded. [Server network log](screenshots/2026-09-10-a3-ui-integration/server-network.jsonl) records guard installation and no rejected outbound fetches.

Visual review checks the actual screenshots: the dialog fits both sizes, selected instance and shared impact are legible before saving, stale-version feedback is visible and the nested raster has a selection outline. The synthetic green raster deliberately overlaps the offer in the stress fixture; this is an editor/path test, not creative approval of an ad. Existing lengthy motion controls and English upstream toast text remain outside this element-integration scope.

Screenshots (each family exists for both modes and both sizes):

- [UI 1280 shared selection](screenshots/2026-09-10-a3-ui-integration/ui-only-1280-shared-impact.png), [UI 1440 shared selection](screenshots/2026-09-10-a3-ui-integration/ui-only-1440-shared-impact.png)
- [Mixed 1280 shared selection](screenshots/2026-09-10-a3-ui-integration/mixed-1280-shared-impact.png), [mixed 1440 shared selection](screenshots/2026-09-10-a3-ui-integration/mixed-1440-shared-impact.png)
- [UI nested raster](screenshots/2026-09-10-a3-ui-integration/ui-only-1440-nested-image.png), [mixed nested raster](screenshots/2026-09-10-a3-ui-integration/mixed-1280-nested-image.png)
- [UI conflict](screenshots/2026-09-10-a3-ui-integration/ui-only-1280-stale.png), [mixed conflict](screenshots/2026-09-10-a3-ui-integration/mixed-1440-stale.png)

### Verification and continuation

- Targeted source, history integration, selection, inspector, cache, dialog and offline tests: **15 files / 191 passed** — [log](screenshots/2026-09-10-a3-ui-integration/targeted.log).
- Ari suite: **32 files / 423 passed** — [log](screenshots/2026-09-10-a3-ui-integration/ari-tests.log).
- Studio and studio-server typechecks: exit 0 — [Studio](screenshots/2026-09-10-a3-ui-integration/typecheck.log), [server](screenshots/2026-09-10-a3-ui-integration/server-typecheck.log).
- Changed-file lint/format and line counts: [lint](screenshots/2026-09-10-a3-ui-integration/oxlint.log), [format](screenshots/2026-09-10-a3-ui-integration/oxfmt.log), [checked files](screenshots/2026-09-10-a3-ui-integration/checked-files.txt), [production line counts](screenshots/2026-09-10-a3-ui-integration/line-counts.txt).

The new regression tests include [dialog name/impact](packages/studio/src/ari/AriElements.test.tsx), [saved selection and cancellation](packages/studio/src/ari/useElementReceiptSelection.test.tsx), [deleted identity/physical host](packages/studio/src/components/editor/domEditingElement.identity.test.ts), [selected-host inspection](packages/studio/src/webmcp/tools/inspectTools.test.ts) and [server network refusal](packages/studio/vite.offline.test.ts). Existing real-file source/motion tests still cover rollback and byte-exact history. Some Vitest runs print their existing ten-second shutdown warning after all tests pass.

Continue through the same version-bound `saveElementOperation` and nullable history transaction. Remaining A3 scene operations, A4 private copies, A5 export parity, B3–B5, C, D and human testing are not approved by this evidence. This UI batch did not clear the earlier whole-diff structural-audit findings. The later structure-repair batch below clears that gate with new evidence.

`ari:build` also passed with exit 0 — [build log](screenshots/2026-09-10-a3-ui-integration/build.log). The task-owned foreground server has been stopped; port 3084 is free. Existing bundle-size and test-shutdown warnings are retained in the logs.

Exact final verification commands (fork root):

```sh
ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-a3-ui-integration/server-network.jsonl" npx --yes bun run ari:studio --port 3084 --offline --project packages/studio/tests/e2e/fixtures/ari-scenes
# In a second foreground terminal while that server runs:
npx --yes bun run ari:test:elements
# Stop the server after the browser run.
npx --yes bun run --cwd packages/studio test src/ari/AriElements.test.tsx src/components/editor/domEditing.test.ts src/components/editor/domEditingLayers.test.ts src/components/editor/domEditingElement.identity.test.ts src/hooks/useDomSelection.test.ts src/hooks/useDomSelectionSelectionGuards.test.ts src/hooks/useGsapTweenCache.test.ts src/ari/useElementReceiptSelection.test.tsx src/ari/elementOperations.test.ts src/ari/elementSource.test.ts src/ari/elementSourcePersistence.test.ts src/webmcp/tools/selectionTools.test.ts src/webmcp/tools/inspectTools.test.ts src/webmcp/useStudioAgentTools.test.tsx vite.offline.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
xargs ./node_modules/.bin/oxlint < screenshots/2026-09-10-a3-ui-integration/checked-files.txt
xargs ./node_modules/.bin/oxfmt --check < screenshots/2026-09-10-a3-ui-integration/checked-files.txt
./node_modules/.bin/oxfmt --check ARI-NEXT-A3-ELEMENTS.md plans/2026-09-09-ari-studio-next-implementation.md
git diff --check
lsof -ti tcp:3084
```

## Audit corrections: selection races and root impact (10 September 2026)

The previous four 14-check runs remain evidence for the ordinary element flows, not for concurrent selection. This follow-up fixes two separate gaps:

- [Receipt selection](packages/studio/src/ari/useElementReceiptSelection.ts) now captures the shared `selectionRevisionRef` owned by [DOM selection](packages/studio/src/hooks/useDomSelection.ts). A later element choice, instance choice, clear or marquee supersedes pending restoration, both before preview readiness and after asynchronous resolution. Project/unmount and newer-receipt cancellation still apply. Cancellation returns `previewReady: false`; it does not undo or misreport a successful source write.
- Browser regression exposed a second automatic writer in [preview synchronization](packages/studio/src/hooks/useDomEditPreviewSync.ts). It now checks the same revision, effect lifetime and document identity after resolving, retains the selected instance, and marks automatic rebindings with `preserveRevision`. Rebinding the existing selection is not a new user choice. Without this distinction, a refresh could cancel selection of a newly duplicated element. Marquee selection advances the shared revision too.
- [Element tools](packages/studio/src/webmcp/tools/elementTools.ts) report one affected instance for the active root, retain the resolved shared-host count, and refuse an unresolved nested source before reading or writing it. [Element UI](packages/studio/src/ari/AriElements.tsx) says “Muutos koskee tätä kohtausta.” for one and “Muutos koskee yhteisen kohtauksen jokaista esiintymää (2).” for two.

### New evidence

- [Targeted log](screenshots/2026-09-10-a3-audit-fixes/targeted.log): **8 files / 52 tests passed**. Includes six delayed-receipt cases (preview/resolve × another element/another instance/clear), five automatic-preview cases including unmount, real shared-revision behavior, root/shared/unresolved tool reads and writes, successful source receipts despite cancelled preview restoration, and singular/plural UI text.
- [Ari log](screenshots/2026-09-10-a3-audit-fixes/ari-tests.log): **33 files / 433 tests passed**. The existing post-success Vite shutdown warning remains in the log.
- [Headed delayed-selection report](screenshots/2026-09-10-a3-audit-fixes/browser-report.json): **3 checks, `ok: true`**. A fresh local blank project gets two text elements through tools. The runner holds only the receipt hook's timer, waits for the saved preview, selects the background using Studio's documented canvas-selection test hook, then releases the old restoration. The background stays selected, the rename is saved, the receipt version matches the source readback, and root impact is one in the read, receipt and dialog. This is headed automation, not human testing or a UI-only creation claim.
- [Delayed visible selection](screenshots/2026-09-10-a3-audit-fixes/delayed-new-selection.png) and [root impact dialog](screenshots/2026-09-10-a3-audit-fixes/root-impact.png) were visually inspected: the selected background outline and layer agree, the renamed text remains in the layer list, and the singular impact text fits the dialog. Overlapping synthetic texts are intentional test input, not an ad-quality claim.
- [Typecheck](screenshots/2026-09-10-a3-audit-fixes/typecheck.log), [lint](screenshots/2026-09-10-a3-audit-fixes/oxlint.log), [format](screenshots/2026-09-10-a3-audit-fixes/oxfmt.log): passed. [Changed production line counts](screenshots/2026-09-10-a3-audit-fixes/line-counts.txt): largest 594 lines. This does not certify the earlier whole-diff structural gate.

The browser uses local project creation and an offline server; interception is installed before navigation. [Server network log](screenshots/2026-09-10-a3-audit-fixes/server-network.jsonl) records guard installation and no outbound attempts. The successful delayed run reports no page errors or external requests. Early driver attempts used an incorrect iframe lookup/preview mode and an unreliable coordinate click on the dialog launcher; the final runner uses a live saved-preview check and activates the visible control directly. No acceptance source is patched. One regression attempt was invalidated by development hot updates during the run; final acceptance must run against settled source.

Commands from the fork root (server runs in its own foreground terminal):

```sh
ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-a3-audit-fixes/server-network.jsonl" npx --yes bun run ari:studio --port 3084 --offline --project packages/studio/tests/e2e/fixtures/ari-scenes
npx --yes bun packages/studio/tests/e2e/ari-elements-selection-race.mjs
ARI_ELEMENTS_EVIDENCE=screenshots/2026-09-10-a3-audit-fixes/regression npx --yes bun run ari:test:elements
npx --yes bun run --cwd packages/studio test src/ari/useElementReceiptSelection.test.tsx src/ari/AriElements.test.tsx src/webmcp/tools/elementTools.test.ts src/hooks/useDomSelectionSelectionGuards.test.ts src/hooks/useDomSelection.test.ts src/hooks/useDomEditPreviewSync.test.tsx src/hooks/useDomEditSession.test.tsx src/hooks/useTimelineSelectionPreviewSync.test.tsx
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
xargs ./node_modules/.bin/oxlint < screenshots/2026-09-10-a3-audit-fixes/checked-files.txt
xargs ./node_modules/.bin/oxfmt --check < screenshots/2026-09-10-a3-audit-fixes/checked-files.txt
git diff --check
```

The next scene-operation batch can reuse the shared revision ref through the DOM actions context. A saved receipt may return `previewReady: false` when the user has moved on; source success is independent of preview focus. Scene operations, A4, A5, persistent comparisons and human testing remain outside this correction.

Final settled-source regression: [report](screenshots/2026-09-10-a3-audit-fixes/regression/report.json), [log](screenshots/2026-09-10-a3-audit-fixes/regression-browser.log). **All four headed UI-only/mixed runs at 1280×800 and 1440×900 passed 14 checks each**. All successful root receipts report one instance; nested receipts report two and `previewReady: true`. All four nested-source versions match (`572250ad2d91beccc6006142075b0172d4f24c95c22d153f7c4e6d3f32e61542`). No page errors, corrective workspace reloads, external requests or unexpected HTTP errors. The known optional FFmpeg probe responses remain recorded. [Shared impact screenshot](screenshots/2026-09-10-a3-audit-fixes/regression/mixed-1280-shared-impact.png) was visually checked: the selected second host and the corrected Finnish sentence agree.

`npx --yes bun run ari:build` passed, exit 0: [build log](screenshots/2026-09-10-a3-audit-fixes/build.log). The task-owned server and its preview browser were stopped; port 3084 has no listener. No commit or push. Provider spend: **0 USD**. The previous acceptance directory is unchanged.

## Rakennetarkistuksen korjaus

Aiempi punainen rakennetarkistus on korjattu muuttamatta asetuksia, baselinea tai tarkistuksen kattavuutta. Yhteisen valinnan revision-suoja, juuren vaikutusmäärä ja nullable-historian ehdollinen palautus säilyvät. Uusi erillinen näyttö ja ajurien regressiot ovat [rakenteen korjausraportissa](ARI-NEXT-STRUCTURE-REPAIR.md). Edellisten erien lokit jäävät historialliseksi näytöksi; niiden punainen tulos ei kuvaa nykyistä porttia.
