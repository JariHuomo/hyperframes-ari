// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AriCreativeFeedback } from "./AriCreativeFeedback";
const mocks = vi.hoisted(() => ({
  quote: vi.fn(),
  run: vi.fn(),
  read: vi.fn(),
  options: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({
    projectId: "p",
    waitForPendingDomEditSaves: async () => {},
    writeBlockedReason: null,
  }),
}));
vi.mock("../utils/projectVersions", () => ({
  projectVersions: () => ({
    list: async () => ({ revision: "r", versions: [{ id: "v", revision: "r" }] }),
  }),
}));
vi.mock("../utils/reviewPackages", () => ({
  reviewPackages: () => ({
    list: async () => [],
    prepare: mocks.prepare,
    assetUrl: (_id: string, path: string) => `/asset/${path}`,
  }),
}));
vi.mock("../utils/creativeFeedback", () => ({
  creativeFeedback: () => ({
    quote: mocks.quote,
    run: mocks.run,
    read: mocks.read,
    options: mocks.options,
  }),
}));
let clean = () => {};
afterEach(() => {
  clean();
  vi.clearAllMocks();
});
async function mount() {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  mocks.prepare.mockResolvedValue({ id: "pkg", overview: { samples: Array.from({ length: 12 }) } });
  mocks.read.mockResolvedValue([]);
  mocks.options.mockResolvedValue([
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
  mocks.quote.mockResolvedValue({
    id: "q",
    reviewer: "muse-spark",
    label: "Muse Spark 1.3",
    model: "muse-spark-1.3",
    video: true,
    maxUsd: 1.6,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  clean = () => {
    act(() => root.unmount());
    host.remove();
  };
  await act(async () => {
    root.render(<AriCreativeFeedback busy={false} />);
  });
  return host;
}
async function click(host: HTMLElement, label: string) {
  const b = [...host.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label));
  expect(b).toBeTruthy();
  await act(async () => b!.click());
}
it("one PNG click prepares the whole timeline without requesting or running AI", async () => {
  const host = await mount();
  await click(host, "Koko mainos · PNG");
  expect(mocks.prepare).toHaveBeenCalledWith("v", null);
  expect(host.querySelector('a[download="mainoksen-kuvakooste.png"]')?.getAttribute("href")).toBe(
    "/asset/overview.png",
  );
  expect(mocks.quote).not.toHaveBeenCalled();
  expect(mocks.run).not.toHaveBeenCalled();
});
it("names both reviewers with their bound prices before a separate explicit paid action", async () => {
  const host = await mount();
  await click(host, "Pyydä AI-palaute");
  // Both offers are visible, and neither is quoted or run until one is chosen.
  expect(host.textContent).toContain("Gemini 3.8 Flash · enintään 1,10 USD");
  expect(host.textContent).toContain("Muse Spark 1.3 · enintään 1,60 USD");
  expect(mocks.quote).not.toHaveBeenCalled();
  await click(host, "Muse Spark 1.3 · enintään");
  expect(mocks.quote).toHaveBeenCalledExactlyOnceWith("muse-spark");
  expect(host.textContent).toContain("palveluun Muse Spark 1.3");
  expect(host.textContent).toContain("1,60 USD");
  expect(mocks.run).not.toHaveBeenCalled();
  mocks.run.mockRejectedValue(new Error("Palvelu ei ole käytettävissä."));
  await click(host, "Hyväksy hinta ja arvioi mainos");
  expect(mocks.run).toHaveBeenCalledExactlyOnceWith("q");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ei ole käytettävissä");
  expect(host.querySelector('a[download="mainoksen-kuvakooste.png"]')).toBeTruthy();
});
