import sharp from "sharp";
import {
  feedbackOutputTokens,
  feedbackPrompt,
  feedbackSchema,
  type FeedbackReviewer,
} from "./creativeFeedbackContract.js";
export interface FeedbackInput {
  video: Buffer;
  first: Buffer;
  overview: Buffer;
  last: Buffer;
  duration: number;
  audio: boolean;
}
export interface FeedbackResponse {
  data: unknown;
  inputTokens: number;
  outputTokens: number;
  actualUsd: number;
}
export interface FeedbackProvider {
  review(input: FeedbackInput): Promise<FeedbackResponse>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI-palvelun vastaus jäi puutteelliseksi.");
  return value as Record<string, unknown>;
}
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILE_POLL_INTERVAL_MS = 2_000;
const FILE_POLL_LIMIT = 60;
/**
 * Re-uploads allowed when the Files API reports FAILED processing. Measured 2026-09-10: the same
 * bytes went ACTIVE on one upload and FAILED on the next, from Node and from curl alike (2 of 9
 * uploads succeeded), so FAILED is a transient vendor state, not a property of the file. The
 * upload is free and precedes the only billable call, so this never risks a double charge.
 */
const FILE_UPLOAD_ATTEMPTS = 4;

/** Measures how much of the frame actually changes, so the model cannot call a moving ad still. */
async function changedPixelPercent(first: Buffer, last: Buffer) {
  const [a, b] = await Promise.all(
    [first, last].map((bytes) => sharp(bytes).resize(360).removeAlpha().raw().toBuffer()),
  );
  if (!a || !b || a.length !== b.length)
    throw new Error("Tarkistuskuvien koot poikkeavat toisistaan.");
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    if ([0, 1, 2].some((channel) => Math.abs(a[i + channel]! - b[i + channel]!) > 16)) changed++;
  }
  return (100 * changed) / (a.length / 3);
}

/**
 * Uploads the review MP4 through the Files API's resumable protocol.
 *
 * Agentic media processing is a property of a `fileData` part: the documented request shape
 * names an uploaded file, never inline base64. Two round trips are the protocol, not a choice.
 */
async function uploadVideo(
  key: string,
  video: Buffer,
): Promise<{ uri: string; name: string; state: unknown }> {
  const start = await fetch(UPLOAD_BASE, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(video.byteLength),
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "ari-studio-review" } }),
  });
  if (!start.ok)
    throw new Error(
      `AI-palvelu ei ottanut videota vastaan (${start.status}). Uutta yritystä ei käynnistetty.`,
    );
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("AI-palvelu ei palauttanut latausosoitetta.");
  const finalize = await fetch(uploadUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(180_000),
    headers: {
      "Content-Length": String(video.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(video) as unknown as BodyInit,
  });
  if (!finalize.ok)
    throw new Error(
      `Videon lähetys AI-palveluun epäonnistui (${finalize.status}). Uutta yritystä ei käynnistetty.`,
    );
  const file = object(object(await finalize.json()).file);
  if (typeof file.uri !== "string" || typeof file.name !== "string")
    throw new Error("AI-palvelu ei palauttanut videon tunnistetta.");
  return { uri: file.uri, name: file.name, state: file.state };
}

/**
 * Waits until the uploaded file leaves PROCESSING.
 *
 * A generateContent naming a PROCESSING file fails with an error that reads like a bad request.
 * FAILED is reported as itself: the same bytes would fail again, so nothing is retried.
 */
function fileProcessingDetail(detail: unknown): string {
  return detail &&
    typeof detail === "object" &&
    typeof (detail as { message?: unknown }).message === "string"
    ? ` ${(detail as { message: string }).message}`
    : "";
}

async function waitForActive(key: string, name: string, state: unknown) {
  let current = state;
  let detail: unknown;
  for (let poll = 0; current === "PROCESSING" || !current; poll++) {
    if (poll >= FILE_POLL_LIMIT)
      throw new Error("Videon käsittely AI-palvelussa kesti liian pitkään.");
    if (poll > 0) await new Promise((done) => setTimeout(done, FILE_POLL_INTERVAL_MS));
    const response = await fetch(`${API_BASE}/${name}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: { "x-goog-api-key": key },
    });
    if (!response.ok) throw new Error(`Videon tilaa ei saatu AI-palvelusta (${response.status}).`);
    const file = object(await response.json());
    current = file.state;
    detail = file.error;
  }
  if (current !== "ACTIVE") {
    // The Files API attaches a Status object on FAILED; surface its message.
    const reason = fileProcessingDetail(detail);
    throw new FileProcessingError(
      `AI-palvelu ei pystynyt käsittelemään videota (${String(current)}).${reason}`,
      current === "FAILED",
    );
  }
}

class FileProcessingError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
  }
}

/**
 * Uploads and waits until ACTIVE. A FAILED processing state discards that copy and uploads the
 * same bytes again, at most FILE_UPLOAD_ATTEMPTS times; every other failure is final. No paid
 * call has happened yet at this point, so the review's no-retry rule is untouched.
 */
async function uploadActiveVideo(key: string, video: Buffer) {
  for (let attempt = 1; ; attempt++) {
    const file = await uploadVideo(key, video);
    try {
      await waitForActive(key, file.name, file.state);
      return file;
    } catch (error) {
      await deleteVideo(key, file.name);
      if (error instanceof FileProcessingError && error.transient && attempt < FILE_UPLOAD_ATTEMPTS)
        continue;
      throw error;
    }
  }
}

/** Best effort: the review has already succeeded or failed, and the Files API expires entries itself. */
async function deleteVideo(key: string, name: string) {
  try {
    await fetch(`${API_BASE}/${name}`, {
      method: "DELETE",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: { "x-goog-api-key": key },
    });
  } catch {
    /* the uploaded copy expires on its own; a cleanup failure is not a review failure */
  }
}

/**
 * No retries, tools, remote URLs, or client-supplied models. Credentials stay on the server.
 *
 * The video is read in AGENTIC media processing: the model chooses which moments to inspect
 * instead of receiving a fixed sample. The earlier fixed 4 fps sampling made it call a moving
 * ad motionless and propose an entrance that was already there. Agentic and a fixed fps are
 * mutually exclusive, so `videoMetadata` is not sent at all.
 */
export function geminiFeedbackProvider(key: string, reviewer: FeedbackReviewer): FeedbackProvider {
  return {
    async review(input) {
      const changed = await changedPixelPercent(input.first, input.last);
      const file = await uploadActiveVideo(key, input.video);
      try {
        const response = await fetch(`${API_BASE}/models/${reviewer.model}:generateContent`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(600_000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    fileData: { mimeType: "video/mp4", fileUri: file.uri },
                    mediaProcessing: "AGENTIC",
                  },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: input.overview.toString("base64"),
                    },
                  },
                  { inlineData: { mimeType: "image/png", data: input.last.toString("base64") } },
                  { text: feedbackPrompt(input.duration, input.audio, changed, reviewer) },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: feedbackOutputTokens,
              responseMimeType: "application/json",
              responseJsonSchema: feedbackSchema,
            },
          }),
        });
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 600);
          throw new Error(
            `AI-palvelu ei vastannut onnistuneesti (${response.status}). Uutta yritystä ei käynnistetty. ${detail}`,
          );
        }
        const result = object(await response.json());
        const usage = object(result.usageMetadata);
        const prompt = usage.promptTokenCount;
        const candidates = usage.candidatesTokenCount;
        const thoughts = usage.thoughtsTokenCount ?? 0;
        // Agentic navigation bills the frames it loads on demand as tool-use prompt tokens.
        const toolUse = usage.toolUsePromptTokenCount ?? 0;
        if (
          ![prompt, candidates, thoughts, toolUse].every(
            (n) => typeof n === "number" && Number.isInteger(n) && n >= 0,
          )
        )
          throw new Error("AI-palvelun kulutietoja ei saatu.");
        const inputTokens = Number(prompt) + Number(toolUse);
        const outputTokens = Number(candidates) + Number(thoughts);
        const actualUsd =
          (inputTokens * reviewer.inputUsdPerMillion +
            outputTokens * reviewer.outputUsdPerMillion) /
          1_000_000;
        // Return the raw response as data: settlement happens even if JSON/shape/finish validation fails.
        return { data: result, inputTokens, outputTokens, actualUsd };
      } finally {
        await deleteVideo(key, file.name);
      }
    },
  };
}
export function feedbackResponseText(data: unknown): string {
  const result = object(data);
  if (!Array.isArray(result.candidates) || result.candidates.length !== 1)
    throw new Error("AI-palaute puuttuu.");
  const candidate = object(result.candidates[0]);
  if (candidate.finishReason !== "STOP")
    throw new Error("AI-palaute jäi kesken. Uutta yritystä ei käynnistetty.");
  const content = object(candidate.content);
  if (!Array.isArray(content.parts)) throw new Error("AI-palaute puuttuu.");
  return content.parts
    .map((part: unknown) => {
      const p = object(part);
      return p.thought === true ? "" : typeof p.text === "string" ? p.text : "";
    })
    .join("");
}

/**
 * Meta Model API, Muse Spark 1.3.
 *
 * Meta documents three ways to hand over a clip: a Files-API upload referenced by `file_id`, a
 * public URL, and a base64 data URL. Only the upload is used here — a remote URL is forbidden by
 * the review rules, and Meta's own video guide recommends the upload path for uploaded footage
 * ("upload, then reference by file_id, which we recommend for uploaded videos"). The upload is
 * pinned to expire in an hour and is deleted in a `finally` block regardless.
 *
 * `text.format` is the documented Responses-API name for structured output (`response_format` is
 * the Chat-Completions equivalent), so the same feedbackSchema constrains both vendors. No
 * retries, no tools, no remote URLs; the key stays on the server.
 */
const META_BASE = "https://api.meta.ai/v1";
/**
 * Identical resends allowed when Meta answers HTTP 500 `server_error` with no usage block.
 * Measured 2026-09-10 on one 12.7 s ad: 6 of 19 Responses calls failed that way within ~7 s,
 * before generation (successful calls took 30–60 s), on bodies byte-identical to ones that
 * succeeded a minute earlier, so it is a transient vendor state, not a property of the request.
 * The body is never altered between attempts, every other status is final, and a 500 that
 * carries usage is treated as billed and never resent.
 */
const META_RESPONSE_ATTEMPTS = 3;

async function uploadMetaVideo(key: string, video: Buffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(video)], { type: "video/mp4" }), "review.mp4");
  form.append("purpose", "user_data");
  // Delete below is best effort; the anchor makes the copy disappear even if this process dies.
  form.append("expires_after[anchor]", "created_at");
  form.append("expires_after[seconds]", "3600");
  const response = await fetch(`${META_BASE}/files`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(180_000),
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok)
    throw new Error(
      `AI-palvelu ei ottanut videota vastaan (${response.status}). Uutta yritystä ei käynnistetty.`,
    );
  const file = object(await response.json());
  if (typeof file.id !== "string" || !file.id)
    throw new Error("AI-palvelu ei palauttanut videon tunnistetta.");
  return file.id;
}

async function deleteMetaVideo(key: string, id: string) {
  try {
    await fetch(`${META_BASE}/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    /* the upload expires on its own after an hour; a cleanup failure is not a review failure */
  }
}

function metaCount(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error(`AI-palvelun kulutietoja ei saatu (${what}).`);
  return value;
}

/**
 * Posts one Responses body. Only an HTTP 500 whose JSON body is `server_error` without a usage
 * block is sent again, byte-identical, up to META_RESPONSE_ATTEMPTS; see the constant's note.
 */
async function postMetaResponses(key: string, body: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${META_BASE}/responses`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(600_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body,
    });
    if (response.ok) return response;
    const detail = (await response.text()).slice(0, 600);
    if (
      response.status === 500 &&
      attempt < META_RESPONSE_ATTEMPTS &&
      isUnbilledServerError(detail)
    )
      continue;
    throw new Error(
      `AI-palvelu ei vastannut onnistuneesti (${response.status}). Uutta yritystä ei käynnistetty. ${detail}`,
    );
  }
}

function isUnbilledServerError(detail: string): boolean {
  try {
    const parsed = object(JSON.parse(detail));
    return (
      parsed.usage === undefined &&
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      (parsed.error as { type?: unknown }).type === "server_error"
    );
  } catch {
    return false;
  }
}

export function museSparkFeedbackProvider(
  key: string,
  reviewer: FeedbackReviewer,
): FeedbackProvider {
  return {
    async review(input) {
      const changed = await changedPixelPercent(input.first, input.last);
      const fileId = await uploadMetaVideo(key, input.video);
      try {
        const image = (bytes: Buffer) => ({
          type: "input_image",
          image_url: `data:image/png;base64,${bytes.toString("base64")}`,
        });
        const body = JSON.stringify({
          model: reviewer.model,
          max_output_tokens: feedbackOutputTokens,
          input: [
            {
              type: "message",
              role: "user",
              content: [
                { type: "input_file", file_id: fileId },
                image(input.overview),
                image(input.last),
                {
                  type: "input_text",
                  text: feedbackPrompt(input.duration, input.audio, changed, reviewer),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "creative_feedback",
              strict: true,
              schema: feedbackSchema,
            },
          },
        });
        const response = await postMetaResponses(key, body);
        const result = object(await response.json());
        const usage = object(result.usage);
        const inputTokens = metaCount(usage.input_tokens, "input");
        const outputTokens = metaCount(usage.output_tokens, "output");
        const details = usage.input_tokens_details;
        const cached =
          details === undefined || details === null
            ? 0
            : metaCount(object(details).cached_tokens ?? 0, "cached");
        if (cached > inputTokens) throw new Error("AI-palvelun kulutiedot ovat ristiriitaiset.");
        const actualUsd =
          ((inputTokens - cached) * reviewer.inputUsdPerMillion +
            cached * reviewer.cachedInputUsdPerMillion +
            outputTokens * reviewer.outputUsdPerMillion) /
          1_000_000;
        // Raw response as data: settlement happens even if JSON/shape/status validation fails.
        return { data: result, inputTokens, outputTokens, actualUsd };
      } finally {
        await deleteMetaVideo(key, fileId);
      }
    },
  };
}

/** Responses-API output: only a completed run publishes, and reasoning items are never feedback. */
export function museSparkResponseText(data: unknown): string {
  const result = object(data);
  if (result.status !== "completed")
    throw new Error("AI-palaute jäi kesken. Uutta yritystä ei käynnistetty.");
  if (!Array.isArray(result.output)) throw new Error("AI-palaute puuttuu.");
  const text = result.output
    .filter((item: unknown) => object(item).type === "message")
    .flatMap((item: unknown) => {
      const content = object(item).content;
      if (!Array.isArray(content)) throw new Error("AI-palaute puuttuu.");
      return content.map((part: unknown) => {
        const p = object(part);
        return p.type === "output_text" && typeof p.text === "string" ? p.text : "";
      });
    })
    .join("");
  if (!text) throw new Error("AI-palaute puuttuu.");
  return text;
}

/** One seam, two vendors: the reviewer id decides the request shape and how its answer is read. */
export function feedbackProvider(reviewer: FeedbackReviewer, key: string): FeedbackProvider {
  return reviewer.id === "gemini"
    ? geminiFeedbackProvider(key, reviewer)
    : museSparkFeedbackProvider(key, reviewer);
}
export function readFeedbackText(reviewer: FeedbackReviewer, data: unknown): string {
  return reviewer.id === "gemini" ? feedbackResponseText(data) : museSparkResponseText(data);
}
