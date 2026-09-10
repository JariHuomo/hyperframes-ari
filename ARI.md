# Ari Studio

A local HyperFrames fork for an agent that alternates between scripts, visible controls and looking at the rendered picture. The first version is an editing workbench. The reasoning agent runs outside Studio; this fork does not yet turn an arbitrary brief into a finished campaign by itself.

Upstream: [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes), commit `4233b5c6bf349a2d465361f0904cb1a1399f8aea`, package version **0.8.33**, inspected 2026-09-09. Fork: [JariHuomo/hyperframes-ari](https://github.com/JariHuomo/hyperframes-ari). The Apache-2.0 license and upstream attribution are retained. Modified files carry an Ari notice; this document describes the changes.

## Start locally

Requires Node 22+, Bun and a Chromium browser. FFmpeg is required for video exports. No AdForge server, database, account or hosted render service is needed for local editing and rendering.

```sh
bun install --frozen-lockfile
bun run ari:build
bun run ari:studio
```

Without a global Bun installation, replace `bun` at the start of each line with `npx --yes bun` (tested with Bun 1.4.2). This still uses Bun for workspace operations and preserves `bun.lock`.

Open **http://127.0.0.1:3077/#project/ari-sandbox**. The default project is an editable COPY of the repository's two-card regression fixture, not customer ad output. It intentionally has duplicate element IDs in different source files to test correct targeting.

To edit an existing trusted local composition:

```sh
bun run ari:studio --project /absolute/path/to/my-ad --port 3078 --background
```

The launcher resolves an installed Bun even when it is absent from PATH. `--background` starts a detached process, refuses an occupied port and prints its PID/log only after the server responds; omit it to keep the server in the foreground. Logs go to `.ari-studio/<port>.log`. The launcher registers the directory with a symlink. **Changes save directly into that directory.** Make a copy first for an experiment. The directory needs `index.html`, and its final folder name must contain only letters, digits, `-` or `_`. A conflicting registered name is refused. The server binds to loopback, disables telemetry and automatic media proxying, and uses the local low-memory render setting. The launcher does not load AdForge's environment file or copy credentials.

Git LFS media is optional for the source checkout; the bundled acceptance fixture needs no LFS assets. If Git LFS is not installed, source-only checkout can use:

```sh
git -c filter.lfs.process= -c filter.lfs.smudge=cat -c filter.lfs.required=false clone https://github.com/JariHuomo/hyperframes-ari.git
```

## What changed

- **Persistent editing workspace.** Source-aware layers on the left, a large picture, properties on the right and a light timeline below. The original inspector, assets, code editor and full timeline return with “Näytä työkalupaneelit”. “Kuva isoksi” returns to the light workspace without hiding its timeline.
- **Ari-ohjaamo.** An initially open right dock offers text, font size, colour, placement and motion controls; script arguments and technical receipts stay collapsed. Fixed-width top controls reduce moving click targets. One visible selection connects the canvas, layer list, properties and motion bars. Decimal-comma entry, actual playhead readout, undo/redo, frame capture and a labelled auto-record control support direct use. Main controls are at least 40 px high; small timeline handles have numeric alternatives.
- **Recording off on reload.** Manual placement does not silently become a new keyframe when Studio starts. The existing timeline toggle and Ari's toggle share the same state.
- **One command catalogue.** `window.ariStudio` calls the same eighteen implementations registered with WebMCP. It works without a browser extension or an injected test harness. The panel's JSON form uses that same bridge.
- **Visible receipts.** Dispatched, saved, verified, partial and failed outcomes remain distinct. The last command and its actual result appear in the panel. A saved edit is not a creative-quality certificate.
- **Source frame evidence.** “Tarkista ruutukuva” renders a PNG from the saved source, shows its exact time and returns a revision-bound URL for visual inspection. A source change makes an old evidence URL return 409 instead of silently returning different pixels. The signature uses source content and asset metadata, not immutable copies of every binary asset. Save the PNG for durable evidence. The live preview is labelled as a preview.
- **Motion readback.** Add/update/delete/keyframe tools verify the saved source in the live Studio bridge. The receipt returns the new parser id when retiming changes it. Entrance presets bind timing, feel and properties in one save; a drag is one undo step. “Toista liike” stops at the end of the selected tween.
- **Curves as pictures and numbers.** A closed ease contract validates every curve before the write, the Tuntuma selector shows a glyph and a Finnish name, the bezier graph and four control-point fields save one undoable change on pointer-up, and the receipt returns the curve's control points.
- **Two clocks for nested scenes.** A motion inside a sub-composition is shown, added and dragged in master time as well as the scene's own clock, with the placement named explicitly when a scene is hosted more than once. The source always receives scene-local time.
- **Local MP4 export.** The Finnish export panel waits for pending saves and the local render adapter freezes source and asset bytes into a temporary copy. The render metadata retains SHA-256 hashes. Outputs belong to their project, and the download link chooses the newest job by creation time, including after reload. Remote URLs are not frozen; trusted self-contained local projects are the tested path.
- **First-animation bootstrap repair.** `studio-server` now places a newly created GSAP script inside a template-wrapped scene, and removes the scene's static `data-no-timeline` marker. Previously it appended the script outside `</template>`, where composition assembly dropped it. Standalone HTML still puts its script in the body.

The new UI is Finnish. The retained upstream editing panels and tool schemas are still English.

## Script + click + vision loop

Run in the Studio page context, through your browser driver or DevTools:

```js
const studio = window.ariStudio;
const definitions = studio.tools(); // discover current schemas; no eval endpoint
const look = await studio.call("studio_look");
// Pick an exact handle from look.elements after examining the scene.
const handle = look.elements[0].handle;
await studio.call("studio_select", { handle });
const detail = await studio.call("studio_inspect", { handle });
// Check detail.can and textFields before changing this particular element.
const receipt = await studio.call("studio_set_text", {
  handle,
  text: "Your approved headline",
});
if (!receipt.ok) throw new Error(receipt.reason);
const frame = await studio.call("studio_frame", { time: 2 });
// Fetch/view frame.url with a vision-capable driver, then judge the pixels.
```

Do not blindly use the first element in a real task. Inspect the source-file-qualified handle and the visible subject. A person can also pick the target from Ari's list or the canvas. The next script reads that same selection. Source-safe handles keep two identical IDs in different scene files distinct.

After showing or hiding panels, wait for the canvas and selection outline to settle before a coordinate click; the browser test checks stable aligned geometry. Await every command. The bridge refuses overlapping calls, unknown commands and non-object input; upstream handlers validate capabilities, targets and writes. A retained bridge reference becomes unusable after unmount. Disabling `agentToolsEnabled` disables both WebMCP registration and this bridge after reload. The bridge is an in-page control surface for a trusted local authoring environment, not an authentication boundary or a remote shell.

The available tools cover look, select, seek, frame, inspect, text, styles, transforms and adding/updating/deleting animations and keyframes. The native editor and the CLI cover project setup, assets, full source edits, render settings and export. Arbitrary JavaScript should be edited in the source/code editor, not stuffed into JSON tool arguments.

## Curves: the closed ease contract

`packages/studio/src/webmcp/easeContract.ts` is the one gate for every ease string that reaches a source file. `studio_update_animation` used to accept any string, and the receipt compared it to the source by string equality — so `power2.uot` was written, read back unchanged and reported `verified` while GSAP silently fell back to its default curve. `parseEase(input)` now runs **before** the write in both `studio_add_animation` and `studio_update_animation`; an unknown curve is refused with a Finnish reason and `kind: "invalid"`, and nothing is saved.

The vocabulary is mechanical and closed:

| Kind     | Accepted                                                                                                                                                                         | Notes                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `named`  | the 27 `STUDIO_GSAP_EASE_OPTIONS` names (`none`, `power1…power4.in/out/inOut`, `sine.*`, `expo.*`, `circ.*`, `back.in(1.7)`/`out`/`inOut`, `elastic.out(1, 0.45)`, `bounce.out`) | matched whitespace-insensitively, so `elastic.out(1,0.45)` normalises to the canonical spelling                                                          |
| `custom` | `custom(M0,0 C x1,y1 x2,y2 1,1)`                                                                                                                                                 | X control points must be in [0, 1]; Y may overshoot inside Studio's clamp domain (−0.6 … 1.6) and is refused outside it rather than silently pulled back |
| `spring` | `spring(b)`, bounce 0–1                                                                                                                                                          | a bounce outside the range is refused, not clamped to a different spring                                                                                 |
| `wiggle` | `wiggle(n, type[, amplitude])`                                                                                                                                                   | via the core wiggle parser                                                                                                                               |
| `hold`   | `hold`                                                                                                                                                                           |                                                                                                                                                          |

Every branch reuses an existing parser (`resolveEaseCurveTuple`, `parseStudioCustomEaseData`, `parseSpringBounce`, `parseWiggleEase`), because the runtime that has to play the curve is `core/src/runtime/customEase.ts` and a curve this module accepted but that one could not resolve would be a lie.

`parseEase` also **normalises**, which the receipt depends on: the persist paths (`sdkGsapTweenPersist`, `commitMutationSafely`) round decimals, so a cubic that saved perfectly would fail a raw string comparison. `settleAnimationWrite` compares through `easeMatches` on normalised form, and a genuinely different curve still fails.

A `verified` receipt and `studio_inspect` both carry the curve as numbers:

```jsonc
"easeCurve": {
  "kind": "custom",
  "ease": "custom(M0,0 C0.25,0.9 0.4,1 1,1)",
  "points": [0.25, 0.9, 0.4, 1],   // spring → bounce, wiggle → wiggle
  "label": "Mukautettu käyrä"
}
```

A script can therefore read the control points without touching the DOM. Receipt levels are unchanged — `dispatched < saved < verified` — the numbers only enrich a `verified` receipt.

**Keyframe animations use `easeEach`, not `ease`** (the same key `components/editor/AnimationCard.tsx` writes). `studio_update_animation` resolves the owned animation first and routes `ease` to `easeEach` when it has keyframes, so the Ari form and a script both change the feel of a keyframe motion without knowing the key; an explicit `easeEach` on a keyframe-less animation is refused. `studio_inspect` returns `easeEach` beside `ease`.

In the UI, **Tuntuma** shows a `MiniCurveSvg` glyph and a Finnish name, grouped **Tasainen / Pehmeä / Napakka / Palautuva / Jousi / Heilahdus** (`ari/easeCatalog.ts`, covering the upstream `easePresetLibrary.ts` presets; a unit test asserts every offered ease passes the contract, so a preset can never become a button that always fails). The curve panel (`ari/AriEase.tsx`, wrapping upstream `EaseCurveSection`) writes **only on pointer-up** — the serial bridge never sees a pointer-move, so one drag is one undoable change — and the pending row clears on the receipt, never on a timer. A pointer-cancel restores the draft without writing. Four numeric fields carry X1/Y1/X2/Y2 (decimal comma accepted) and leave the panel only on **Tallenna ohjauspisteet**; opening the panel writes nothing, so looking at a named ease cannot rewrite it as a rounded `custom(...)`. Each motion bar on the timeline carries the same glyph.

## Two clocks: scene time and master time

A nested scene has its own clock. The runtime converts with one formula (`core/src/runtime/init.ts`, `seekStandaloneRegisteredTimelines`):

```
local = clamp(playbackStart + max(0, master − hostStart) × playbackRate, 0, sceneDuration)
```

`packages/studio/src/ari/sceneTime.ts` is a pure module that reproduces exactly that from the clip manifest — `resolveSceneInstances(manifest, sourceFile)`, `masterToLocal(instance, t)`, `localToMaster(instance, t)` — chaining the transform through every ancestor (each level's rate multiplies). It invents nothing: a unit test drives the real runtime primitives over the `composition-reliability` fixture and compares, and a second test pins the formula's source text so an edit to the runtime cannot drift silently.

`studio_add_animation`, `studio_update_animation` and `studio_seek` take an optional `timeBasis: "master" | "scene"` — default **scene** for a nested target, **master** for a root one. The tool converts master → local **before** calling the writer, and the receipt reports both clocks:

```jsonc
"scene": {
  "sourceFile": "scenes/headline-card.html",
  "instance": "headline-host-b",
  "instanceLabel": "Headline Card B",
  "instanceIndex": 2, "instanceCount": 2,
  "affectsInstances": 2,
  "timeBasis": "master",
  "localPosition": 0.3, "masterPosition": 5.8,
  "playbackRate": 1.5
}
```

**The wire always carries scene-local time into the source.** A motion belongs to the scene file, which may be hosted more than once, so master time is a _view_ — it only means something through one placement. Writing master time into a shared scene file would be ambiguous by construction. The same asymmetry appears in `studio_seek`: the player has only the master clock, so frame rounding happens in master time and the receipt shows both numbers, making the difference visible instead of hiding it.

The Ari form shows both — `Alkaa kohtauksessa 0,30 s · pääajassa 5,80 s · ×1,5` — and either field may be edited; the other is derived through the selected placement. The timeline draws a nested motion's bar on the master rail through the transform, with a `×1,5` badge when the effective rate is not 1, and a drag converts back before the write (drag 5 → 5,5 s on a scene hosted at 4 s writes 1,5 s). A motion that leaves the host's visible window is drawn clipped with the refusal sentence on its `title`, never silently. In an **opened** scene only local time and the breadcrumb back are shown; the dual display belongs to the master view.

Fit is validated against both the scene's own duration and the host window, `playbackStart` and rate included — for example `liike ei näy pääajassa (kohtaus loppuu 4,00 s)` or `liike alkaa ennen kohtauksen näkyvää alkua (kohtaus alkaa 0,50 s)`.

## Instance selection

`studio_look` gained an output field `scenes[]`, one entry per nested scene **file**; a listed element keys in by its `sourceFile`:

```jsonc
{
  "sourceFile": "scenes/headline-card.html",
  "affectsInstances": 2,
  "instance": null, // the panel's choice; a single placement names itself
  "instances": [
    {
      "hostId": "headline-host-a",
      "label": "Headline Card A",
      "masterStart": 0.12,
      "masterEnd": 5.6,
      "playbackStart": 0,
      "playbackRate": 1,
      "sceneDuration": 5.48,
    },
    {
      "hostId": "headline-host-b",
      "label": "Headline Card B",
      "masterStart": 5.6,
      "masterEnd": 7,
      "playbackStart": 0,
      "playbackRate": 1.5,
      "sceneDuration": 2.1,
    },
  ],
  "unsupported": [],
}
```

`studio_select` accepts and returns the same object plus `instance`. One placement auto-selects. **Several placements require an explicit choice** — the form shows `Kohtaus scenes/headline-card.html · 2 esiintymää · valitse mitä säädät.` and a write without `instance` is refused before anything is written:

```jsonc
{
  "ok": false,
  "kind": "invalid",
  "stage": "refused",
  "reason": "kohtauksella scenes/headline-card.html on 2 esiintymää, joten valitse instance",
  "hint": "Esiintymät: headline-host-a (pääajassa 0,12–5,60 s), headline-host-b (pääajassa 5,60–7,00 s).",
}
```

Because the motion is written to the scene file, it applies to every placement. The form says so (`Muutos koskee kaikkia 2 esiintymää.`) and the receipt carries `affectsInstances: 2`. The panel's chosen instance is UI state only — tools never read it, so a human click cannot redirect an agent's write; a script passes `instance` explicitly.

A host whose start, duration, `playbackStart` or `playbackRate` the manifest cannot give as a number (an unresolved expression) is reported in `unsupported[]` with its reason and the level that refused. Refusal is a state, not an error: that placement keeps offering **Avaa kohtaus** and its own local timeline, and it is never given a `0` fallback.

## Tool fields added this sprint

Sprint 3 retained the original **12** names and grew their schemas. A1–A2 adds six project/media tools, and later batches add scene, refresh, notebook, review-package and review-assessment tools (36 total); the original names remain compatible.

| Tool                      | New input                                                           | New output                                                                                 |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `studio_look`             | —                                                                   | `scenes[]` (above)                                                                         |
| `studio_select`           | `instance`                                                          | `scene { …, instance }`                                                                    |
| `studio_seek`             | `timeBasis`, `instance`                                             | `scene { sourceFile, instance, localPosition, masterPosition }` when an instance was named |
| `studio_add_animation`    | `timeBasis`, `instance`; `ease` is now the full contract vocabulary | `scene { … }`, `affectsInstances`, `easeCurve`                                             |
| `studio_update_animation` | `timeBasis`, `instance`, `easeEach`                                 | `scene { … }`, `affectsInstances`, `easeCurve`                                             |
| `studio_inspect`          | —                                                                   | `easeCurve`, `easeEach` per animation                                                      |
| `studio_frame`            | `animationId` + `samples: [0.25, 0.5, 0.75]`, `instance`            | `frames[]` of `{ url, time, progress, sourceRevision }`                                    |

`studio_frame` with `samples` captures several instants inside one animation's own span in a single call — the timings come from the **saved source**, not the live preview, and if the frames do not all share one revision the call fails rather than returning a "comparison" of two compositions. `url`/`time` mirror the first sample, so every existing single-frame caller is untouched. For nested motions, pass `instance`; the samples are converted to master time, including the playback rate. The panel forwards its selected occurrence. In the panel, **Vertaa edelliseen** opens the frozen-version selector described below. It no longer replays the current motion twice.

### Script example: a motion in master time, then its curve

Run in the Studio page context with `examples/rajamarket-scenes` open. The headline card is hosted twice — at 0,12 s at rate 1 and at 5,60 s at rate 1,5 — so the placement has to be named.

```js
const studio = window.ariStudio;

const look = await studio.call("studio_look");
const scene = look.scenes.find((s) => s.sourceFile === "scenes/headline-card.html");
// scene.affectsInstances === 2 → never guess; pick the placement by its master window.
const placement = scene.instances.find((i) => i.masterStart >= 5.6);
const handle = look.elements.find(
  (e) => e.sourceFile === scene.sourceFile && e.handle.endsWith(":headline-card-offer"),
).handle;

await studio.call("studio_select", { handle, instance: placement.hostId });

// Master time 5,8 s on a placement hosted at 5,60 s → scene-local 0,3 s in the source.
const added = await studio.call("studio_add_animation", {
  handle,
  method: "from",
  preset: "fade",
  position: 5.8,
  timeBasis: "master",
  instance: placement.hostId,
  duration: 0.9,
  ease: "power2.out",
});
if (!added.ok || added.stage !== "verified") throw new Error(JSON.stringify(added));
// added.scene → { localPosition: 0.3, masterPosition: 5.8, playbackRate: 1.5, instance: "headline-host-b" }
// added.affectsInstances → 2   (the write lands in the scene file, so both placements move)

const eased = await studio.call("studio_update_animation", {
  handle,
  animationId: added.animationId,
  instance: placement.hostId,
  ease: "custom(M0,0 C0.25,0.9 0.4,1 1,1)",
});
if (!eased.ok) throw new Error(eased.reason); // an unknown curve is refused before the write
// eased.easeCurve → { kind: "custom", points: [0.25, 0.9, 0.4, 1], label: "Mukautettu käyrä" }

const detail = await studio.call("studio_inspect", { handle });
const motion = detail.animations.find((a) => a.animationId === added.animationId);
console.log(motion.easeCurve.points, motion.easeEach);

const shots = await studio.call("studio_frame", {
  animationId: added.animationId,
  instance: placement.hostId,
  samples: [0.25, 0.5, 0.75],
});
// shots.frames[] → three revision-bound PNGs from inside the motion; view them and judge the curve.
```

## How HyperFrames works

| Layer                                                | Responsibility                                                                | Why it matters for autonomous work                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Composition HTML + CSS + media                       | Source of truth; `data-*` timing and stable element addresses                 | Scripts and clicks must save to the same files.                                             |
| `packages/parsers`, `packages/lint`, `packages/core` | Parse/patch source, assemble sub-compositions, validate and supply runtime    | Textual success is insufficient: template placement and timeline identity affect rendering. |
| Runtime adapters                                     | Seek GSAP, CSS, WAAPI, Lottie, Three.js and other supported animation systems | A frame must be reproducible at a specified time, independent of wall-clock playback.       |
| `packages/player`                                    | Embeddable player with an iframe                                              | Composition content lives inside its shadow-root iframe.                                    |
| `packages/studio`                                    | React/Vite editor, shared selection, undo, preview and controls               | Editor overlays live outside the composition, so they are excluded from export.             |
| `packages/studio-server`                             | Project/file mutations, version checks and preview/capture endpoints          | Reuse its persistence and conflict handling; do not create a second saver.                  |
| `packages/sdk` and `packages/cli`                    | Programmatic authoring and local command-line workflows                       | Good for structural edits, validation and batch work.                                       |
| `packages/engine` and `packages/producer`            | Chromium frame capture, encoding and audio assembly with FFmpeg               | Judge the exported source frames/video, not only editor screenshots.                        |

The 0.8.30 browser experiment in the AdForge workspace was useful evidence, but is not a description of every current bug: upstream 0.8.33 already has source-qualified handles, coordinated writes, twelve WebMCP tools, and a player error surface. This fork extends those seams rather than replacing the renderer.

## New projects and copied images (A1–A2)

Open **Uusi mainos / aineisto**. **Uusi mainos** offers a blank content scaffold (background with a soft entrance) or a product/message/CTA scaffold; both are silent 7 s 1080×1920 projects with a working local GSAP timeline. **Tarkista tiedot** shows the name, duration and actual save location before **Luo mainos**. Existing directories are refused. GSAP, MotionPathPlugin and fonts are copied from installed workspace dependencies; the templates need no CDN or font fetch.

**Aineisto → Valitse kuvat** copies PNG/JPEG/WebP into the active project and displays a thumbnail shelf. Limits are 8 MiB and 16 MP per image, at most 20 selected images, one decode at a time and a 10 s decode timeout. Magic bytes, extension, full decode and symlink/path containment are checked on the server. Rejected files keep their own reasons; other successful imports survive. Closing and reopening the project does not depend on the original selected files. Placing these shelf images into a scene is A3 work.

The same services are discoverable through:

| Tool                     | Result / purpose                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `studio_projects`        | Projects and host-owned creation options                                                                                      |
| `studio_prepare_project` | Read-only name/template proposal with the exact `project.dir`                                                                 |
| `studio_create_project`  | Requires proposal name, template and `location: project.dir`; returns saved file versions and a manifest version              |
| `studio_open_project`    | Opens an id from the project list or creation receipt                                                                         |
| `studio_import_images`   | Selected `{ name, base64 }` byte objects; per-file outcomes, copied paths, checksums and versions; no server filesystem paths |
| `studio_images`          | Verified copied-image shelf for the active project                                                                            |

No successful import means `ok: false`, `stage: "not_saved"`; a mixed batch has `partial: true`. Completed imports survive cancellation, and the remaining batch stops. Creation/import is available in the local Vite host; hosts without an approved creation root refuse creation. The report and A3–A5 source transaction contract are in [ARI-NEXT-A1-A2.md](ARI-NEXT-A1-A2.md).

```sh
# Two terminals, both foreground; no provider calls in the final acceptance path.
npx --yes bun run ari:studio --port 3084
npx --yes bun run ari:test:authoring
# Recreate and measure the portable synthetic image fixtures:
npx --yes bun run ari:measure:images
```

`ari:test:authoring` runs headed UI-only and mixed paths at 1280×800 and 1440×900 against that server. It uses the versionable synthetic fixtures, checks real source/asset bytes, deletes disposable original copies, and reopens each project. It does not yet claim the A5 finished-ad/export comparison or human UX testing.

## Verification

```sh
bun run ari:test
bun run ari:test:browser
bun run ari:test:motion # recreates the dedicated RajaMarket test copy
bun run ari:test:scenes # curves + nested-scene time; ARI_UI_ONLY=1 ARI_HEADED=1 for the visible click-through
bun run --cwd packages/studio-server test src/helpers/bootstrapGsap.test.ts src/routes/files.test.ts
bun run --cwd packages/studio test:webmcp-edit-loop
bun run --cwd packages/studio typecheck
bun run --cwd packages/studio-server typecheck
```

`ari:test:scenes` copies the tracked, synthetic `packages/studio/tests/e2e/fixtures/ari-scenes` (plus GSAP from the workspace dependency) into a throwaway `examples/rajamarket-scenes-e2e` at the start of every run, drives the whole curve and nested-time flow at 1440×900 and 1280×800, exports an MP4 and measures the two headline placements out of its frames. It runs in two modes — the default mixed mode (bridge calls plus clicks) and `ARI_UI_ONLY=1`, where every step goes through visible controls — and both must end with byte-identical scene sources. Cold-start recovery reloads are disabled by default; `ARI_WORKSPACE_RELOADS` is a diagnostic override, not an acceptance shortcut. `ARI_SCENES_FIXTURE` can select another local fixture. The test includes nested-curve edits and verifies frame samples on the selected occurrence, the 0.9 s entrance endpoint, and held headlines at 3.5/6.9 s.

The Ari browser test starts an isolated local server and project copy, exercises real script calls and visible clicks, checks source bytes and the untouched sibling, captures a source PNG and UI screenshots, undoes the style edit, reloads, and checks the remaining text and auto-record setting. It uses no paid provider. Evidence is written to `screenshots/YYYY-MM-DD/ari-loop/` and excluded from Git because logs contain local filesystem paths.

See the delivered own-agent workflow, final video and latest tests in [ARI-SPRINT-EASY-MOTION.md](ARI-SPRINT-EASY-MOTION.md). The motion test requires the local RajaMarket prototype assets from the preceding UAT; it recreates `examples/rajamarket-sprint-mixed`, so use another copy for durable work. The curves and nested-scene-time sprint, with its UAT evidence, is [ARI-SPRINT-SCENES-CURVES.md](ARI-SPRINT-SCENES-CURVES.md). See the preceding ad workflow in [ARI-UAT-RAJAMARKET.md](ARI-UAT-RAJAMARKET.md), and [ARI-VALIDATION.md](ARI-VALIDATION.md) for the observed results and remaining findings. These are engineering tests, not an advertising or audio-quality review.

## Frozen version comparison (B3–B5)

**Versiot / vertailu** opens named checkpoints and the project history. **Tallenna tarkistusversio** waits for pending source writes and saves the local source/dependency manifest. Select **Edellinen versio** and **Nykyinen versio**, then **Avaa vertailu**. Both pictures use the same aspect ratio and a shared clock from zero to the shorter version's duration; different aspect ratios refuse. **Säilytä muutos** closes without writing. **Palauta edellinen** is a separate, single undoable source restore, bound to the active revision captured when comparison opened. A later edit refuses restoration until comparison is reopened.

The viewer compiles checked frozen bytes in a disposable local directory. It inlines dependencies, uses an opaque-origin `sandbox="allow-scripts"` iframe and a restrictive content policy: no network connections, forms, child frames or access to Studio's document. Playback uses the bundled HyperFrames runtime; no live-project URL supplies a missing asset. Missing/corrupt/deleted checkpoints refuse before playback. Runtime resource violations hide the affected picture and show an error. The viewport scales without overwriting authored element transforms. The current supported entry is `index.html`, with the dependency contract in [the storage report](ARI-NEXT-B-VERSION-STORE.md); dynamic loaders are not a supported replay path.

| Tool                      | Contract                                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studio_versions`         | List frozen IDs, names, manifests and the active source revision.                                                                                                                                                          |
| `studio_save_version`     | `{ name }` saves a named checkpoint; returns its exact ID and revision.                                                                                                                                                    |
| `studio_compare_versions` | `{ beforeId, afterId }` opens two checked versions; receipt includes IDs, shared duration and active revision.                                                                                                             |
| `studio_comparison`       | `{ action: "seek", time }`, `play`, `pause`, `keep` or `restore`. Restore returns `restoredFrom`, `revision`, `paths`, `stage: "saved"` and `previewReady`. A preview failure never rewrites this as a failed source save. |

```js
const saved = await ariStudio.call("studio_save_version", { name: "Lähtökohta" });
// Make an edit through Studio's visible controls or its editing tools.
const next = await ariStudio.call("studio_save_version", { name: "Uusi versio" });
await ariStudio.call("studio_compare_versions", {
  beforeId: saved.version.id,
  afterId: next.version.id,
});
await ariStudio.call("studio_comparison", { action: "seek", time: 1 });
await ariStudio.call("studio_comparison", { action: "keep" });
```

`npx --yes bun run ari:test:comparison` runs the headed two-size UI-only/mixed acceptance. The `reopen` phase runs against a fresh server using the preceding report. [Implementation, exact commands and evidence](ARI-NEXT-B-COMPARISON.md). These are local automation checks, not a human UX study or release approval.

## Project notebook (D1/D3)

**Muistikirja** opens the project's durable goal, agreed copy, selected image references, manual **Tehty / Kesken / Seuraavaksi** tasks and observations. **Päivitä tilanne** reloads a conflicting notebook while preserving the draft. It does not refresh or replace the ad's undo stack.

Discover `studio_notebook` and `studio_update_notebook` in the current 36-tool registry. The read returns a notebook token and source revision; every update binds `expectedToken`. Observations additionally bind the read source revision and declare author, author type and coverage. A technical check is explicitly labelled **Tekninen tarkistus**. Older observations remain recorded and show **Aiemman version havainto** after reading a changed source.

```js
const book = await window.ariStudio.call("studio_notebook");
if (!book.ok) throw new Error(book.reason);
const receipt = await window.ariStudio.call("studio_update_notebook", {
  action: "brief",
  expectedToken: book.token,
  goal: "Näytä tuote selkeästi.",
  texts: "Pieni tauko.",
});
if (!receipt.ok) throw new Error(receipt.reason);
// receipt.stage === "notebook_saved"; sourceChanged === false
```

The notebook lives in `.ari-notebook/notebook.json`, outside export/version inputs and source-change broadcasts. A manual completed task does not prove a source write. Actual source-operation receipts now live in a separate durable journal. **Jatka työtä** / `studio_resume_work` resolves them without repeating writes; uncertainty refuses replay. Element/scene operations, ordinary text/style and supported motion edits share the tracked source path. Rich text, imports, binary restores and legacy animated-position edits remain outside that scope. See [supported operations, protocol and evidence](ARI-NEXT-D-OPERATIONS.md). D4 is partial (see below) and D5–D7 remain open. [Interface, limits and actual evidence](ARI-NEXT-D-NOTEBOOK.md). `ari:test:notebook` runs both visible paths at both viewport sizes; its separate reopen phase uses a fresh server and browser.

## Next steps toward an autonomous ad maker

1. **Reliable observations.** Evidence is now bound to the project signature and rejects watcher/render races. The retained 150 ms wait is only scheduling mitigation. The source-frame panel now marks old evidence stale, and MP4 export has isolated asset snapshots. A visible live-preview revision and a permanent revision archive remain future work.
2. **Precise motion transactions.** New effects now use the passed playhead on the currently open source timeline, with a one-second default duration. Master-to-nested-source insertion now converts through the runtime's own formula when the placement is unambiguous or named, and still refuses with an instruction to open the scene when it is not. Speed-ramped and trimmed scenes remain future work. Motion receipts now perform source readback; visual verification remains separate. Audit loop insertion and existing-keyframe conversion separately before promising arbitrary GSAP round trips.
3. **Durable task runner.** The notebook now persists the brief, selected asset checksums, agreed copy, manual tasks and attributed observations. Verified source-operation receipts and read-only resumption are available for the documented source paths. Review packages and bounded correction rounds remain future work. Run model reasoning outside the editor through a provider adapter with a declared budget. Do not claim autonomous reasoning because a command console exists.
4. **Visual critique loop.** Review beginning/middle/end and every changed boundary, then compare the actual rendered video. Assess the idea, copy, design, motion and sound separately. Geometry checks cannot certify meaning or persuasive quality.
5. **Production handoff.** Connect stable compositions to Ari's factory through versioned templates and its real price/approval/release gates. This standalone fork neither charges AdForge credits nor bypasses customer output reviews.

The intended loop is: brief → script/asset plan → source edit → targeted UI adjustment → source-frame inspection → bounded correction → local render → final review. The first release makes the editing and observation part concrete; planning, model orchestration and automatic quality approval remain future work.

## Sprint 3 closeout

See [ARI-SPRINT-FINAL-UX.md](ARI-SPRINT-FINAL-UX.md) for the follow-up dispositions, reproducible UX evidence, new RajaMarket prototype, and the prioritized next sprint. Ari's layer shelf includes timed-hidden elements; source reload and minted IDs preserve the exact selection. Curve-only edits validate the owned motion span, not the current playhead.

## Review packages and assessments (D4)

The **Tarkistus** section's **Tarkistuspaketti** prepares and shows one frozen version's review material: the whole MP4, its first and last frame, and the before/at/after frames around every changed motion boundary against a chosen previous frozen version. Choose the version and the optional comparison version, press **Valmistele tarkistuspaketti**, and the state line reports _kesken_, _valmis_ or _epäonnistui_. Preparation renders locally and takes about as long as an export; a failed attempt publishes nothing and can be repeated. Every boundary is labelled with the version and time it came from, an out-of-video frame says so instead of vanishing, and the coverage sentence names exactly what was and was not sampled.

The panel says in Finnish that a prepared package is material to look at — **its completion is not evidence that anyone watched the video, and it is not a quality approval.**

Below it, **Arviot** records what a named reviewer actually said, in four separate categories: **viesti, ulkoasu, liike, ääni**. Each row carries the reviewer, the reviewer type (_Ihmisen kirjaama_, _Ulkoisen agentin kirjaama_, _Testiaineisto_), the time, the package and frozen version it looked at, and the coverage the reviewer declared — whether the whole video was watched and which boundaries were inspected. A category nobody assessed reads **puuttuu** and says so: a missing assessment is never an approval. The technical measurement sits in its own line and never fills a category; a render with no audio stream reports that as a measurement and **leaves the audio assessment missing**. After a real source edit an older assessment stays in history and is shown **vanhentunut** with its reason. Recording an assessment writes only the project notebook — no source revision, no version index, no undo stack — and is still not a release approval; that is D7.

Discover `studio_prepare_review_package`, `studio_list_review_packages`, `studio_read_review_package`, `studio_record_review_assessment` and `studio_read_review_assessments` in the current 36-tool registry. They call the same service the visible path uses, and every read returns the server-verified manifest plus `assetUrls` into the confined package route; nothing else in the package directory is served.

```js
const versions = await window.ariStudio.call("studio_versions");
const [before, after] = versions.versions.slice(-2);
const prepared = await window.ariStudio.call("studio_prepare_review_package", {
  versionId: after.id,
  previousVersionId: before.id,
});
if (!prepared.ok) throw new Error(prepared.reason);
// prepared.package.coverage === "changed-motion-boundaries"
// prepared.viewed === false; prepared.approved === false
// prepared.assetUrls.video → /api/ari/projects/<id>/review/<pkg>/asset?path=video.mp4

const before = await window.ariStudio.call("studio_read_review_assessments");
// before.packages[0].categories → four rows, every status "missing"
const recorded = await window.ariStudio.call("studio_record_review_assessment", {
  packageId: prepared.package.id,
  expectedToken: before.token, // conditional: a concurrent reviewer's row is never lost
  category: "motion",
  reviewer: "Jari",
  reviewerType: "human", // there is no "technical": a measurement is not a judgement
  verdict: "fix",
  text: "Otsikko lähtee liikkeelle ennen taustaa.",
  wholeVideoWatched: true,
  checkedBoundaries: "all", // or indexes into prepared.package.boundaries
});
// recorded.approved === false — an assessment is an opinion, not a release
// recorded.packages[0].categories.at(-1) → { category: "audio", status: "missing" }
```

Preparation changes no source revision, no version index and no undo stack, and a published package keeps working after its own frozen version loses a dependency. `ari:test:review` runs the visible and mixed paths at both viewport sizes, records three categories, leaves audio alone, edits the source and checks that every recorded assessment ages without being lost; its `reopen` phase re-reads the same packages and assessments from a fresh server and browser. [Interface, limits and actual evidence](ARI-NEXT-D-REVIEW-PACKAGE.md). D5–D7 remain open, and nothing here claims a human watched anything.

## Repair rounds and approved copy (D5)

**Muistikirja › Hyväksytty sisältö ja korjauskierrokset** is where the ad's owner decides two things: how many repair rounds one task may spend (product default **two**, changeable per project), and which agreed sentences are locked. Both are enforced on the shared write path, not on a button: `prepareSourceOperation` refuses **before** the intent is published, so the visible controls and the agent tools meet exactly the same refusal.

- A tracked source write consumes a repair round only while a task is named in **Korjauskierroksia käyttävä tehtävä**. Rounds are one file per consumed round under `.ari-notebook/repairs/`, so the count survives a restart with no cache.
- When the rounds run out the refusal names the task, the count, the recorded **jäljellä oleva puute** and the **seuraava ehdotus**, and says the decision is yours: `Päätä jatkosta itse; automaattista jatkoa ei ole.` There is no automatic continuation and no model call anywhere in this path.
- A lock is compared **mechanically**: the exact agreed string with whitespace normalised. A write is refused when it lowers that string's occurrence count in any file it touches; a task may be given an explicit mandate over one named lock, and only that lock.
- A refusal writes nothing: no source byte, no version index entry, no undo entry. It leaves a receipt in `.ari-notebook/refusals.json`, listed under **Torjutut muutokset** and returned by `studio_notebook`.
- The protection reaches exactly as far as the tracked write path does. Image imports, binary version restores, rich text and legacy animated-position edits stay outside it, and the panel says so.

```js
const book = await window.ariStudio.call("studio_notebook");
const task = book.notebook.tasks[0];
await window.ariStudio.call("studio_update_notebook", {
  action: "lock",
  expectedToken: book.token,
  label: "Pääviesti",
  text: "Pieni tauko.",
});
const active = await window.ariStudio.call("studio_notebook");
await window.ariStudio.call("studio_update_notebook", {
  action: "active_repair",
  expectedToken: active.token,
  id: task.id,
});
// active.repair → { limit: 2, activeTaskId, tasks: [{ id, used, exhausted, remaining, suggestion }], refusals: [] }
// A third round, or any edit dropping "Pieni tauko.", now fails with a Finnish reason.
```

The registry still holds **36** tool names: `studio_update_notebook` gained the `repair_limit`, `active_repair`, `repair_plan`, `lock`, `unlock` and `authority` actions rather than six new tools. `ari:test:repair` runs the visible and mixed paths at both viewport sizes and its `reopen` phase re-checks the counter and the locks from a fresh server and browser. [Interface, limits and actual evidence](ARI-NEXT-D5-D7.md).

## Stopping the work and approving a version locally (D6–D7)

**Muistikirja › Työn pysäytys** stops the work, and **Muistikirja › Version hyväksyntä** decides
about one frozen version. Both are notebook facts, and both are enforced where it counts.

- **Pysäytä työ** records who stopped it, when and why. `assertOperationAllowed` then refuses the
  **next** tracked source write with that Finnish reason — from the panel and from the agent tools
  alike — and leaves a receipt beside the D5 refusals. Nothing else moves: no source byte, no
  version index entry, no undo entry.
- An operation whose intent was already published is **written to completion**, so a save never
  ends half-way. Its bytes live in that immutable intent and its writes are conditional; tearing it
  down would orphan the intent and leave `Jatka työtä` reporting it as uncertain for good. The stop
  is a gate on the next write, not a kill switch on the current one.
- The notebook, its observations, the assessments and the approvals stay writable while stopped —
  they are not source writes, and the panel says so. **Jatka työtä** in the stop block releases the
  write path with no reopen and no reload; its accessible name is _Jatka pysäytettyä työtä_, because
  the operation-resume control above it is also called _Jatka työtä_.
- **Hyväksy versio paikallisesti** binds `versionId`, the review package id, the package's source
  revision, a named decider and a non-technical role (`human`, `external_agent` or `test_data`).
  Approving requires a review package that still reads and a stated position on **all four**
  assessment categories: an assessment, or an explicit _ei sovellu_ with a reason. A technical
  measurement never fills one, so a silent render can never approve itself.
- **Hylkää versio** needs neither a package nor assessments. A rejected version stays rejected —
  move on with a new version.
- A later source change ages the approval through the same `source_changed` rule the assessments
  use: it is shown as **Vanhentunut** with its reason and stays in history.
- A local MP4 export is **always** allowed. What changes is what the receipt calls it: _Hyväksytty
  versio_ when the exported revision carries a standing approval, _Luonnos, ei hyväksytty_
  otherwise. Either way it says the file is a local draft and **not a customer release**. This fork
  creates no customer approval and publishes nothing.

The registry still holds **36** tool names. `studio_update_notebook` gained the `stop_work`,
`resume_work` and `approval` actions, and `studio_notebook` now returns `repair.stop`,
`repair.stopHistory`, `approvals`, `currentApproval`, `approvedRevisions` and `export`.

```js
const book = await window.ariStudio.call("studio_notebook");
await window.ariStudio.call("studio_update_notebook", {
  action: "stop_work",
  expectedToken: book.token,
  by: "Ulkoinen agentti",
  byType: "external_agent",
  reason: "Odotetaan asiakkaan hintaa",
});
// Every tracked source write now fails with "Työ on pysäytetty: …".
const stopped = await window.ariStudio.call("studio_notebook");
await window.ariStudio.call("studio_update_notebook", {
  action: "resume_work",
  expectedToken: stopped.token,
  by: "Ulkoinen agentti",
  byType: "external_agent",
  reason: "Hinta saatu",
});
const ready = await window.ariStudio.call("studio_notebook");
const decision = await window.ariStudio.call("studio_update_notebook", {
  action: "approval",
  expectedToken: ready.token,
  versionId,
  packageId,
  decision: "approved",
  approver: "Ulkoinen agentti",
  approverType: "external_agent",
  note: "Katsoin koko videon ja molemmat rajat.",
  notApplicable: [{ category: "audio", reason: "Mainoksessa ei ole ääntä." }],
});
// decision.currentApproval → the standing approval, or null
// decision.export → { revision, approved, release: "local_draft", note }
```

`ari:test:stop` runs the visible and mixed paths at both viewport sizes, and its `reopen` phase
re-reads the stop history and the aged approval from a fresh server and browser.
[Interface, limits and actual evidence](ARI-NEXT-D5-D7.md). **No human test was performed.**
