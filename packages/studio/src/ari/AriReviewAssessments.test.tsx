// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AriReviewAssessments } from "./AriReviewAssessments";
import type { ReviewPackage } from "../utils/reviewPackages";
import { fillField as fill } from "./ariTestInput";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
afterEach(() => {
  document.body.innerHTML = "";
});

const pkg = {
  id: "11111111-1111-4111-8111-111111111111",
  measured: { width: 1080, height: 1920, fps: 30, frames: 180, duration: 6, audio: false },
  boundaries: [{ motionId: "m1", edge: "start", masterTime: 1.4 }],
} as unknown as ReviewPackage;

const view = (overrides: object = {}) => ({
  ok: true,
  token: "t1",
  revision: "r1",
  packages: [
    {
      packageId: pkg.id,
      readable: true,
      sourceChanged: false,
      categories: [
        { category: "message", status: "missing", assessments: [] },
        { category: "layout", status: "missing", assessments: [] },
        {
          category: "motion",
          status: "stale",
          assessments: [
            {
              id: "a1",
              reviewer: "Testiajo",
              reviewerType: "test_data",
              verdict: "fix",
              createdAt: "2026-09-10T00:00:00.000Z",
              text: "Liike alkaa myöhään.",
              wholeVideoWatched: true,
              checkedBoundaries: [0],
              packageCoverage: "changed-motion-boundaries",
              stale: true,
              staleReasons: ["source_changed"],
            },
          ],
        },
        { category: "audio", status: "missing", assessments: [] },
      ],
      ...overrides,
    },
  ],
});

function render(call: (name: string, input: object) => Promise<Record<string, unknown>>) {
  const host = document.createElement("div");
  document.body.append(host);
  act(() => createRoot(host).render(<AriReviewAssessments call={call} busy={false} pkg={pkg} />));
  return host;
}
const clickText = async (host: HTMLElement, label: string) => {
  const target = [...host.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(label),
  )!;
  await act(async () => target.click());
};

it("shows an unassessed category as missing and a silent render as a measurement", async () => {
  const call = vi.fn(async () => view() as unknown as Record<string, unknown>);
  const host = render(call);
  // The measurement is on screen before anything is read, and says what it is not.
  expect(host.querySelector("[data-testid=ari-review-measured]")!.textContent).toContain(
    "Tämä on mittaus, ei ääniarvio",
  );
  await clickText(host, "Avaa arviot");
  expect(call).toHaveBeenCalledWith("studio_read_review_assessments", {});
  const audio = host.querySelector("[data-testid=ari-assessment-audio]")!.textContent!;
  expect(audio).toContain("Ääni: puuttuu");
  expect(audio).toContain("Puuttuva arvio ei ole hyväksyntä.");
  const motion = host.querySelector("[data-testid=ari-assessment-motion]")!.textContent!;
  expect(motion).toContain("Liike: vanhentunut");
  expect(motion).toContain("Testiaineisto");
  expect(motion).toContain("mainoksen lähde on muuttunut arvion jälkeen");
  expect(motion).toContain("Arvio säilyy historiassa");
  expect(motion).toContain("tarkastetut rajat 1");
});

it("records one category with its reviewer, coverage and the notebook token", async () => {
  const call = vi.fn(async () => view() as unknown as Record<string, unknown>);
  const host = render(call);
  await clickText(host, "Avaa arviot");
  await act(async () => fill(host, '[aria-label="Osa-alue"]', "audio"));
  await act(async () => fill(host, '[aria-label="Tekijän rooli"]', "test_data"));
  await act(async () => fill(host, "fieldset input:not([type=checkbox])", "Testiajo"));
  await act(async () => fill(host, "fieldset textarea", "Ääniraita puuttuu kokonaan."));
  await clickText(host, "Kirjaa arvio");
  expect(call).toHaveBeenLastCalledWith("studio_record_review_assessment", {
    packageId: pkg.id,
    expectedToken: "t1",
    category: "audio",
    reviewer: "Testiajo",
    reviewerType: "test_data",
    verdict: "ok",
    text: "Ääniraita puuttuu kokonaan.",
    wholeVideoWatched: false,
    checkedBoundaries: [],
  });
  expect(host.querySelector("[data-testid=ari-assessment-status]")!.textContent).toContain(
    "Mainoksen sisältö ei muuttunut",
  );
});

it("reports a refused save without losing what is already recorded", async () => {
  const call = vi
    .fn<(name: string, input: object) => Promise<Record<string, unknown>>>()
    .mockResolvedValueOnce(view() as unknown as Record<string, unknown>)
    .mockRejectedValueOnce(new Error("Muistikirja muuttui. Päivitä tilanne; luonnoksesi säilyy."));
  const host = render(call);
  await clickText(host, "Avaa arviot");
  await act(async () => fill(host, "fieldset input:not([type=checkbox])", "Testiajo"));
  await act(async () => fill(host, "fieldset textarea", "Perustelu."));
  await clickText(host, "Kirjaa arvio");
  expect(host.querySelector("[data-testid=ari-assessment-status]")!.textContent).toContain(
    "Muistikirja muuttui",
  );
  expect(host.querySelector("[data-testid=ari-assessment-motion]")!.textContent).toContain(
    "Liike: vanhentunut",
  );
});
