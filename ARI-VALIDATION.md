# Ari Studio verification — 2026-09-09

Base: HyperFrames 0.8.33, `4233b5c6bf349a2d465361f0904cb1a1399f8aea`.

## Passed

- Final full workspace build (`bun run ari:build`). The existing bundle-size warnings remain.
- Studio and studio-server TypeScript checks.
- Targeted Oxlint: no errors or warnings.

- 252 focused Studio unit tests: bridge concurrency/refusal/revocation, existing WebMCP handlers, player store and recording toolbar.
- 79 server tests: template and standalone GSAP bootstrap, escaping, and the existing file mutation suite.
- The Ari browser acceptance test, using the actual `window.ariStudio` bridge without an injected WebMCP harness: all twelve tools; script text edit; visible form and click for a style edit; saved-source PNG; stable aligned selection geometry after enlarging the canvas; visible undo; reload persistence; recording off; native Inspector revealing the hidden panels. No page errors.
- The upstream WebMCP browser regression, adapted for the fork's initial focus mode and asynchronous preview reload: source-qualified duplicate targets; live text/style/transform/animation pixel changes; saved-source PNG and thumbnail revisions; unchanged sibling source; history and source persistence on reload; disabled agent-tool preference.
- Visual inspection of the control panel, enlarged canvas and saved-source image. The selection outline aligns with the text after layout settles.

The Ari source-frame PNG SHA-256 was `c5afe42803e7fe6b9c4e332ea22597747c28bd03c2e89375098351aa0300c083`. Local evidence is in `screenshots/2026-09-09/ari-loop/` and `screenshots/2026-09-09/upstream-loop-passed/`.

## Findings and limits

The upstream Vite regression logged four expected 404s for the optional CLI-only FFmpeg environment probe; its report records this existing allowed warning. The Ari browser run had no page errors.

The first upstream browser runs exposed an actual bootstrap defect: new GSAP scripts were appended outside a scene template and discarded during assembly. The server fix is covered by unit tests and the passing animation browser proof. The regression also assumed an immediately usable preview after writes; it now waits for observable read-only seek/pixel readiness. It retries only an explicit pre-dispatch target-change refusal, never a dispatched animation write.

A screenshot taken immediately after closing the control panel caught the previous selection geometry during resize. The overlay already follows the layout in its animation-frame loop. The test now requires five stable aligned observations before taking the screenshot or treating its coordinates as actionable.

The frame tool's short watcher-settle delay does not bind evidence to an exact source revision. New animation insertion still inherits upstream's element-start timing rather than the requested playhead. Both limitations and the orchestration/quality-review roadmap are documented in `ARI.md`. No full MP4 export or advertising/audio-quality certification was claimed by these tests.

No paid provider calls were made: **USD 0**. The two-card source is a repository test fixture, not customer output. Logs and screenshots are excluded from Git because they contain local filesystem paths.
