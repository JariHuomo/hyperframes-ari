# Ari · D5–D7 — repair rounds, approved copy, stopping the work and the local version approval

Batch report for D5, D6 and D7 of
[the approved feature spec](plans/2026-09-09-ari-studio-next-features-spec.md). D5 shipped first and
is recorded below unchanged; **D6 and D7 were added in the batch documented from
[D6 · Pysäytä työ](#d6--pysäytä-työ) onwards**. No human test was performed for any of them; no
external service call, commit or push was made; owned hosts were stopped and port 3084 is free.

## What the batch had to add

D1–D4 already carried the notebook, the durable operation journal and the review packages. What was
missing was the one thing that makes a repair loop bounded: a limit that a tool cannot walk around,
and protection for copy the customer already approved.

Both live on the **shared write path**. `prepareSourceOperation` is the single choke point every
tracked source write passes — the visible controls through `saveProjectFilesWithHistory`, the agent
tools through the same queue — and it publishes the immutable intent _before_ the first byte is
written. The refusal therefore happens before the intent exists, which is why a refused change is
never resumable and never leaves a half-finished operation behind.

## Interface

### Server

- [`packages/studio-server/src/ari/notebookRepair.ts`](packages/studio-server/src/ari/notebookRepair.ts) — the settings that live in the notebook: `repairLimit` (product default **2**, bounded 0–20), `activeRepairTaskId`, and `locks[] = { id, label, text, tasks[] }` where `tasks` are the task ids holding an explicit mandate. `normalizeText` collapses whitespace; `occurrences` counts non-overlapping hits. `applyRepairAction` implements `repair_limit`, `active_repair`, `repair_plan`, `lock`, `unlock` and `authority`, and returns `false` for anything else so the notebook still refuses an unknown action.
- [`packages/studio-server/src/ari/repairGate.ts`](packages/studio-server/src/ari/repairGate.ts) — `assertOperationAllowed(root, operation)` reads the notebook itself and refuses; `recordRepairRound` writes one file per consumed round under `.ari-notebook/repairs/`; `repairView` is what `studio_notebook` returns; `readRefusals` reads `.ari-notebook/refusals.json` (last 200).
- [`packages/studio-server/src/ari/notebookFile.ts`](packages/studio-server/src/ari/notebookFile.ts) — new. The notebook's types, parser and bounded loader had to leave `notebook.ts`, because reading the locks from the write path would otherwise close an import cycle `operationJournal → notebook → reviewPackage → versionSnapshot → versionStore → operationJournal`. The structure gate caught exactly that; it is now broken, not suppressed.
- [`packages/studio-server/src/ari/operationJournal.ts`](packages/studio-server/src/ari/operationJournal.ts) — three added lines: refuse, publish, then record the consumed round. The receipt gained `repairTaskId`.

The order matters and is deliberate: **the limit is checked first, the locks second**. A task that
has spent its rounds is told so rather than being told about a lock it could not have edited anyway.

### Refusal messages

Both are Finnish, both are the message the visible dialog shows in `role=alert` and the message the
agent tool returns as `reason`:

```
Korjauskierrosten raja täyttyi: tehtävä "Korjaa otsikko" on käyttänyt 2/2 kierrosta.
Jäljellä oleva puute: Hinta puuttuu ruudusta. Seuraava ehdotus: Kysy hinta asiakkaalta.
Päätä jatkosta itse; automaattista jatkoa ei ole.

Hyväksyttyä tekstiä ei muuteta ilman erillistä muutosvaltuutta: Pääviesti.
Lukittu teksti: "Pieni tauko.". Lähteitä, versioita tai perumishistoriaa ei muutettu.
```

An unrecorded gap or suggestion prints `ei kirjattu muistikirjaan` rather than an empty sentence.

### Client

- [`packages/studio/src/ari/AriNotebookRepair.tsx`](packages/studio/src/ari/AriNotebookRepair.tsx) — the visible **Hyväksytty sisältö ja korjauskierrokset** block inside **Muistikirja**: the limit, the task that is spending rounds, each task's `used/limit` with **raja täynnä** and its gap and suggestion, the lock form, every lock with its per-task mandate checkbox and **Poista lukitus**, and **Torjutut muutokset**. It states that the limit and the locks bind the agent tools too, and that the protection reaches exactly as far as the tracked write path.
- [`packages/studio/src/webmcp/tools/notebookTools.ts`](packages/studio/src/webmcp/tools/notebookTools.ts) — the same six actions on `studio_update_notebook`, and `studio_notebook` now returns `repair`. **The registry still holds 36 names**; this is six actions on an existing constrained command, not six new tools.

### What D6–D7 built on

- `repairView(root, notebook)` already returns per-task state and the refusal history; a **Pysäytä työ** flag belongs beside `activeRepairTaskId` in the same notebook and refused in the same `assertOperationAllowed`, which is the only place that can stop the _next_ write rather than the next button.
- `recordRefusal` is the receipt shape a stop or an expired approval should reuse, so every refusal stays in one list.
- A version-bound local approval should bind `versionId` the way `reviewAssessments.ts` already does, and expire through the same `source_changed` rule.

## Evidence

| Check                                                                                                                                                         | Result                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`repairGate.test.ts`](packages/studio-server/src/ari/repairGate.test.ts) + [`notebookRepair.test.ts`](packages/studio-server/src/ari/notebookRepair.test.ts) | 9 new tests, part of the 378 below                                                                                                                                                                               |
| `npx --yes bun run --cwd packages/studio-server test src/ari src/routes`                                                                                      | **378 passed / 33 files** ([log](screenshots/2026-09-10-d5-repair-limit/server-tests.log))                                                                                                                       |
| `npx --yes bun run ari:test`                                                                                                                                  | **503 passed / 46 files** ([log](screenshots/2026-09-10-d5-repair-limit/ari-test.log))                                                                                                                           |
| studio + studio-server `typecheck`                                                                                                                            | pass ([log](screenshots/2026-09-10-d5-repair-limit/typecheck.log))                                                                                                                                               |
| `npx --yes bun run ari:build`                                                                                                                                 | pass ([log](screenshots/2026-09-10-d5-repair-limit/build.log))                                                                                                                                                   |
| `oxfmt --check` / `oxlint`, 16 changed files                                                                                                                  | clean ([format](screenshots/2026-09-10-d5-repair-limit/format.log), [lint](screenshots/2026-09-10-d5-repair-limit/lint.log), [file list](screenshots/2026-09-10-d5-repair-limit/checked-files.txt))              |
| Whole-diff structure gate, original `new-only` port                                                                                                           | **pass — 0 introduced findings** (1 inherited complexity, 25 inherited duplicate groups), `.fallowrc.jsonc` unchanged, no suppressions ([structure.json](screenshots/2026-09-10-d5-repair-limit/structure.json)) |
| Largest changed production file                                                                                                                               | `AriNotebook.tsx` 283 lines; every other one is smaller                                                                                                                                                          |

### Visible browser journeys

[`packages/studio/tests/e2e/ari-repair-limit.mjs`](packages/studio/tests/e2e/ari-repair-limit.mjs), run
as `ari:test:repair` against an offline host on 3084.

| Run                                                                                                       | Result                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Build phase](screenshots/2026-09-10-d5-repair-limit/final/report.json)                                   | **ok: true** — 4 runs (ui-only/mixed × 1280 × 800 and 1440 × 900), **5 checks each**      |
| [Reopen phase](screenshots/2026-09-10-d5-repair-limit/final-reopen/report.json), fresh server and browser | **ok: true** — 4 runs, 1 check each                                                       |
| pageErrors / externalRequestsBlocked / workspaceReloads                                                   | 0 / 0 / 0 in both                                                                         |
| Deliberate refusals                                                                                       | exactly **8** while building (one lock, one limit per case) and **4** on reopen, asserted |

Each case, in both a visible-only and a tool-driven path:

1. Adds the approved message **before** any lock exists, so no repair round is spent on it.
2. Records the task, its gap and suggestion, the lock and the active task — through the visible
   panel in `ui-only`, through `studio_update_notebook` in `mixed`.
3. Tries to remove the locked message. Refused; the source bytes, the source revision and the
   version index are captured immediately before and after and asserted **deepEqual**.
4. Spends two repair rounds on real tracked writes, then reads `used: 2, exhausted: true`.
5. Tries a third. Refused, and the message is asserted to contain both the gap and the suggestion —
   again with the source and version index unchanged around it.
6. Reads both refusal receipts back out of the visible **Torjutut muutokset** list.

The reopen phase then meets the same limit from a new server process and a new browser session, with
the locks and the active task still in place, and asserts `2/2 kierrosta — raja täynnä` in the panel.

Screenshots, visually inspected:
[ui-only 1280](screenshots/2026-09-10-d5-repair-limit/final/ui-only-1280-repair.png),
[ui-only 1440](screenshots/2026-09-10-d5-repair-limit/final/ui-only-1440-repair.png),
[mixed 1280](screenshots/2026-09-10-d5-repair-limit/final/mixed-1280-repair.png),
[mixed 1440](screenshots/2026-09-10-d5-repair-limit/final/mixed-1440-repair.png),
[reopened](screenshots/2026-09-10-d5-repair-limit/final-reopen/ui-only-1440-reopened.png).

### Regression on the refactored harness

Removing the duplication the structure gate flagged meant moving the notebook journey's shared
plumbing into [`ari-notebook-helpers.mjs`](packages/studio/tests/e2e/ari-notebook-helpers.mjs), which
touches the existing D1 journey. It was re-run into its own directory rather than trusted:
[`ari:test:notebook`](screenshots/2026-09-10-d5-repair-limit/notebook-regression/report.json) —
**ok: true**, 4 runs × 4 checks, 0 page errors. Its original evidence under
`screenshots/2026-09-10-d-notebook/` is untouched.

## Findings along the way

- **A real import cycle.** Reading the locks from `operationJournal` closed a five-module cycle
  through the version store. Fixed by extracting `notebookFile.ts`, not by suppressing the finding.
- **`EMFILE: too many open files`** stopped two host processes mid-run. Cause: 651 throwaway projects
  had accumulated under the gitignored `packages/studio/data/projects/`, and the dev-server file
  watcher opens descriptors for all of them. Removing the 199 ephemeral `a3-bootstrap-*` directories
  was enough. This is housekeeping, not a product defect, but it will recur.
- Two failed journey attempts are kept as evidence: `attempt-1.log`/`attempt-2.log` (a baseline
  captured before the successful rounds instead of around the refusal, and a visible dialog reporting
  in `role=alert` where a tool reports `reason`) and `attempt-2-failure.png`.

## Limits — read these

- The gate covers exactly the tracked write path. **Image imports, binary version restores, rich text
  and legacy animated-position edits are outside it**, the same documented scope as
  [`ARI-NEXT-D-OPERATIONS.md`](ARI-NEXT-D-OPERATIONS.md), and the panel says so in Finnish.
- A lock is mechanical. Approved copy split across inline tags inside one element will not match, and
  a lock that never matched protects nothing. Nothing here judges meaning, and no model is called.
- Refusals are bounded to the last 200 receipts; older ones roll off.
- **No human test was performed.** The journeys are automation.

## Verification commands

```sh
ARI_OFFLINE=1 ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-d5-repair-limit/server-network-final.jsonl" HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false PRODUCER_LOW_MEMORY_MODE=1 PRODUCER_HEADLESS_SHELL_PATH="$PWD/screenshots/2026-09-10-d5-repair-limit/chrome-offline.sh" npx --yes bun run --cwd packages/studio node --import tsx node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
ARI_REPAIR_EVIDENCE=screenshots/2026-09-10-d5-repair-limit/final npx --yes bun run ari:test:repair
# restart the server, then:
ARI_REPAIR_EVIDENCE=screenshots/2026-09-10-d5-repair-limit/final-reopen ARI_REPAIR_REOPEN=screenshots/2026-09-10-d5-repair-limit/final/report.json npx --yes bun run ari:test:repair
# restart the server, then:
ARI_NOTEBOOK_EVIDENCE=screenshots/2026-09-10-d5-repair-limit/notebook-regression npx --yes bun run ari:test:notebook
npx --yes bun run --cwd packages/studio-server test src/ari/repairGate.test.ts src/ari/notebookRepair.test.ts src/ari/notebook.test.ts src/ari/operationJournal.test.ts
npx --yes bun run --cwd packages/studio-server test src/ari src/routes
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck && npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
xargs npx --yes oxfmt --check < screenshots/2026-09-10-d5-repair-limit/checked-files.txt
xargs npx --yes oxlint < screenshots/2026-09-10-d5-repair-limit/checked-files.txt
npx --yes bun x --no-install fallow audit --base origin/main --fail-on-issues --format json
```

---

# D6 · Pysäytä työ

## What the batch had to add

D5 proved that a refusal belongs on the **shared write path**. D6 reuses exactly that seam:
`prepareSourceOperation` calls `assertOperationAllowed`, which now checks the stop **first** — a
stopped project is told it is stopped, not told about a round limit or a lock it was never going to
reach.

### The orderly end of a half-finished save

This is a decision, not an omission. **The stop refuses the next tracked source write; an operation
whose intent is already published is written to completion.**

`prepareSourceOperation` publishes an immutable intent before the first byte. `writeSourceOperation`
then reads its bytes exclusively from that intent, one conditional write per file, and
`bindSourceOperation` publishes the receipt inside the same index bytes as the history. Refusing at
prepare means a refused change never becomes a resumable operation, so it leaves nothing behind.
Refusing _after_ prepare would do the opposite: it would orphan a published intent that `Jatka työtä`
could only ever resolve as `uncertain`, and it could leave a multi-file write half-applied. So the
sources always end byte-exactly in the before state (refused) or byte-exactly in the after state
(finished), never in between —
[`notebookStop.test.ts`](packages/studio-server/src/ari/notebookStop.test.ts) asserts both.

Notebook edits, observations, assessments and approvals are not source writes and stay available
while stopped. The panel says so in Finnish; that is the point of stopping.

## Interface

### Server

- [`notebookStop.ts`](packages/studio-server/src/ari/notebookStop.ts) — `stop: StopEntry | null`
  and `stopHistory[]` in the notebook, with `by`, `byType`, `reason` and `createdAt`.
  `byType` is `human | external_agent | test_data`: **there is no technical actor**, because a
  machine does not decide to stop the work. `applyStopAction` implements `stop_work` and
  `resume_work`; stopping twice or resuming a running project is refused.
- [`repairGate.ts`](packages/studio-server/src/ari/repairGate.ts) — `assertWorkNotStopped` records a
  `work_stopped` receipt into the same `.ari-notebook/refusals.json` list D5 uses, then throws.
  `repairView` returns `stop` and `stopHistory`.
- [`notebookTestProject.ts`](packages/studio-server/src/ari/notebookTestProject.ts) — one project,
  one notebook saver and one operation intent, shared by the D5 and D6 gate tests so both meet the
  same choke point instead of two similar-looking imitations of it.

The refusal, verbatim:

```
Työ on pysäytetty: Hyväksyntäajo pysäytti sen 2026-09-10T07:48:47.265Z. Syy: Odotetaan asiakkaan
hintaa. Seuraavaa muutosta ei aloitettu. Jatka työtä vapauttaa kirjoitukset; muistikirja, havainnot
ja arviot ovat käytettävissä myös pysäytettynä.
```

### Client

- [`AriNotebookStop.tsx`](packages/studio/src/ari/AriNotebookStop.tsx) — the visible **Työn
  pysäytys** block: the state in `role=status`, the actor, the role, the reason, the one button and
  **Pysäytyshistoria**. The button's accessible name is _Jatka pysäytettyä työtä_, because the
  operation-resume control above it in the same dialog is also labelled _Jatka työtä_ — the first
  journey attempt clicked the wrong one, which is exactly the collision a user would hit.
- [`AriNotebookFields.tsx`](packages/studio/src/ari/AriNotebookFields.tsx) — the shared field style
  and the three-way actor select, so the stop, the approval and the repair block spell one control
  one way.

# D7 · Local version approval and the draft export

- [`notebookApproval.ts`](packages/studio-server/src/ari/notebookApproval.ts) — `bindApproval`
  refuses an approval without a **readable** review package bound to that exact version, and without
  a stated position on all four assessment categories: an assessment, or an explicit
  `notApplicable` entry with a reason. A rejected version can never be approved afterwards.
  `describeApprovals` ages every row through the same `source_changed` / `package_unreadable` rule
  the assessments use and returns the standing approval plus `approvedRevisions`.
  `describeExport` is the export receipt.
- [`notebook.ts`](packages/studio-server/src/ari/notebook.ts) — the `approval` action on the same
  conditional notebook save; the read model returns `approvals`, `currentApproval`,
  `approvedRevisions` and `export`.
- [`AriNotebookApproval.tsx`](packages/studio/src/ari/AriNotebookApproval.tsx) — **Version
  hyväksyntä**: the package, the decider, the role, the reason, one _ei sovellu_ field per category,
  **Hyväksy versio paikallisesti**, **Hylkää versio**, the export receipt and every decision with its
  staleness.
- [`AriExport.tsx`](packages/studio/src/ari/AriExport.tsx) +
  [`exportApproval.ts`](packages/studio/src/ari/exportApproval.ts) — a local export is **always**
  allowed. The receipt beside it reads _Hyväksytty versio_ when the exported revision carries a
  standing approval and _Luonnos, ei hyväksytty_ otherwise, and both sentences end with **ei
  asiakastuotannon julkaisu**. An unreadable notebook falls back to `draft`, never to `approved`.

The refusal an incomplete approval gets, verbatim:

```
Hyväksyntä vaatii kannanoton kaikkiin neljään osa-alueeseen. Puuttuu: Viesti, Ulkoasu, Liike, Ääni.
Kirjaa arvio tai merkitse osa-alue perustellusti "ei sovellu". Tekninen mittaus ei riitä.
```

### Tools

**The registry still holds 36 names.** `studio_update_notebook` gained `stop_work`, `resume_work`
and `approval`; `studio_notebook` returns `repair.stop`, `repair.stopHistory`, `approvals`,
`currentApproval`, `approvedRevisions` and `export`. `useStudioAgentTools.test.tsx` still asserts 36.

## Evidence

| Check                                                                                                                                                                 | Result                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`notebookStop.test.ts`](packages/studio-server/src/ari/notebookStop.test.ts) + [`notebookApproval.test.ts`](packages/studio-server/src/ari/notebookApproval.test.ts) | 11 new tests, part of the 389 below                                                                                                                                                                                  |
| `npx --yes bun run --cwd packages/studio-server test src/ari src/routes`                                                                                              | **389 passed / 35 files** ([log](screenshots/2026-09-10-d6-d7-stop-approval/server-tests.log))                                                                                                                       |
| `npx --yes bun run ari:test`                                                                                                                                          | **505 passed / 46 files** ([log](screenshots/2026-09-10-d6-d7-stop-approval/ari-test.log))                                                                                                                           |
| studio + studio-server `typecheck`                                                                                                                                    | pass ([log](screenshots/2026-09-10-d6-d7-stop-approval/typecheck.log))                                                                                                                                               |
| `npx --yes bun run ari:build`                                                                                                                                         | pass, exit 0 ([log](screenshots/2026-09-10-d6-d7-stop-approval/build.log))                                                                                                                                           |
| `oxfmt` / `oxlint`, 27 changed files                                                                                                                                  | clean, 0 warnings and 0 errors ([file list](screenshots/2026-09-10-d6-d7-stop-approval/checked-files.txt))                                                                                                           |
| Whole-diff structure gate, original `new-only` port                                                                                                                   | **pass — 0 introduced findings** (1 inherited complexity, 25 inherited duplicate groups), `.fallowrc.jsonc` unchanged, no suppressions ([structure.json](screenshots/2026-09-10-d6-d7-stop-approval/structure.json)) |
| Largest changed production file                                                                                                                                       | `AriNotebook.tsx` 303 lines; every new module is smaller                                                                                                                                                             |

### Visible browser journeys

[`packages/studio/tests/e2e/ari-stop-approval.mjs`](packages/studio/tests/e2e/ari-stop-approval.mjs),
run as `ari:test:stop` against an offline host on 3084.

| Run                                                                                                           | Result                                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Build phase](screenshots/2026-09-10-d6-d7-stop-approval/final/report.json)                                   | **ok: true** — 4 runs (ui-only/mixed × 1280 × 800 and 1440 × 900), **9 checks each**                                  |
| [Reopen phase](screenshots/2026-09-10-d6-d7-stop-approval/final-reopen/report.json), fresh server and browser | **ok: true** — 4 runs, 2 checks each                                                                                  |
| pageErrors / externalRequestsBlocked / workspaceReloads                                                       | 0 / 0 / 0 in both                                                                                                     |
| Deliberate refusals                                                                                           | exactly **12** while building (two stopped writes and one incomplete approval per case) and **0** on reopen, asserted |
| Real MP4 exports                                                                                              | 8 files, every one measured 1080 × 1920 / 30 fps / 210 frames by `ffprobe`                                            |

Each case, in both a visible-only and a tool-driven path:

1. Builds one synthetic ad with the current element actions.
2. Stops the work — through the visible **Pysäytä työ** in `ui-only`, through
   `studio_update_notebook` in `mixed`.
3. Tries an element write **from the panel and from the agent tool**. Both are refused with the
   Finnish reason and the recorded cause; around each one the source bytes, the source revision and
   the version index (whose bytes carry the undo history) are captured and asserted **deepEqual**.
4. Records an observation while stopped, and asserts the project state did not move — writing things
   down is not a source write.
5. Resumes, and the very next element write succeeds with no reopen and no reload.
6. Freezes a version and prepares a **real** review package (a local render).
7. Tries to approve. Refused, naming all four missing categories and _Tekninen mittaus ei riitä_.
8. Records all four assessments as `test_data`, then approves the version locally.
9. Exports a real MP4. The receipt reads _Hyväksytty versio … ei asiakastuotannon julkaisu_.
10. Changes the source. The approval ages to `stale` with `["source_changed"]`, stays in the list,
    and `currentApproval` becomes null.
11. Exports again. The receipt reads _Luonnos, ei hyväksytty_, and the two exports are asserted to
    carry different source revisions.

The reopen phase then reads the stop history (`stop` then `resume`, both by name and reason) and the
aged approval out of a new server process and a new browser session, and the reopened export receipt
still says _luonnos, ei hyväksytty_.

Screenshots, visually inspected:
[ui-only 1280 stopped](screenshots/2026-09-10-d6-d7-stop-approval/final/ui-only-1280-stopped.png),
[ui-only 1440 stopped](screenshots/2026-09-10-d6-d7-stop-approval/final/ui-only-1440-stopped.png),
[mixed 1280 approval](screenshots/2026-09-10-d6-d7-stop-approval/final/mixed-1280-approval.png),
[mixed 1440 approval](screenshots/2026-09-10-d6-d7-stop-approval/final/mixed-1440-approval.png),
[ui-only 1280 assessments](screenshots/2026-09-10-d6-d7-stop-approval/final/ui-only-1280-assessments.png),
[mixed 1440 reopened](screenshots/2026-09-10-d6-d7-stop-approval/final-reopen/mixed-1440-reopened.png).

### Regressions on the shared harness

Removing the duplication the structure gate flagged moved shared plumbing into
[`ari-notebook-helpers.mjs`](packages/studio/tests/e2e/ari-notebook-helpers.mjs) and the new
[`ari-review-helpers.mjs`](packages/studio/tests/e2e/ari-review-helpers.mjs), which both existing
journeys use. Neither was trusted; both were re-run into their own directories after the refactor:

| Journey                                                                                       | Result                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`ari:test:repair`](screenshots/2026-09-10-d6-d7-stop-approval/repair-regression/report.json) | **ok: true** — 4 runs × 5 checks, 8 deliberate refusals, 0 page errors   |
| [`ari:test:review`](screenshots/2026-09-10-d6-d7-stop-approval/review-regression/report.json) | **ok: true** — 4 runs × 12 checks, 12 deliberate refusals, 0 page errors |

Their original evidence under `screenshots/2026-09-10-d5-repair-limit/` and
`screenshots/2026-09-10-d-review-assessments/` is untouched.

## Findings along the way

- **Two controls called "Jatka työtä".** The first journey attempt clicked the D2 operation-resume
  button instead of the D6 resume. Fixed by giving the stop control an accessible name; kept as
  evidence in [`attempt-1.log`](screenshots/2026-09-10-d6-d7-stop-approval/attempt-1.log).
- **A modal swallows a click.** In `mixed` mode the review dialog was left open before the export,
  and the click on **Vie video** timed out 30 s later with no useful message. The journey now closes
  a dialog only when no dialog is left, and asserts the export button is enabled first
  ([`attempt-3.log`](screenshots/2026-09-10-d6-d7-stop-approval/attempt-3.log)).
- **`a[download]` is not unique.** The frame-evidence panel offers downloads too, so the export
  lookup had to be scoped to `section[aria-label="Videon vienti"]`
  ([`attempt-2.log`](screenshots/2026-09-10-d6-d7-stop-approval/attempt-2.log)).
- **The structure gate did its job again.** The first whole-diff run reported 3 duplicate exports
  (`button`, `controls`, `select` from two e2e helper modules), 4 introduced clone groups and one
  complexity finding. All were removed by moving `textButton` into the shared harness, extracting
  `refusal`, `unchangedAround`, `finishCase` and `reopenedNotebook`, sharing
  `notebookTestProject.ts`, and splitting `setStopped`. No baselines moved and no suppressions were
  added.
- **`packages/studio/data/projects/` filled up again** — 446 throwaway acceptance projects. Removed
  before the runs, as the D5 report predicted it would recur.

## Limits — read these

- **No human test was performed.** Every assessment and every approval these journeys recorded is
  marked `test_data` because a browser journey typed it. Nobody watched any of these videos.
- **Nothing here is a release.** An approval is local, an export is a local draft file, and this
  fork creates no customer approval and publishes nothing.
- The stop reaches exactly as far as the tracked write path does — image imports, binary version
  restores, rich text and legacy animated-position edits stay outside it, the same documented scope
  as [`ARI-NEXT-D-OPERATIONS.md`](ARI-NEXT-D-OPERATIONS.md).
- An operation already past `prepareSourceOperation` finishes; the stop is a gate on the next write.
- A rejection is final for that version id. Move on with a new version.
- `ei sovellu` is the reviewer's own statement. Nothing verifies it, and a silent render still
  leaves the audio assessment missing unless somebody excuses it in writing.
- Stop entries are bounded to the last 200, like the refusal receipts.

## Verification commands

```sh
ARI_OFFLINE=1 ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-d6-d7-stop-approval/server-network-final.jsonl" HYPERFRAMES_NO_TELEMETRY=1 VITE_HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_AUTO_PROXY=false PRODUCER_LOW_MEMORY_MODE=1 PRODUCER_HEADLESS_SHELL_PATH="$PWD/screenshots/2026-09-10-d6-d7-stop-approval/chrome-offline.sh" npx --yes bun run --cwd packages/studio node --import tsx node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3084 --strictPort
ARI_STOP_EVIDENCE=screenshots/2026-09-10-d6-d7-stop-approval/final npx --yes bun run ari:test:stop
# restart the server, then:
ARI_STOP_EVIDENCE=screenshots/2026-09-10-d6-d7-stop-approval/final-reopen ARI_STOP_REOPEN=screenshots/2026-09-10-d6-d7-stop-approval/final/report.json npx --yes bun run ari:test:stop
# restart the server, then the two harness regressions:
ARI_REPAIR_EVIDENCE=screenshots/2026-09-10-d6-d7-stop-approval/repair-regression npx --yes bun run ari:test:repair
ARI_REVIEW_EVIDENCE=screenshots/2026-09-10-d6-d7-stop-approval/review-regression npx --yes bun run ari:test:review
npx --yes bun run --cwd packages/studio-server test src/ari/notebookStop.test.ts src/ari/notebookApproval.test.ts src/ari/repairGate.test.ts
npx --yes bun run --cwd packages/studio-server test src/ari src/routes
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck && npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
xargs npx --yes oxfmt --check < screenshots/2026-09-10-d6-d7-stop-approval/checked-files.txt
xargs npx --yes oxlint < screenshots/2026-09-10-d6-d7-stop-approval/checked-files.txt
npx --yes bun x --no-install fallow audit --base origin/main --fail-on-issues --format json
```
