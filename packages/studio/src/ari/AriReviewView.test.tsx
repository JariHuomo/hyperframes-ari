// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { AriReviewView, coverageText } from "./AriReviewView";
import type { ReviewPackage } from "../utils/reviewPackages";

afterEach(() => {
  document.body.innerHTML = "";
});

const asset = (path: string) => ({ path, sha256: "x", bytes: 1 });
const pkg = {
  schema: 1,
  id: "11111111-1111-4111-8111-111111111111",
  versionId: "v2",
  versionName: "Jälkeen",
  previousVersionId: "v1",
  previousVersionName: "Ennen",
  sourceRevision: "r",
  createdAt: 1,
  settings: { fps: 30, format: "mp4", quality: "standard", entryFile: "index.html" },
  coverage: "changed-motion-boundaries-partial",
  coverageNotes: ["Nopeus ei ole vakio kohtauksessa scenes/card.html."],
  measured: { width: 1080, height: 1920, fps: 30, frames: 180, duration: 6, audio: false },
  previousMeasured: null,
  video: asset("video.mp4"),
  previousVideo: null,
  frames: [
    { ...asset("first.png"), frame: 0, time: 0 },
    { ...asset("last.png"), frame: 179, time: 5.966 },
  ],
  boundaryFrames: [{ ...asset("boundary-1.png"), frame: 42, time: 1.4, versionId: "v1" }],
  boundaries: [
    {
      motionId: "m1",
      sourceFile: "scenes/card.html",
      target: "#marker",
      change: "removed",
      edge: "start",
      versionId: "v1",
      instance: { hostPath: "index.html", label: "Kortti", index: 1, count: 2 },
      localTime: 1.2,
      masterTime: 1.4,
      withinInstance: true,
      samples: [
        { position: "before", frame: 41, time: 1.3666, status: "outside-video", path: null },
        { position: "at", frame: 42, time: 1.4, status: "captured", path: "boundary-1.png" },
        { position: "after", frame: 43, time: 1.4333, status: "reused", path: "boundary-1.png" },
      ],
    },
  ],
} as unknown as ReviewPackage;

function render(value: ReviewPackage) {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => createRoot(host).render(<AriReviewView projectId="ad" pkg={value} />));
  return host;
}

it("shows partial coverage, both version names and a sample with no image", () => {
  const host = render(pkg);
  const text = host.textContent ?? "";
  expect(text).toContain("Kattavuus on osittainen");
  expect(text).toContain("Nopeus ei ole vakio");
  expect(text).toContain("verrattu versioon Ennen");
  expect(text).toContain("Poistettu liike, alku");
  expect(text).toContain("esiintymä 1/2");
  expect(text).toContain("Kohtauksessa 1,2 s, koko videossa 1,4 s · versio Ennen");
  expect(text).toContain("Ruutu 41 on videon ulkopuolella");
  expect(text).toContain("sama ruutu kuin aiemmassa rajassa");
  expect(text).toContain("ei tarkoita, että kukaan olisi katsonut");
  expect(host.querySelector("[data-testid=ari-review-boundary-count]")?.textContent).toBe(
    "Muuttuneiden liikkeiden rajat: 1",
  );
});

it("serves every asset through the confined package route", () => {
  const host = render(pkg);
  const sources = [...host.querySelectorAll("img, video")].map((el) => el.getAttribute("src"));
  expect(sources).toEqual([
    "/api/ari/projects/ad/review/11111111-1111-4111-8111-111111111111/asset?path=video.mp4",
    "/api/ari/projects/ad/review/11111111-1111-4111-8111-111111111111/asset?path=first.png",
    "/api/ari/projects/ad/review/11111111-1111-4111-8111-111111111111/asset?path=last.png",
    "/api/ari/projects/ad/review/11111111-1111-4111-8111-111111111111/asset?path=boundary-1.png",
    "/api/ari/projects/ad/review/11111111-1111-4111-8111-111111111111/asset?path=boundary-1.png",
  ]);
});

it("names the first-version coverage without inventing a comparison", () => {
  const first = { ...pkg, coverage: "first-version", previousVersionId: null, boundaries: [] };
  const host = render(first as unknown as ReviewPackage);
  expect(coverageText(first as unknown as ReviewPackage)).toContain("Ensimmäinen versio");
  expect(host.textContent).toContain("ei vertailuversiota");
  expect(host.textContent).toContain("Rajaruutuja ei ole tässä paketissa.");
});
