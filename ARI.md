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
bun run ari:studio --project /absolute/path/to/my-ad --port 3078
```

The launcher registers the directory with a symlink. **Changes save directly into that directory.** Make a copy first for an experiment. The directory needs `index.html`, and its final folder name must contain only letters, digits, `-` or `_`. A conflicting registered name is refused. The server binds to loopback, disables telemetry and automatic media proxying, and uses the local low-memory render setting. The launcher does not load AdForge's environment file or copy credentials.

Git LFS media is optional for the source checkout; the bundled acceptance fixture needs no LFS assets. If Git LFS is not installed, source-only checkout can use:

```sh
git -c filter.lfs.process= -c filter.lfs.smudge=cat -c filter.lfs.required=false clone https://github.com/JariHuomo/hyperframes-ari.git
```

## What changed

- **Large-canvas default.** The original inspector, assets, code editor and timeline return with one “Näytä työkalupaneelit” button. “Kuva isoksi” gives the picture the space back.
- **Ari-ohjaamo.** Visible picture selection and timeline target are listed separately. Explicit time-in-seconds control, actual playhead readout, undo/redo, frame capture, and a clearly labelled auto-record control. Controls are at least 40 px high.
- **Recording off on reload.** Manual placement does not silently become a new keyframe when Studio starts. The existing timeline toggle and Ari's toggle share the same state.
- **One command catalogue.** `window.ariStudio` calls the same twelve implementations registered with WebMCP. It works without a browser extension or an injected test harness. The panel's JSON form uses that same bridge.
- **Visible receipts.** Dispatched, saved, verified, partial and failed outcomes remain distinct. The last command and its actual result appear in the panel. A saved edit is not a creative-quality certificate.
- **Source frame evidence.** “Tarkista ruutukuva” renders a PNG from the saved source, shows its exact time and exposes the image for visual inspection. The live preview is labelled as a preview.
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

## Verification

```sh
bun run ari:test
bun run ari:test:browser
bun run --cwd packages/studio-server test src/helpers/bootstrapGsap.test.ts src/routes/files.test.ts
bun run --cwd packages/studio test:webmcp-edit-loop
bun run --cwd packages/studio typecheck
bun run --cwd packages/studio-server typecheck
```

The Ari browser test starts an isolated local server and project copy, exercises real script calls and visible clicks, checks source bytes and the untouched sibling, captures a source PNG and UI screenshots, undoes the style edit, reloads, and checks the remaining text and auto-record setting. It uses no paid provider. Evidence is written to `screenshots/YYYY-MM-DD/ari-loop/` and excluded from Git because logs contain local filesystem paths.

See [ARI-VALIDATION.md](ARI-VALIDATION.md) for the observed results and remaining findings. These are engineering tests, not an advertising or audio-quality review.

## Next steps toward an autonomous ad maker

1. **Reliable observations.** Add an explicit preview revision/error state and bind image evidence to the exact source revision. The current frame tool waits 150 ms for file watcher invalidation; that is a mitigation, not a revision guarantee.
2. **Precise motion transactions.** Fix and test playhead-to-scene-local time conversion. Upstream `useGsapAnimationOps` currently ignores its passed playhead and starts a new effect at the element's start; inspect the resulting tween and set its position explicitly. Audit loop insertion and existing-keyframe conversion separately before promising arbitrary GSAP round trips.
3. **Durable task runner.** Persist the brief, approved assets/copy, steps, checkpoints, action receipts, revision hashes, screenshots and bounded retries. Run model reasoning outside the editor through a provider adapter with a declared budget. Do not claim autonomous reasoning because a command console exists.
4. **Visual critique loop.** Review beginning/middle/end and every changed boundary, then compare the actual rendered video. Assess the idea, copy, design, motion and sound separately. Geometry checks cannot certify meaning or persuasive quality.
5. **Production handoff.** Connect stable compositions to Ari's factory through versioned templates and its real price/approval/release gates. This standalone fork neither charges AdForge credits nor bypasses customer output reviews.

The intended loop is: brief → script/asset plan → source edit → targeted UI adjustment → source-frame inspection → bounded correction → local render → final review. The first release makes the editing and observation part concrete; planning, model orchestration and automatic quality approval remain future work.
