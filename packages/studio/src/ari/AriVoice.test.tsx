// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AriVoice } from "./AriVoice";
import { setNativeValue } from "./ariTestInput";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function json(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status }));
}

async function click(host: HTMLElement, text: string) {
  const target = [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  expect(target).toBeTruthy();
  await act(async () => target!.click());
}

async function openVoiceDialog() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<AriVoice projectId="demo" />));
  await click(host, "Puhe ja ajoitettu teksti");
  await act(async () => {});
  return host;
}

it("shows the quote before generation and carries saved placement into regeneration", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (!init)
      return json({
        ok: true,
        providerLabel: "Paikallinen testiääni",
        liveReady: false,
        voices: [{ id: "fixture-fi", label: "Suomenkielinen testiääni" }],
        state: {
          draft: {
            text: "Vanha hyväksytty teksti.",
            voiceId: "fixture-fi",
            model: "eleven_multilingual_v2",
            presentation: {
              mode: "lyriikka",
              preset: "vaalea",
              position: "keski",
              align: "vasen",
              safeInsetPx: 92,
              maxWords: 3,
              startSeconds: 0.4,
            },
          },
        },
      });
    if (path.endsWith("/presentation"))
      return json({
        ok: true,
        durationMs: 2400,
        cues: [{ id: "free", text: "Maksuton esikatselu.", startMs: 100, endMs: 2200 }],
        presentation: {},
        chargedUsd: 0,
      });
    if (path.endsWith("/quote"))
      return json({
        ok: true,
        quoteId: "quote-1",
        providerLabel: "Paikallinen testiääni",
        maxUsd: 0,
        characters: 28,
        disclosure: "Testitila ei lähetä tekstiä ulkopuolelle.",
      });
    return json({
      ok: true,
      audioPath: "assets/voice/test.wav",
      durationMs: 2400,
      cues: [{ id: "one", text: "Uusi hyväksytty teksti.", startMs: 100, endMs: 2200 }],
      placeholder: true,
      actualUsd: 0,
    });
  });
  globalThis.fetch = fetch;
  const host = await openVoiceDialog();
  expect(host.textContent).toContain("Testitila ei lähetä tekstiä ulkopuolelle");
  expect(host.textContent).toContain("Suomenkielinen testiääni");
  const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => setNativeValue(textarea, "Uusi hyväksytty teksti."));
  await click(host, "Näytä hinta");
  expect(host.textContent).toContain("Hyväksy ja luo");
  const quoteBody = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
  expect(quoteBody).toEqual({
    text: "Uusi hyväksytty teksti.",
    voiceId: "fixture-fi",
    model: "eleven_multilingual_v2",
  });
  await click(host, "Hyväksy ja luo");
  expect(JSON.parse(String(fetch.mock.calls.at(-2)?.[1]?.body))).toEqual({
    quoteId: "quote-1",
    approved: true,
  });
  expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("/presentation");
  expect(JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
    presentation: {
      mode: "lyriikka",
      preset: "vaalea",
      position: "keski",
      align: "vasen",
      safeInsetPx: 92,
    },
  });
  expect(host.textContent).toContain("1 ajoitettua tekstiryhmää");
  const mode = host.querySelector<HTMLSelectElement>('[aria-label="Ryhmittely"]')!;
  await act(async () => setNativeValue(mode, "tekstitys"));
  await click(host, "Päivitä tekstin esitys maksutta");
  expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("/presentation");
  expect(JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body))).toMatchObject({
    presentation: { mode: "tekstitys", position: "keski", align: "vasen", safeInsetPx: 92 },
  });
  expect(host.textContent).toContain("Puheääntä ei luotu uudelleen");
});

it("shows an actionable disabled state when the server has no configured voice", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  globalThis.fetch = vi.fn(() =>
    json({
      ok: true,
      providerLabel: "ElevenLabs",
      liveReady: false,
      voices: [],
      voiceUnavailableReason:
        "Puheääntä ei ole vielä määritetty. Lisää vähintään yksi suomenkielinen ääni palvelimen asetuksiin.",
      state: null,
    }),
  );
  const host = await openVoiceDialog();
  expect(host.textContent).toContain("Lisää vähintään yksi suomenkielinen ääni");
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Puheääni"]')?.disabled).toBe(true);
  const price = [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("Näytä hinta"),
  );
  expect(price?.disabled).toBe(true);
});
