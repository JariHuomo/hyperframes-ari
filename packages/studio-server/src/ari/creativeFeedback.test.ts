import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { reviewFixture } from "../routes/reviewTestFixture";
import {
  quoteCreativeFeedback,
  readCreativeFeedback,
  readAllCreativeFeedback,
  creativeFeedbackOptions,
  runCreativeFeedback,
} from "./creativeFeedback";
import {
  feedbackResponseText,
  geminiFeedbackProvider,
  museSparkFeedbackProvider,
  museSparkResponseText,
} from "./creativeFeedbackProvider";
import {
  feedbackTask,
  feedbackReviewers,
  feedbackMaxUsdCeiling,
  resolveFeedbackReviewer,
  parseCreativeFeedback,
} from "./creativeFeedbackContract";

const feedback = {
  summary: "Testipalaute, ei luova arvio.",
  strengths: ["Testi"],
  copy: "Testi",
  design: "Testi",
  motion: "Testi",
  audio: "Ei ääniraitaa.",
  limitations: "Testiaineisto.",
  improvements: [0, 0.03, 0.06].map((atSeconds) => ({
    atSeconds,
    problem: "Testi",
    change: "Testi",
    reason: "Testi",
  })),
};
function response(value: unknown = feedback) {
  return {
    data: {
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }],
    },
    inputTokens: 100,
    outputTokens: 100,
    actualUsd: 0.00045,
  };
}
async function setup() {
  const costDir = mkdtempSync(join(tmpdir(), "ari-feedback-cost-"));
  vi.stubEnv("ARI_OFFLINE", "0");
  vi.stubEnv("ARI_AI_REVIEW_LIVE_APPROVED", "1");
  vi.stubEnv("GEMINI_API_KEY", "fixture-inert");
  vi.stubEnv("ARI_AI_REVIEW_COST_DIR", costDir);
  vi.stubEnv("ARI_AI_REVIEW_BUDGET_USD", "3");
  const f = reviewFixture();
  const r = await f.app.request("/ari/projects/p/review/prepare", {
    method: "POST",
    body: JSON.stringify({ versionId: f.version.id }),
  });
  const { package: pkg } = await r.json();
  expect(r.status).toBe(200);
  return { ...f, pkg, costDir };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function stubMetaAnswer(bodies: string[], answer: () => Response) {
  bodies.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("/files")) return Response.json({ id: "file-1" });
      bodies.push(String(init?.body));
      return answer();
    }),
  );
}

function reviewInput(png: Buffer) {
  return {
    video: Buffer.from("v"),
    first: png,
    overview: Buffer.from("o"),
    last: png,
    duration: 0.1,
    audio: false,
  };
}

it("exports a real chronological PNG and reuses paid feedback without a second provider call", async () => {
  const { dir, pkg, costDir } = await setup();
  expect(pkg.overview.samples.map((s: { frame: number }) => s.frame)).toEqual([0, 1, 2]);
  const meta = await sharp(
    join(dir, ".ari-notebook/review-packages", pkg.id, "overview.png"),
  ).metadata();
  expect(meta.width).toBe(pkg.overview.width);
  expect(meta.format).toBe("png");
  const quote = quoteCreativeFeedback(dir, pkg.id, "gemini"),
    provider = { review: vi.fn(async () => response()) };
  const [result, duplicate] = await Promise.allSettled([
    runCreativeFeedback(dir, quote.id, provider),
    runCreativeFeedback(dir, quote.id, provider),
  ]);
  expect(result.status).toBe("fulfilled");
  expect(duplicate.status).toBe("rejected");
  expect(await runCreativeFeedback(dir, quote.id, provider)).toMatchObject({
    feedback,
    advisoryOnly: true,
    actualUsd: 0.00045,
  });
  expect(provider.review).toHaveBeenCalledTimes(1);
  expect(readdirSync(costDir).filter((n) => n.endsWith("settled.json"))).toHaveLength(1);
});
it("refuses offline, unapproved, stale source and altered frozen media before calling a provider", async () => {
  const { dir, pkg } = await setup();
  vi.stubEnv("ARI_OFFLINE", "1");
  expect(() => quoteCreativeFeedback(dir, pkg.id, "gemini")).toThrow(/verkkoyhteydettömässä/);
  vi.stubEnv("ARI_OFFLINE", "0");
  vi.stubEnv("ARI_AI_REVIEW_LIVE_APPROVED", "0");
  expect(() => quoteCreativeFeedback(dir, pkg.id, "gemini")).toThrow(/ei ole vielä/);
  vi.stubEnv("ARI_AI_REVIEW_LIVE_APPROVED", "1");
  const quote = quoteCreativeFeedback(dir, pkg.id, "gemini"),
    provider = { review: vi.fn(async () => response()) };
  await expect(runCreativeFeedback(dir, quote.id, provider, "another")).rejects.toThrow(
    /eri mainosversiolle/,
  );
  const html = readFileSync(join(dir, "index.html"));
  writeFileSync(join(dir, "index.html"), html.toString().replace(">a<", ">b<"));
  await expect(runCreativeFeedback(dir, quote.id, provider)).rejects.toThrow(/muuttunut/);
  writeFileSync(join(dir, "index.html"), html);
  writeFileSync(join(dir, ".ari-notebook/review-packages", pkg.id, "overview.png"), "changed");
  await expect(runCreativeFeedback(dir, quote.id, provider)).rejects.toThrow(/vioittunut/);
  expect(provider.review).not.toHaveBeenCalled();
});
it("settles an invalid model response but publishes no feedback and never retries", async () => {
  const { dir, pkg, costDir } = await setup();
  const quote = quoteCreativeFeedback(dir, pkg.id, "gemini"),
    provider = { review: vi.fn(async () => response({ summary: "Incomplete" })) };
  await expect(runCreativeFeedback(dir, quote.id, provider)).rejects.toThrow(/puutteelliseksi/);
  expect(readCreativeFeedback(dir, pkg.id, "gemini")).toBeNull();
  expect(readdirSync(costDir).filter((n) => n.endsWith("settled.json"))).toHaveLength(1);
  await expect(runCreativeFeedback(dir, quote.id, provider)).rejects.toThrow(/jo pyydetty/);
  expect(provider.review).toHaveBeenCalledTimes(1);
});
it("retains the full reservation for an uncertain call and refuses another project at the shared cap", async () => {
  const a = await setup();
  const quote = quoteCreativeFeedback(a.dir, a.pkg.id, "gemini");
  await expect(
    runCreativeFeedback(a.dir, quote.id, {
      review: async () => {
        throw new Error("timeout");
      },
    }),
  ).rejects.toThrow("timeout");
  const b = await setup();
  vi.stubEnv("ARI_AI_REVIEW_COST_DIR", a.costDir);
  // Two Gemini reservations at $1.10 do not fit a $1.50 shared budget.
  vi.stubEnv("ARI_AI_REVIEW_BUDGET_USD", "1.5");
  const q = quoteCreativeFeedback(b.dir, b.pkg.id, "gemini"),
    provider = { review: vi.fn() };
  await expect(runCreativeFeedback(b.dir, q.id, provider)).rejects.toThrow(/kuluraja/);
  expect(provider.review).not.toHaveBeenCalled();
});
it("uploads the video, reads it agentically and settles tool-use tokens as input", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/upload/v1beta/files"))
      return new Response(JSON.stringify({}), {
        headers: {
          "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload-session",
        },
      });
    if (String(url) === "https://generativelanguage.googleapis.com/upload-session")
      return Response.json({ file: { uri: "https://f/v", name: "files/v", state: "PROCESSING" } });
    if (String(url).endsWith("/v1beta/files/v") && init?.method === "GET")
      return Response.json({ state: "ACTIVE" });
    if (String(url).endsWith("/v1beta/files/v")) return Response.json({});
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.maxOutputTokens).toBe(65536);
    expect(body.contents[0].parts[0]).toEqual({
      fileData: { mimeType: "video/mp4", fileUri: "https://f/v" },
      mediaProcessing: "AGENTIC",
    });
    expect(body.contents[0].parts[0].videoMetadata).toBeUndefined();
    expect(body.tools).toBeUndefined();
    return Response.json({
      ...response().data,
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 100,
        thoughtsTokenCount: 100,
        toolUsePromptTokenCount: 900,
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const value = await geminiFeedbackProvider("inert", feedbackReviewers.gemini).review(
    reviewInput(png),
  );
  expect(value.inputTokens).toBe(1000);
  expect(value.outputTokens).toBe(200);
  expect(value.actualUsd).toBe(0.0015);
  expect(calls.at(-1)!.init?.method).toBe("DELETE");
  expect(parseCreativeFeedback(JSON.parse(feedbackResponseText(value.data)), 0.1)).toEqual(
    feedback,
  );
  expect(() =>
    parseCreativeFeedback(
      {
        ...feedback,
        improvements: [
          { ...feedback.improvements[0], atSeconds: 0.1 },
          ...feedback.improvements.slice(1),
        ],
      },
      0.1,
    ),
  ).toThrow(/ajankohta/);
});
/** The Files API marks a good file FAILED at random (measured 2026-09-10); the free upload repeats, the paid call never does. */
function flakyFilesApi(states: string[]) {
  const uploads: string[] = [];
  let generate = 0;
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/upload/v1beta/files"))
      return new Response(JSON.stringify({}), {
        headers: {
          "x-goog-upload-url": `https://generativelanguage.googleapis.com/session-${uploads.length}`,
        },
      });
    if (u.startsWith("https://generativelanguage.googleapis.com/session-")) {
      const name = `files/f${uploads.length}`;
      uploads.push(name);
      return Response.json({ file: { uri: `https://f/${name}`, name, state: "PROCESSING" } });
    }
    const poll = u.match(/\/v1beta\/files\/f(\d+)$/);
    if (poll && init?.method === "GET") {
      const state = states[Number(poll[1])]!;
      return Response.json(
        state === "FAILED"
          ? { state, error: { code: 13, message: "The file failed to be processed." } }
          : { state },
      );
    }
    if (poll) return Response.json({});
    generate++;
    return Response.json({
      ...response().data,
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, thoughtsTokenCount: 0 },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return { uploads, fetcher, count: () => generate };
}
async function stillsInput() {
  const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  return reviewInput(png);
}
it("re-uploads a file the Files API marked FAILED, before any paid call", async () => {
  const api = flakyFilesApi(["FAILED", "FAILED", "ACTIVE"]);
  const value = await geminiFeedbackProvider("inert", feedbackReviewers.gemini).review(
    await stillsInput(),
  );
  expect(api.uploads).toEqual(["files/f0", "files/f1", "files/f2"]);
  expect(api.count()).toBe(1);
  expect(value.inputTokens).toBe(1);
  // Every discarded copy and the used one are deleted.
  const deletes = api.fetcher.mock.calls
    .filter(([, init]) => init?.method === "DELETE")
    .map(([u]) => String(u));
  expect(deletes).toEqual(uploads(api.uploads));
});
it("gives up after the bounded number of uploads and never calls the model", async () => {
  const api = flakyFilesApi(["FAILED", "FAILED", "FAILED", "FAILED", "ACTIVE"]);
  await expect(
    geminiFeedbackProvider("inert", feedbackReviewers.gemini).review(await stillsInput()),
  ).rejects.toThrow(/FAILED.*failed to be processed/);
  expect(api.uploads).toHaveLength(4);
  expect(api.count()).toBe(0);
});
it("does not re-upload on any other processing outcome", async () => {
  const api = flakyFilesApi(["CANCELLED", "ACTIVE"]);
  await expect(
    geminiFeedbackProvider("inert", feedbackReviewers.gemini).review(await stillsInput()),
  ).rejects.toThrow(/CANCELLED/);
  expect(api.uploads).toHaveLength(1);
  expect(api.count()).toBe(0);
});
function uploads(names: string[]) {
  return names.map((n) => `https://generativelanguage.googleapis.com/v1beta/${n}`);
}
it("binds the task version and processing mode, so an older quote cannot be replayed", async () => {
  const { dir, pkg } = await setup();
  const quote = quoteCreativeFeedback(dir, pkg.id, "gemini");
  expect(quote.taskVersion).toBe(feedbackTask.version);
  expect(quote.processingMode).toBe("agentic");
  const path = join(dir, ".ari-notebook/creative-feedback", `${quote.id}.quote.json`);
  writeFileSync(path, JSON.stringify({ ...quote, taskVersion: 2, processingMode: "static" }));
  const provider = { review: vi.fn() };
  await expect(runCreativeFeedback(dir, quote.id, provider)).rejects.toThrow(/vanhentuneet/);
  expect(provider.review).not.toHaveBeenCalled();
  const result = await runCreativeFeedback(dir, quoteCreativeFeedback(dir, pkg.id, "gemini").id, {
    review: async () => response(),
  });
  expect(result.processingMode).toBe("agentic");
});
it("offers both reviewers with their own bound prices and refuses an invented one", async () => {
  const { dir, pkg } = await setup();
  expect(creativeFeedbackOptions()).toEqual([
    {
      id: "gemini",
      label: "Gemini 3.8 Flash",
      vendor: "Google",
      model: "gemini-3.8-flash",
      video: true,
      maxUsd: 1.1,
    },
    {
      id: "muse-spark",
      label: "Muse Spark 1.3",
      vendor: "Meta",
      model: "muse-spark-1.3",
      video: true,
      maxUsd: 1.6,
    },
  ]);
  expect(feedbackMaxUsdCeiling).toBe(1.6);
  expect(() => resolveFeedbackReviewer("gpt")).toThrow(/tunnisteta/);
  expect(() => quoteCreativeFeedback(dir, pkg.id, undefined)).toThrow(/tunnisteta/);
  expect(() => quoteCreativeFeedback(dir, pkg.id, "constructor")).toThrow(/tunnisteta/);
});
it("keeps Muse Spark closed without its own flag and key, then reviews beside Gemini", async () => {
  const { dir, pkg } = await setup();
  vi.stubEnv("META_MODEL_API_KEY", "");
  expect(() => quoteCreativeFeedback(dir, pkg.id, "muse-spark")).toThrow(/Muse Spark 1.3 ei ole/);
  // The shared review approval alone never opens a second vendor.
  vi.stubEnv("ARI_AI_REVIEW_META_LIVE_APPROVED", "1");
  expect(() => quoteCreativeFeedback(dir, pkg.id, "muse-spark")).toThrow(/yhteyttä ei ole/);
  vi.stubEnv("MUSE_SPARK_API_KEY", "fixture-inert");
  const quote = quoteCreativeFeedback(dir, pkg.id, "muse-spark");
  expect(quote).toMatchObject({ reviewer: "muse-spark", model: "muse-spark-1.3", maxUsd: 1.6 });
  const meta = await runCreativeFeedback(dir, quote.id, {
    review: async () => ({
      data: {
        status: "completed",
        output: [
          { type: "reasoning", content: [{ type: "output_text", text: "ei julkaista" }] },
          { type: "message", content: [{ type: "output_text", text: JSON.stringify(feedback) }] },
        ],
      },
      inputTokens: 10,
      outputTokens: 10,
      actualUsd: 0.0001,
    }),
  });
  expect(meta).toMatchObject({ reviewer: "muse-spark", video: true, label: "Muse Spark 1.3" });
  await runCreativeFeedback(dir, quoteCreativeFeedback(dir, pkg.id, "gemini").id, {
    review: async () => response(),
  });
  // Two vendors, one version: separate bindings, so neither review can overwrite the other.
  expect(
    readAllCreativeFeedback(dir, pkg.id)
      .map((r) => r.reviewer)
      .sort(),
  ).toEqual(["gemini", "muse-spark"]);
});
it("resends an identical Meta request only after an unbilled server_error 500, at most three times", async () => {
  const bodies: string[] = [];
  const serverError = () =>
    new Response(
      JSON.stringify({
        error: { code: null, message: "internal server error", param: null, type: "server_error" },
      }),
      { status: 500 },
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === "https://api.meta.ai/v1/files") return Response.json({ id: "file-1" });
      if (String(url) === "https://api.meta.ai/v1/files/file-1") return Response.json({});
      bodies.push(String(init?.body));
      if (bodies.length < 3) return serverError();
      return Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: JSON.stringify(feedback) }] },
        ],
        usage: { input_tokens: 10, output_tokens: 1 },
      });
    }),
  );
  const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const input = reviewInput(png);
  const value = await museSparkFeedbackProvider("inert", feedbackReviewers["muse-spark"]).review(
    input,
  );
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies).size).toBe(1);
  expect(value.inputTokens).toBe(10);

  // A fourth server_error is final: the third attempt's answer is reported, never a fourth call.
  stubMetaAnswer(bodies, serverError);
  await expect(
    museSparkFeedbackProvider("inert", feedbackReviewers["muse-spark"]).review(input),
  ).rejects.toThrow(/\(500\)/);
  expect(bodies).toHaveLength(3);

  // A 500 that carries usage may have been billed and is never resent; other statuses neither.
  for (const answer of [
    () =>
      new Response(
        JSON.stringify({ error: { type: "server_error" }, usage: { input_tokens: 5 } }),
        { status: 500 },
      ),
    () =>
      new Response(JSON.stringify({ error: { type: "invalid_request_error" } }), { status: 400 }),
    () => new Response("upstream timeout", { status: 503 }),
  ]) {
    stubMetaAnswer(bodies, answer);
    await expect(
      museSparkFeedbackProvider("inert", feedbackReviewers["muse-spark"]).review(input),
    ).rejects.toThrow(/Uutta yritystä ei käynnistetty/);
    expect(bodies).toHaveLength(1);
  }
});

it("uploads the video to Meta, asks for the bound schema and settles cached input lower", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url) === "https://api.meta.ai/v1/files") {
        const form = init?.body as FormData;
        expect(form.get("purpose")).toBe("user_data");
        expect(form.get("expires_after[seconds]")).toBe("3600");
        return Response.json({ id: "file-1" });
      }
      if (String(url) === "https://api.meta.ai/v1/files/file-1") return Response.json({});
      expect(String(url)).toBe("https://api.meta.ai/v1/responses");
      expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer inert");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("muse-spark-1.3");
      expect(body.max_output_tokens).toBe(65536);
      expect(body.input[0].content[0]).toEqual({ type: "input_file", file_id: "file-1" });
      expect(body.input[0].content[1].image_url.startsWith("data:image/png;base64,")).toBe(true);
      expect(body.input[0].content[3].text).toContain("uploaded whole");
      expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
      expect(body.tools).toBeUndefined();
      return Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: JSON.stringify(feedback) }] },
        ],
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
          input_tokens_details: { cached_tokens: 400 },
        },
      });
    }),
  );
  const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const value = await museSparkFeedbackProvider("inert", feedbackReviewers["muse-spark"]).review(
    reviewInput(png),
  );
  expect(value.inputTokens).toBe(1000);
  // 600 uncached at $1.25/M + 400 cached at $0.15/M + 100 output at $4.25/M.
  expect(value.actualUsd).toBeCloseTo(0.001235, 9);
  expect(calls.at(-1)!.init?.method).toBe("DELETE");
  expect(parseCreativeFeedback(JSON.parse(museSparkResponseText(value.data)), 0.1)).toEqual(
    feedback,
  );
  expect(() => museSparkResponseText({ status: "incomplete", output: [] })).toThrow(/kesken/);
});
