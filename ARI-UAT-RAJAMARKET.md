# RajaMarket / Ari Studio UAT — 2026-09-09

Result: the standalone script → visible edit → source evidence → export → visual correction loop works on an actual seven-second ad composition. This is an engineering prototype, not released customer output or an autonomous campaign agent. Changes are local in the fork; no public push was made in this task.

## Deliverable and inputs

- Studio: http://127.0.0.1:3078/#project/rajamarket-uat (detached local server).
- Source: `examples/rajamarket-uat/index.html`; provenance, asset hashes and frozen offer are beside it. This local examples directory is excluded by the existing Git ignore rule.
- Final: `examples/rajamarket-uat/renders/RajaMarket-Kuusi-mukaan-v2-PROTOTYYPPI.mp4`.
- H.264, 1080×1920, 30 fps, 210 frames, 7.000 seconds, 1,825,923 bytes, no audio stream.
- MP4 SHA-256: `794edd38f1c21ecfded4f46984c6265e198d0799e53f8a0d578d48d378e2ba99`.
- HTML SHA-256: `806646f4c1364f7da80c3c6dfc016ea98d2cfa8806d4c40b3c607989b98843cb`.
- Existing local RajaMarket logo/product photograph, frozen leaflet checked 6 September: six KitKat packs / 3 €, Leiri, through 9 September 2026 or while stocks last. Current availability was not re-verified. Visible PROTOTYYPPI remains.
- Vendor spend **USD 0**; customer credits **0**. No provider calls, external uploads or release gates opened.

## Actual browser UAT

The composition was constructed in source, then operated through Chrome with visible Studio controls. This deliberately tests the requested mix of scripting and clicking.

| Task                      | Observed result                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Launch without global Bun | Installed Bun resolved; nested scripts work; detached process survives launcher exit. Occupied port refused.                           |
| Select and edit headline  | Target list → ordinary text field → “Kuusi mukaan.”; exact file change confirmed.                                                      |
| Edit CTA                  | Ordinary field → “Katso Leirin tarjoukset”; file and exported picture agree.                                                           |
| Add animation at playhead | Site selected, seek 2.6 s, Lisää liike → source tween position 2.6 (not element start).                                                |
| Adjust duration           | Script form → 0.45 s; inspect and source confirm end 3.05 s.                                                                           |
| Undo / redo               | Duration returns to 1 s, then 0.45 s. No lost copy.                                                                                    |
| Reload                    | Copy and motion survive, recording remains off; time input now matches playhead.                                                       |
| Saved frame               | Source PNG at 4 s succeeds with revision. An older bound URL returns HTTP 409 after source changes.                                    |
| Export                    | Actual Export panel completes two local renders; final High Quality/30 fps output opened in browser and validated on disk.             |
| Download button           | Click attempted on first render; browser filesystem persistence was not established. MP4 delivery uses the verified local render file. |

The original expanded top panel reduced the portrait to roughly 180×320 at the tested viewport. Moving tools to a right dock yields roughly 360×640 while editing. Headline editing needs no JSON. The native export/timeline panels remain English, and motion changes still use the script form.

## Fixes made

1. Resolve Bun and its companion PATH; optional detached launch with readiness/port check and local logs.
2. Bind source frame URLs to the captured project revision; refuse stale cache, changed source during rendering and mismatched repeat requests.
3. Respect the current open-source playhead on animation insertion. Cross-source insertion deliberately refuses until the scene is opened on its own timeline.
4. Right-side dock, plain text editor, collapsed technical details, fixed-width top controls and synchronized time input.
5. Regression coverage for the above data boundaries and the real plain-text browser loop.

## Verification

- 282 unique unit tests passed: Ari suite 253; targeted playhead/frame URL tests 8; thumbnail server tests 21.
- Ari browser regression passed including source persistence, sibling isolation, selection, plain text edit, preserved canvas height, revision URL, undo and reload.
- Studio and studio-server type checks passed; both builds passed. Changed JS/TS formatting and lint passed with no lint warnings/errors.
- Final composition check: runtime/layout/motion/contrast all zero errors; 141 motion sample times; 48/48 text contrast samples. One expected lint warning: six identical SKU image sources intentionally share clip timing.
- Existing build chunk/import warnings and occasional Vitest shutdown timeout remain; test processes returned success. Full monorepo suite was not run.

## Video and editorial review

First export review stopped after finding a CTA color-interpolation contrast dip around 2.65 s and small conditions. Corrected the CTA to switch text/fill together at 2.6 s with a small scale settle, increased conditions from 24 to 36 px, then exported again.

Final MP4 reviewed chronologically at 20 fps: all 140 extracted frames across 14 pages, 0–6.95 s. Also all native 30 fps frames in 0–0.2 s and 6.8–7 s, plus 2.5667–3 s around the changed CTA. Final frame inspected at full size. Review ledgers have no pending pages. This is frame-sequence self-review, not independent certification; audio is absent.

- **Copy:** direct, natural quantity-led Finnish; product, price and six-unit quantity agree. Dated stock condition retained. The CTA is contextual, but an actual destination/campaign offer would need current verification before release.
- **Visual message:** six persistent packs spread from one stack into two columns of three. The movement explains quantity. Opening has ample empty space; final hold is intentionally static for reading.
- **Technical finish:** no observed blank opening/tail, copy clipping or premature fade in reviewed samples. Corrected CTA retains contrast through its transition. A thin white bottom strip remains part of this prototype; social-platform overlays and alternate aspect ratios were not validated.

Opinion: usable now as a hybrid editing workbench. The side dock and plain text form are substantive UX improvements. It still needs a durable task runner and simpler motion controls before it deserves “autonomous ad maker”.

## Remaining work

- Global-to-local timing for nested scenes; currently refused rather than guessed.
- Motion controls with visible start/duration/easing fields; animation receipts currently say dispatched, so inspect/source evidence is still necessary.
- Compact timeline in large-canvas mode; full native timeline still consumes substantial height when opened.
- Immutable source/media snapshots for archival proof, plus explicit preview revision state.
- Reliable browser download completion evidence, English native panel copy, and small-screen responsiveness.
- Persist brief/assets/steps/review history and bounded retries outside the editor; production integration must use Ari’s real approval and release gates.

Evidence directory: `/Users/jarihuomo/Documents/GitHub/adforge/screenshots/2026-09-09-ari-rajamarket-uat/`. Screenshots, final composition check and frame-review ledgers are stored there.
