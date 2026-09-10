# C1–C5: compact editing panel

Implemented locally on 10 September 2026. C1–C4 and the automated C5 journey are delivered. The human usability target has **not** been tested. D remains outside this batch.

## What changed

[AriPanelSections](packages/studio/src/ari/AriPanelSections.tsx) provides **Teksti**, **Ulkoasu**, **Liike** and **Tarkistus**. The selected name, scene and instance remain above the sections. Switching sections preserves drafts and returns the panel to its top. Arrow keys, Home and End operate the tab list with visible focus. Inactive controls are hidden from keyboard navigation. Reduced-motion styling is confined to Studio controls; it cannot alter the iframe's ad animation.

[AriCommandPanel](packages/studio/src/ari/AriCommandPanel.tsx) retains the existing text, style, motion, export and real version-comparison services. Technical receipts remain in separate disclosures. [AriMotion](packages/studio/src/ari/AriMotion.tsx) puts timing, duration and feel first; detailed curves and instance controls open separately. The clocks are **Kohtauksessa** and **Koko videossa**. [AriNumber](packages/studio/src/ari/AriNumber.tsx) displays decimal commas and retains the existing numeric parser. The playhead, frame evidence and motion bars also use commas. [AriControlPanel](packages/studio/src/ari/AriControlPanel.tsx) reserves a fixed-height status area so saving cannot move the action buttons.

No write service or agent command was replaced. The same bounded commands still own persistence and receipts.

## Defects found during the journey

- Studio-authored attribute-selector motion remained in the source but disappeared from the panel after a nested text edit. [The animation cache](packages/studio/src/hooks/useGsapTweenCache.ts) now matches the stable `data-hf-id` as well as the live DOM selector. [The regression](packages/studio/src/hooks/useGsapTweenCache.test.ts) covers an unavailable/replacing preview node without matching another element's motion.
- A full history preview rebuild cleared the current timeline identity, and selection refresh could interpret the not-yet-discovered DOM as deletion. [Preview persistence](packages/studio/src/hooks/usePreviewPersistence.ts) retains the identity. [Timeline synchronization](packages/studio/src/hooks/useTimelineSelectionPreviewSync.ts), [selection refresh](packages/studio/src/hooks/useDomSelection.ts) and [preview synchronization](packages/studio/src/hooks/useDomEditPreviewSync.ts) defer missing-target decisions until discovery is ready. The existing revision guard still protects newer user selections and clears. A genuinely deleted target clears selection.
- Early driver failures are retained under `screenshots/2026-09-10-c-panel/`: receipt polling was replaced by a subscription because read calls can replace the latest bridge receipt; decimal fields use explicit keyboard replacement; undo/redo waits for saved source bytes. Debug instrumentation initially tried to access storage inside the sandboxed comparison iframe. It now runs only in the top-level Studio document. The sandbox was not weakened.

## Acceptance evidence

[Visible C journey](packages/studio/tests/e2e/ari-panel.mjs), [accepted report](screenshots/2026-09-10-c-panel/accepted-final/report.json), [execution log](screenshots/2026-09-10-c-panel/accepted-final.log).

Four headed runs cover UI-only and mixed authoring at 1280×800 and 1440×900. Each creates a local project and two shared scene instances through current controls/tools, adds a synthetic headline, selects the second instance, adds motion, saves a named version, changes text, enters comma timing, changes feel, checks invalid input and correction, undoes/redoes, compares frozen versions at 9.5 seconds, uses keyboard section navigation and deletes the selection. There are no acceptance-source repairs or corrective reloads. This is automation, **not a human test**; no sub-five-minute usability or response-time claim is made.

Each run has ten checks. Receipts, before-motion inspection, selection identities before and after history, runtime texts/times and measured rectangles are recorded in the JSON. Both frozen frames are captured separately and show different text and opacity at the same time; comparison does not change the active source.

| Control      | Top / bottom, both viewports | Panel scroll                       |
| ------------ | ---------------------------- | ---------------------------------- |
| Kohtauksessa | 419 / 459 px                 | 0                                  |
| Duration     | 487 / 527 px                 | 0                                  |
| Feel         | 555 / 595 px                 | 0                                  |
| Save motion  | 603 / 643 px                 | 0; same position before/after save |

Visibility assertions use the panel's actual clipping rectangle, not just the browser viewport. [1280 motion](screenshots/2026-09-10-c-panel/accepted-final/ui-only-1280-motion.png), [1440 motion](screenshots/2026-09-10-c-panel/accepted-final/ui-only-1440-motion.png), [1280 comparison](screenshots/2026-09-10-c-panel/accepted-final/ui-only-1280-review.png), [1440 comparison](screenshots/2026-09-10-c-panel/accepted-final/ui-only-1440-review.png) are the visual evidence. The motion screenshots document editor geometry; the frozen comparison captures 9.5 seconds with both texts visible. All four screenshots were visually reviewed. This batch does not re-certify exported video.

| Verification                                                                                | Result                                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Ari tests](screenshots/2026-09-10-c-panel/ari-tests-final.log)                             | 40 files / 479 passed                                            |
| [Selection/cache/history regressions](screenshots/2026-09-10-c-panel/regressions-final.log) | 8 files / 62 passed                                              |
| [Studio typecheck](screenshots/2026-09-10-c-panel/typecheck.log)                            | Exit 0                                                           |
| [Build](screenshots/2026-09-10-c-panel/build-final.log)                                     | Exit 0; ordinary chunk-size warnings                             |
| [Whole-diff lint](screenshots/2026-09-10-c-panel/lint.log)                                  | Zero warnings/errors                                             |
| [Formatting](screenshots/2026-09-10-c-panel/format-check.log)                               | Checked over the recorded file list                              |
| [Structure](screenshots/2026-09-10-c-panel/structure-final.json)                            | Original new-only gate: zero new findings; 26 inherited findings |
| [Production file lengths](screenshots/2026-09-10-c-panel/file-lines.json)                   | All below 600; largest 598                                       |

Some successful Vitest runs retain the pre-existing close-timeout diagnostic and exit zero. It is not counted as a test. [Offline guard](screenshots/2026-09-10-c-panel/offline.jsonl) was installed before opening projects. Font lookup attempts were refused before network access. Accepted browser reports require zero external requests, page errors and corrective reloads; optional FFmpeg capability 404s remain separately listed.

## Separate open regression

The broader [element regression](screenshots/2026-09-10-c-panel/elements-final/report.json) does **not** pass its two-browser recovery case. After another browser records an edit, **Lue ajantasainen tilanne** refreshes source data but not the persistent history controller. The next write correctly refuses with **Muutoshistoria muuttui. Avaa projekti uudelleen.** The frozen-history precondition is in [projectVersions](packages/studio/src/utils/projectVersions.ts). This is a B-version-history integration follow-up; the check was not removed or marked green. A prior attempt also exposed a read-after-wait race in the driver's selected-row assertion; it now captures the expected row atomically.

Human C5 testing with at least three Finnish-speaking target users remains outstanding. D's notebook and correction loop are not implemented by this batch. The existing Node-host workaround remains; this work does not resolve Bun-hosted Vite startup.

## Commands

From the fork root:

```sh
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/hooks/useGsapTweenCache.test.ts src/hooks/usePreviewPersistence.selection.test.tsx src/hooks/useTimelineSelectionPreviewSync.test.tsx src/hooks/useDomEditPreviewSync.test.tsx src/hooks/useDomSelection.test.ts src/hooks/useDomSelectionSelectionGuards.test.ts src/ari/useElementReceiptSelection.test.tsx src/webmcp/tools/elementTools.test.ts
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues --format json
```

Foreground host, then the journey in another foreground terminal:

```sh
ARI_OFFLINE=1 HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false npx --yes bun run --cwd packages/studio node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
ARI_PANEL_EVIDENCE=screenshots/2026-09-10-c-panel/new-run npx --yes bun run ari:test:panel
ARI_ELEMENTS_EVIDENCE=screenshots/2026-09-10-c-panel/elements-new-run npx --yes bun run ari:test:elements
```

Cost **0 USD**. No external service calls, commit, push, stash, checkout or reset.

Owned browser processes and the foreground host are stopped. [Port check](screenshots/2026-09-10-c-panel/ports.json) records port 3084 free.

## B/C audit corrections — new acceptance evidence

The [full acceptance follow-up](ARI-NEXT-D-FOUNDATION.md#bc-acceptance-follow-up--verified) and [aggregate report](screenshots/2026-09-10-bc-acceptance/report.json) now verify the checked project/history refresh and playing agent seek. Four independent two-context history journeys retain drafts and both editors' changes through refresh/save/undo/redo. Both frozen runtime clocks hold 1.2 seconds over four samples and resume together. Comparison, elements and C-panel regressions pass in UI-only and mixed paths at 1280×800 and 1440×900: 4×10, 4×14 and 4×10 checks respectively. All accepted runs have zero page errors, corrective reloads and external requests. The earlier red element report remains unchanged as historical evidence; its recovery failure is now superseded by the new green runs.

486 Ari tests and 37 targeted tests pass; typecheck, lint, formatting and the original whole-diff structure gate pass without new exemptions. Panel fields remain visible with unchanged before/after button rectangles. Screenshots were visually reviewed; this is not a human usability study. D1–D7 remain open. Local USD 0, no production changes in this acceptance batch, no commit/push; owned browsers and server stopped.
