# PNG overview and Gemini creative feedback — 2026-09-10

> **Update, same day:** the video read moved from fixed 4 fps sampling to **agentic media processing** (prompt task v3). See _Agentic video processing_ below; the 4 fps sections above it describe the superseded v2 behaviour and its two recorded calls.

Local Ari Studio feature, tested against the existing RajaMarket three-offer prototype. No ad content was changed or released. No commit or push was made.

## Use

Open the project, choose **Tarkistus**, then:

- **Koko mainos · PNG** freezes/reuses the current saved version, renders through the existing review pipeline and opens a chronological contact sheet. Download the overview, the full-resolution final frame, or the review MP4. All local and free.
- **Pyydä AI-palaute** prepares/reuses the same package and shows the bound price and Google disclosure. The separate approval button calls Gemini 3.8 Flash once. Completed feedback reopens for free. It records summary, strengths, three prioritized timestamped changes, copy/design/motion/audio observations and limitations. This is advisory feedback, not an assessment or release approval.

The contact sheet has up to 12 evenly spaced actual video frames, including exact first/last frames, with timestamps and frame numbers. A single PNG cannot show every motion event. Existing packages without an overview remain readable; the shortcut prepares a new package when needed.

Script tools use the same server transport: `studio_prepare_review_package` / `studio_read_review_package` now expose `assetUrls.overview`; `studio_quote_creative_feedback`, `studio_run_creative_feedback` and `studio_read_creative_feedback` handle feedback. The paid tool requires the real quote ID and `approved:true` after authorization; it is not an autonomous spend instruction.

## Local live validation

Credentials are server-only process values, never browser fields or committed configuration. Start the dedicated validation host with a process-local `GEMINI_API_KEY`:

```sh
node scripts/validate-ari-feedback.mjs --live --approve-max-usd 1.5 --cost-dir .ari-studio/feedback-costs-2026-09-10 --port 3087
```

The launcher pins unrelated providers to fixture, enables only `ARI_AI_REVIEW_LIVE_APPROVED`, and starts on loopback. No model call happens until a bound price is approved. `--offline` remains fail-closed for AI; PNG works without the key or approval flag. Do not put live approval flags in an env file.

Inputs are the verified package MP4 (agentic processing since v3, 4 fps sampling in v2), its PNG overview and final full-resolution frame; the first frame is used locally for a pixel comparison. No source code, project notes or credentials are included in the request. Inputs are capped at 60 seconds and 14 MiB combined. There are no provider retries, tools or remote media URLs. Since v3 the MP4 is uploaded through the Gemini Files API and deleted after the call; `mediaProcessing` is a property of a `fileData` part, so inline base64 cannot carry it.

The quote binds package, source revision, video/overview checksums, model, prompt task version, price and a ten-minute expiry. It refuses source changes or corrupt assets before spending. A started record prevents concurrent/uncertain replay for that package and task version; a completed result is reused. Interrupted calls retain the full cost reservation. A malformed completed response is settled before being rejected. This is a local single-host ledger, not AdForge's billing or cost_events database. Multi-process budget locking, customer billing and hosted authentication are outside this implementation.

Pricing checked on 2026-09-10: [Gemini 3.8 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing). The promotional $0.75/M input and $3.75/M output rate, including thinking, expires after 2026-12-31. The code refuses new live runs after expiry. Full model limits (1,048,576 input / 65,536 output) give a theoretical $1.032192 maximum, covered by the shown $1.10 cap. The configured shared budget was $1.50. The output allowance stays 65,536; the actual calls were much cheaper.

## Agentic video processing (prompt task v3, 2026-09-10)

### What changed

- The video is uploaded through the Files API resumable protocol, polled until `ACTIVE`, sent as a
  `fileData` part carrying `mediaProcessing: "AGENTIC"`, and deleted afterwards. `videoMetadata`
  is not sent at all: [Google's video guide](https://ai.google.dev/gemini-api/docs/video-understanding)
  states the frame-rate customisation options are supported only in `static` mode, so agentic and a
  fixed fps are mutually exclusive. The docs demonstrate the setting on an uploaded file only, never
  on inline base64.
- `feedbackTask.version` 2 → 3 and a new `feedbackProcessingMode = "agentic"` constant. Both are in
  the quote binding digest and are re-checked at run time, so a v2 quote or a v2 saved result can
  never be replayed against the new request shape. The quote and the saved result both record
  `processingMode`; the result's old `samplingFps: 4` field is gone.
- Settlement now adds `toolUsePromptTokenCount` to the input side. Agentic navigation bills the
  frames, audio and transcript it loads on demand as tool-use prompt tokens; ignoring them would
  have under-reported this run by 88 %.

### Price ceiling, re-derived

Rate unchanged and re-checked 2026-09-10 on [Google pricing](https://ai.google.dev/gemini-api/docs/pricing):
promotional $0.75/M input and $3.75/M output including thinking, expiring after 2026-12-31; the code
still refuses live runs after that date. Google publishes no separate agentic rate, and the content the
navigator can load is bounded by the model's 1,048,576-token input window. Ceiling therefore stays
1,048,576 × $0.75/M + 65,536 × $3.75/M = **$1.032192**, covered by the shown **$1.10** cap. The 65,536
output allowance is unchanged. The 60-second / 14 MiB input cap is retained even though the video no
longer travels inline, because it is what bounds the navigator's working set.

### One live run, 2026-09-10

`node scripts/validate-ari-feedback.mjs --live --approve-max-usd 1.5 --cost-dir .ari-studio/feedback-costs-2026-09-10-agentic --port 3087`,
key process-local, on the existing RajaMarket package `4da05a58-ed4d-4099-b310-127b362ecebf`
(7.000 s, 210 frames, 1080 × 1920, silent, source revision `5a763d7d…1327c`).

`gemini-3.8-flash` accepted `AGENTIC` with no error. The response proves the navigator ran:

| usageMetadata             | tokens                                       |
| ------------------------- | -------------------------------------------- |
| `promptTokenCount`        | 2,706 (IMAGE 2,180 = the two PNGs, TEXT 526) |
| `toolUsePromptTokenCount` | **19,548** (IMAGE 13,080, TEXT 6,468)        |
| `thoughtsTokenCount`      | 3,895                                        |
| `candidatesTokenCount`    | 1,551                                        |

There is no VIDEO modality in `promptTokensDetails` at all: the clip contributed zero prompt tokens
and every frame the model looked at arrived through the tool-use path it chose itself. Settled at
input 22,254 + output 5,446 = **$0.037113**, one call, against the $1.10 cap and the $1.50 budget.
No second call was made; the question was answered by the first.

### Quality comparison against the 4 fps runs

It did **not** reproduce the v1 failure of flatly denying any motion: it named the mechanical
measurement and qualified its verdict. But it still concluded the frame is effectively unchanged for
the whole seven seconds, and its first improvement still asks for a staggered product entrance.

An independent FFmpeg measurement of the same MP4 (270 px wide, per-frame max-channel difference

> 16/255) settles who is right, and it is mostly the model:

| window        | behaviour                                                               |
| ------------- | ----------------------------------------------------------------------- |
| 0.00 – 0.85 s | the entrance, peaking at 1.6 % of pixels per frame at t ≈ 0.20 s        |
| 0.85 – 2.10 s | frame-identical                                                         |
| 2.10 – 2.45 s | one text band fades in, bounded to y 402–431 of 480, ≤ 0.88 % per frame |
| 2.45 – 7.00 s | frame-identical, 0.00 % per frame for 4.55 s                            |

So the ad moves for about 1.2 of 7 seconds and is a frozen still for the other 5.8. The 8.03 %
first/last difference is real but is the sum of two brief early events, not sustained motion. The
earlier note that the model "recommended a staggered entrance already present in the ad" was itself
too generous to the ad: the existing entrance is over in under a second, and asking for products
paced seconds apart is a legitimate craft note, not a hallucination.

**Conclusion: agentic processing did not change the headline verdict, and the verdict was closer to
correct than the previous session assumed.** What it bought is a cheaper, better-evidenced read —
the model chose ~13,080 image tokens of frames instead of receiving a fixed 28-frame sample — and a
motion observation that survives a mechanical cross-check. It is still not a motion-quality judge:
it gave no timestamps for either of the two real motion windows.

Unverified: only one agentic call was made, so run-to-run variance is unmeasured; the same
comparison has not been run on an ad with sustained mid-clip motion, which is where fixed sampling
should fail hardest and agentic should win most.

## What the real use test established (prompt v1/v2, 4 fps sampling — superseded)

- Computer Use opened Tarkistus, prepared the overview through the PNG button, clicked its download link, opened the server price and approved two sequential live reviews. Reopening the final result through **Pyydä AI-palaute** did not create a third call.
- The PNG endpoint returned image/png and bytes identical to the published 1440 × 2106 contact sheet (12 frames, 0–6.9667 s). The final image is 1080 × 1920. The browser-managed download location was not exposed; delivery files were copied from the verified package and compared with the served bytes.
- First live review, prompt v1: $0.00913275. It incorrectly called the entire video motionless and guessed the valid September 2026 offer date was test data.
- Prompt v2 added the current date, the distinction between prototype status and unverified facts, and the measured first/last pixel difference (8.0282%, using a >16/255 RGB threshold at 360px width). Second live review: $0.01382550. The date claim disappeared. It still understated the subtle motion and recommended a staggered entrance already present in the ad.
- **Total recorded provider cost: $0.02295825, two calls.** No credits charged. There was no third call or automatic repair.
- Original render-affecting source SHA256 remains `436a5f92c00d7b866f78d5c8533ce78b2b2c41bae71b3f36cc49b302536ab5cc`.

This is evidence that the UI/provider integration works, and evidence that its creative feedback is fallible. Do not present its motion observations as ground truth. Neither run had original offer sources; neither verifies prices or campaign terms. The final feedback is saved as the model's opinion, not silently rewritten to agree with the agent.

## Verification and remaining work

- Studio Ari + WebMCP suites: 45 files / 438 tests passed. Server suite: 63 files / 701 tests passed,
  including two rewritten feedback tests — one asserting the exact agentic request shape (`fileData`
  - `mediaProcessing: "AGENTIC"`, no `videoMetadata`, no `tools`), the Files-API upload/poll/delete
    sequence and tool-use tokens settled at the input rate; one asserting that a quote rewritten to
    `taskVersion: 2` / `processingMode: "static"` is refused before the provider is called.
- Both package typechecks, the server build, oxlint and oxfmt over the changed files passed.
  Largest changed production file: 236 lines.
- `bun` is not installed on this machine, so the suites were run through `npx vitest run` per package
  rather than `bun run ari:test`; the Studio Vite build was not re-run for this change (it touches
  no Studio source).
- Existing test noise remains: React act warnings, a localhost:3000 refusal in the export test, and Vite's teardown timeout notice despite exit 0. Production build retains its large-chunk warning.
- Review render logged the earlier non-blocking resource 404 with no URL. It completed; the missing URL still needs diagnosis.
- Development HMR and deliberate server restarts occurred while implementing the feature; this was not a zero-reload acceptance journey. The settled final UI was visually inspected.
- Still absent: automatic editing from feedback, a reliable motion-quality judgement, human usability testing, a customer release gate, integration into AdForge billing, and cross-process budget coordination. Existing multi-property undo defect is unchanged.

Evidence and Finnish use report are under the adjacent AdForge repository:
`docs/motion-studio/2026-09-10-studio-feedback.md` and `screenshots/2026-09-10-studio-feedback/`.

## Second reviewer: Meta Muse Spark 1.3 (2026-09-10)

### What the documentation says

Checked 2026-09-10 against Meta's own docs, not third-party write-ups.

| Question               | Documented answer                                                                                                                                                                                                                                                                                                                                       | Source                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model id               | `muse-spark-1.3` (standard) and `muse-spark-1.3-contributor`                                                                                                                                                                                                                                                                                            | [Models](https://dev.meta.ai/docs/models/)                                                                                                                                                           |
| Input modalities       | "Text, image, video, audio\*, PDF"; audio understanding is explicitly _not_ fully supported in 1.3                                                                                                                                                                                                                                                      | [Models](https://dev.meta.ai/docs/models/)                                                                                                                                                           |
| Video input            | **Yes.** Three forms: a Files-API upload referenced by `file_id` in an `input_file` block, a public URL, or a base64 data URL in an `input_video` block. "Video works on both the Responses API and Chat Completions. This page shows the Responses + Files API workflow: upload, then reference by `file_id`, which we recommend for uploaded videos." | [Video understanding](https://dev.meta.ai/docs/video-understanding/)                                                                                                                                 |
| Video formats / limits | `video/mp4` only. No duration limit is published. Files-API uploads are capped at 1 GiB, inline images at 50 MB, 50 images per request. No fps or sampling control is documented.                                                                                                                                                                       | [Video understanding](https://dev.meta.ai/docs/video-understanding/), [File handling](https://dev.meta.ai/docs/file-handling/), [Image understanding](https://dev.meta.ai/docs/image-understanding/) |
| Image input            | `input_image` with a plain `image_url` string (base64 data URL accepted) or a `file_id`; `image_url` object wrapper in Chat Completions                                                                                                                                                                                                                 | [Image understanding](https://dev.meta.ai/docs/image-understanding/)                                                                                                                                 |
| Structured output      | `type: "json_schema"` with `strict: true`; "The model constrains token generation to produce only valid JSON matching your schema." `text.format` is the Responses parameter, `response_format` the Chat-Completions equivalent; schema constraints apply to both `/v1/chat/completions` and `/v1/responses`.                                           | [Structured output](https://dev.meta.ai/docs/structured-output/)                                                                                                                                     |
| Pricing                | $1.25/M input, $0.15/M cached input, $4.25/M output; 1,048,576-token context. No per-second or per-video media rate is published, and video token accounting is not documented.                                                                                                                                                                         | [Muse Spark](https://developer.meta.com/ai/models/muse-spark/), [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits/)                                                             |

So the owner's belief is **confirmed**: Muse Spark 1.3 takes a comparable video upload. The result is
therefore recorded `video: true`, not stills-only.

### What the provider sends

One `POST https://api.meta.ai/v1/responses` with a Bearer key, `redirect: "error"`, a hard timeout,
no retries, no `tools` and no remote URL:

- `input_file` naming a `file_id` from `POST /v1/files` (`purpose=user_data`, `expires_after` pinned
  to one hour), deleted again in a `finally` block. The public-URL and data-URL forms are documented
  but unused: a remote URL is forbidden by the review rules, and Meta recommends the upload path.
- two `input_image` parts carrying the 12-frame overview and the full-resolution final frame as
  base64 data URLs
- one `input_text` part with the same prompt Gemini gets, except for one sentence naming how the
  clip was handed over
- `text.format` = the same `feedbackSchema`, `strict: true`
- `max_output_tokens` = 65,536, unchanged

Usage is read from `usage.input_tokens` / `usage.output_tokens`, with
`input_tokens_details.cached_tokens` billed at the lower cached rate; a missing or contradictory
usage block fails closed instead of settling at zero. Only `status: "completed"` publishes, and
reasoning items are never read as feedback.

**Bounded resend on an unbilled 500 (added 2026-09-10 evening).** Meta's Responses endpoint
answered HTTP 500 `{"error":{"type":"server_error"}}` on 6 of 19 calls on one 12.7 s ad, each
within about 7 s, before generation (successful calls took 30–60 s), on bodies byte-identical
to ones that succeeded a minute earlier; every such reply carried no `usage` block. A prompt
value, the 65 536 output cap, the `expires_after` upload fields and the strict schema were each
ruled out one at a time. The provider now posts the identical body again, at most three attempts,
only for HTTP 500 whose JSON body is `server_error` and has no `usage`; any 500 that carries
usage is treated as billed and final, every other status is final, and the body never changes
between attempts. This mirrors Gemini's re-upload on a FAILED file state: it exists because the
vendor state is transient, not to paper over a bad request.

### Price ceiling

Meta publishes no per-second video rate and does not document how a clip is tokenised, so the only
sound bound is the whole input window: 1,048,576 × $1.25/M + 65,536 × $4.25/M = **$1.589248**,
shown as a **$1.60** cap. Cached input bills at $0.15/M and is settled separately, which can only
reduce the charge. The shared local budget must now cover the dearer reviewer, so
`validate-ari-feedback.mjs` requires `--approve-max-usd` ≥ 1.60.

### The seam

A reviewer is a closed server-side quote parameter (`gemini` | `muse-spark`) resolved from
`feedbackReviewers` in the contract. The client names an id and nothing else — model, price, request
shape and key never cross the wire, and an unknown id is refused rather than defaulted. Each entry
owns its model, processing mode, price ceiling, per-token rates, key variables and approval flag.
The reviewer id is part of the quote binding digest, so the two vendors' reviews of one version live
in separate files and neither can overwrite or be replayed as the other.

Muse Spark needs **both** `ARI_AI_REVIEW_LIVE_APPROVED=1` and its own
`ARI_AI_REVIEW_META_LIVE_APPROVED=1`, plus a key in `META_MODEL_API_KEY` (or the
`MUSE_SPARK_API_KEY` alias). A key alone never opens the vendor; the flag alone never does either.
The Tarkistus tab lists both reviewers with their bound caps before anything is quoted, and the
saved result states which reviewer produced it and whether that reviewer saw the video.

### Live validation: not run

**Superseded the same evening:** a key arrived and the provider was run on three real ads; see
"Muse Spark on the same ads" below. This section is kept as the pre-key state.

No Meta key exists on this machine. Searched: the process environment, all 43 `.env*` files under
`~/Documents/GitHub/*` and `~/Documents/*` (including `~/Documents/wsoy-brand-tool/.env.local`, which
the earlier benchmark script read), `~/.zshrc`, `~/.zshenv`, `~/.zprofile` and `~/.bash_profile`. No
`META_MODEL_API_KEY`, `MUSE_SPARK_API_KEY` or `api.meta.ai` reference is set anywhere. The endpoint
was **not** probed, so the request shape above is documentation-derived and unverified against a
live response. Recorded Muse Spark spend: **$0.00**.

To run it later, without writing the key to any file:

```sh
META_MODEL_API_KEY=… GEMINI_API_KEY=… node scripts/validate-ari-feedback.mjs \
  --live --approve-max-usd 1.6 --cost-dir .ari-studio/feedback-costs-<date> --port 3087
```

The launcher enables `ARI_AI_REVIEW_META_LIVE_APPROVED` only when a Meta key is present in that
process, and prints which reviewers it opened.

### Tests

Fixture-only, no network: the exact Meta request shape (upload fields, `input_file` + `file_id`,
base64 images, `text.format` strict schema, no `tools`, delete afterwards), cached input settled at
the lower rate, missing key fail-closed, missing `ARI_AI_REVIEW_META_LIVE_APPROVED` fail-closed, an
unknown or absent reviewer refused, the quote binding, and both reviewers' results coexisting on one
version. Studio-server 63 files / 704 tests, Studio Ari + WebMCP 45 files / 438 tests, both
typechecks, both builds, oxlint and oxfmt over the changed files.

## Real finished ads through the same seam (2026-09-10, evening)

The owner asked whether the reviewers give real quality on real ads, not only on the RajaMarket
studio prototype. `scripts/validate-ari-feedback-file.ts` feeds any finished MP4 through the same
reviewer catalogue, prompt, JSON schema, settlement and reservation rules as the Tarkistus tab,
without a studio project. The reviewer is an explicit `--reviewer gemini|muse-spark` flag; a key
in the environment never selects a vendor. Records land next to each ad under `--out`, the cost
records under `--cost-dir`, and a review for a clip whose result already exists is skipped.

```sh
GEMINI_API_KEY=… node_modules/.bin/tsx scripts/validate-ari-feedback-file.ts --live \
  --reviewer gemini --approve-max-usd 3.5 --cost-dir .ari-studio/feedback-costs-<date> \
  --out <dir> <ad1.mp4> <ad2.mp4>
```

### Gemini Files API processing is flaky today

Three real ads from `adforge/valmiit-mainokset` were submitted. Uploads arrived intact (server
`sha256Hash` equals the local checksum, `sizeBytes` equal), yet the file's state went
`PROCESSING → FAILED` with `{code: 13, message: "The file failed to be processed."}` on most
attempts, from Node and from curl alike, and the same bytes went `ACTIVE` on other attempts.
One status poll answered HTTP 500. Tally over the session: 12 uploads, 3 ACTIVE. This is a
vendor-side state, not a property of the file or the client.

Consequence in the provider: a `FAILED` processing state now discards that copy and uploads the
same bytes again, at most `FILE_UPLOAD_ATTEMPTS` (4) times. Every other outcome, including
`CANCELLED` and any HTTP error, stays final. The upload is free and precedes the only billable
call, so the review's no-retry rule is unchanged: `generateContent` is still sent once. The
`error.message` the Files API attaches on `FAILED` is now surfaced in the thrown message. Three
unit tests cover: FAILED, FAILED, ACTIVE → three uploads, one model call, every copy deleted; four
FAILED → error, zero model calls; CANCELLED → no re-upload.

### Results

| Ad                                   | Length | Result                                             | Cost (USD) | Input / output tokens |
| ------------------------------------ | ------ | -------------------------------------------------- | ---------- | --------------------- |
| Juvans, kuntokeskus, 9:16            | 32.6 s | reviewed                                           | 0.023744   | 12 563 / 3 819        |
| Meklari Sanna ensiasunto, 9:16       | 12.7 s | reviewed on the 4th run                            | 0.028037   | 15 843 / 4 308        |
| Meklari Pentti paperiliittimet, 9:16 | 32.0 s | not reviewed, Files API FAILED / 500 on all 4 runs | 0          | –                     |

Both reviews arrived through the tool-use path (`toolUsePromptTokenCount` 9 840 and 13 120,
no VIDEO modality in `promptTokensDetails`), so agentic navigation engaged on real footage too.

### Quality, checked against the ads

**Sanna (Meklari):** every checkable claim holds. The caption at 3.47 s really reads "Meklari
piste comissa" (phonetic transcript shipped as on-screen text). The end card from 10.40 s is a
black frame with "Meklari", "Lue lisää" and a small URL, and the audio track really ends there:
`volumedetect` measures −27.8 dB mean over 0–10 s and −91 dB over 10.4–12.7 s. There is no
music. All three improvements point at those three real defects with correct timestamps.

**Juvans:** the visual observations hold. The captions do sit over the presenter's neck and chin,
the sentence splits are awkward ("laitteitten kanssa. Myö"), and the end card is a black frame
with "Juvans" and "Lue lisää", again silent (−91 dB over the last 2.3 s). But the top-ranked
improvement, "the caption says 4,7 stars while the speech says 4,9", is invented: the stored
transcript from the 2026-08-20 audio audit has the presenter saying "4,7 tähteä" at 2.4–4.3 s,
and the script was written with 4,7. The model heard a number that is not there and made it its
first priority.

So: strong on what it can see, and the mechanical cross-checks (timestamps, contact sheet,
last frame) let a reader confirm most of it. Its audio claims are the weak spot and need an
independent check before anyone acts on them. This matches the earlier finding that the frame
audit never hears audio reliably.

### Muse Spark on the same ads: live, 2026-09-10 evening

The owner supplied `META_MODEL_API_KEY`, saved in AdForge's `.env.local` (never in this
repository) and passed into the validator process. `GET /v1/models` lists `muse-spark-1.3`,
`muse-spark-1.3-contributor`, `muse-spark-1.2`, `muse-spark-1.1`, `muse-image-1.0` and
`muse-voice-transcribe-1.0`. The three files went through `scripts/validate-ari-feedback-file.ts
--reviewer muse-spark` with `--approve-max-usd 4.8` and a fresh cost directory; results sit beside
Gemini's under the same `--out` directory as `muse-spark.result.json`.

| Ad                                   | Length | Result         | USD      | Tokens in / out (reasoning) |
| ------------------------------------ | ------ | -------------- | -------- | --------------------------- |
| Meklari Sanna ensiasunto, 9:16       | 12.7 s | reviewed, 63 s | 0.029042 | 10 433 / 3 765 (2 118)      |
| Juvans, kuntokeskus, 9:16            | 32.6 s | reviewed, 62 s | 0.036932 | 15 881 / 4 019 (2 353)      |
| Meklari Pentti paperiliittimet, 9:16 | 32.0 s | reviewed, 57 s | 0.036482 | 15 868 / 3 917 (2 087)      |

Video token accounting, now measured: the 12.7 s clip alone cost 3 297–3 306 input tokens
(about 260 tokens per second); the two PNGs add roughly 7 100. Reasoning defaults to `high` and
is billed as output; it ran 2 000–2 400 tokens per review. `cached_tokens` was 0 on every
recorded review (a repeat of the same body within a minute was 99 % cached at $0.15/M). The
combination the earlier section called unproven — an uploaded video referenced by `file_id`,
two base64 images and a strict `json_schema` in `text.format` on one Responses call — works.

**Quality, checked against the ads.** Every checkable claim in all three reviews held:

- Shot timeline. FFmpeg scene detection (threshold 0.25) gives cuts at 2.43 / 4.40 / 7.80 /
  10.27 s (Sanna), 7.0 / 13.7 / 22.9 / 30.1 s (Juvans) and 12.53 / 23.3 / 29.53 s (Pentti). Muse
  Spark's motion paragraphs name the same boundaries within 0.3 s on all three ads, and it never
  called a clip motionless.
- Sanna. It found "Meklari piste comissa" and suggested "meklari.comissa", named the black end
  card at 10.4 s, and heard the audio go quiet on it. All match the earlier measurements.
- Juvans. It read the opening as "4,7 tähteä" — correct, per the 2026-08-20 transcript — where
  Gemini's agentic run invented a 4,7-versus-4,9 mismatch and ranked it first. The offer wording
  ("vuoden jäsenyys syyskuun loppuun mennessä, kolme InBody-mittausta") and the spoken CTA "soita
  tai laita sähköpostia" with no number or address on screen both match the transcript and the
  end card.
- Pentti (never reviewed by Gemini: the Files API failed all four times). The top improvement,
  "the speaker says look at the address on screen at 26–29 s but no address is shown until the
  end card", is confirmed by the frame at 27 s (caption "Käy kahtomassa tuosta ruudun", no URL)
  and the SRT (25.3–29.5 s). The opening title "KYLÄKAUPAN PIHALLA EPÄILIVÄT…" in white and pink
  on black, the blue tractor sequence and the end-card position all match the frames.
- Caption over the mouth. Its recurring design note on the two presenter ads is visible in the
  frames at 1 s (Sanna) and 2.5 s (Juvans): the pink box sits across the mouth and chin.

What it did not do: it made no claim we could show to be false, and its audio paragraphs stayed
inside what the transcript supports. It hedged where it should ("musiikkia tai tehosteita en
pysty tästä aineistosta varmasti arvioimaan"). Compared with Gemini agentic on the same two ads,
Muse Spark was as accurate on visuals and timestamps, more accurate on audio, and somewhat more
expensive per review (0.029–0.037 USD against 0.024–0.028 USD) because reasoning is billed.

**Vendor findings.** (1) The intermittent unbilled 500 described above. (2) `expires_after` on
the upload is accepted and honoured (`expires_at` set one hour ahead); a plain upload has
`expires_at: null`, so the delete in `finally` matters. (3) Two files not uploaded by this
provider (4.1 MB and 42 KB, uuid filenames, `expires_at: null`) were present on the account's
file list and were left alone.

Verification frames used for the checks: `screenshots/2026-09-10-real-ads-feedback/verify/`
in the AdForge repository.

### Spend this session

Gemini: 0.051781 USD for two reviews. Muse Spark: 0.102457 USD recorded for the three reviews,
plus roughly 0.25 USD of diagnostics while isolating the 500 (19 Responses calls, most of them
short). Cumulative creative-feedback spend on 2026-09-10 is about 0.45 USD. Nothing committed or
pushed.

## RajaMarket feedback applied, 2026-09-10

The owner requested improvements to the ad itself. The studio project now holds a 10-second v3
prototype: all product images visible immediately, text groups at 0/1.2/2.4 s, CTA settled by
4.1 s, larger detail/unit/terms typography and no in-artwork prototype stamp. Source assets and
prices are unchanged. Source-script edits and CLI rendering, with Computer Use preview verification.
No application source edits or commit/push. Two Meta reviews cost 0.032407 + 0.0288795 =
0.0612865 USD; both succeeded with one Responses call, both uploads deleted (HTTP 200).
The second review recognizes the sequence and hold, while still suggesting typography and reveal
refinements. Its required three suggestions are not a release gate or proof another edit is needed.
Final MP4 reviewed at 20 fps throughout plus native boundary frames; no text collisions or black tail.
Full evidence, provenance, limits and pipeline backlog: [README.md](/Users/jarihuomo/Documents/GitHub/adforge/screenshots/2026-09-10-rajamarket-parannettu/README.md).

### 2026-09-10 — Real-estate slideshow experiment

A 24 s Karhinkuja 6 slideshow was constructed as six editable sub-compositions and exported through Ari Studio (1080×1920, 30 fps, Standard). One Muse Spark 1.3 review of the complete 720×1280 review copy plus overview/last stills used 11,890 input and 4,848 output tokens: **$0.0354665**, no retries. The reviewer praised clarity and honest condition disclosure, and suggested a more property-specific opening and larger contact details. Its scene timestamps were approximate and its renovation-opportunity suggestion partially duplicated existing copy. No quality certificate is claimed.

The master was inspected at 20 fps across all 24 seconds, with native-rate edge checks. Source, hashes, review response, ledger and production follow-ups: `/Users/jarihuomo/Documents/GitHub/adforge/screenshots/2026-09-10-karhinkuja-slideshow/README.md`. This silent local prototype is not published and does not implement an automatic property-listing production flow.
