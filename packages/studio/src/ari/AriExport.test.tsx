// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AriExport } from "./AriExport";
import { installReactActEnvironment } from "../hooks/domSelectionTestHarness";
installReactActEnvironment();
const context = vi.hoisted(() => ({
  projectId: "demo",
  writeBlockedReason: null,
  waitForPendingDomEditSaves: vi.fn(async () => {}),
  renderQueue: {
    jobs: [
      {
        id: "old",
        status: "complete",
        filename: "old.mp4",
        progress: 100,
        createdAt: 1,
        sourceRevision: "old-revision",
      },
    ],
    isRendering: false,
    actionError: null,
    startRender: vi.fn(async () => {}),
  },
}));
vi.mock("../contexts/StudioContext", () => ({ useStudioShellContext: () => context }));
it("waits before rendering, hides an older download on failure, and allows retry", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<AriExport busy={false} />));
  expect(host.textContent).toContain("old-revision");
  let release = () => {};
  context.waitForPendingDomEditSaves.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => host.querySelector("button")!.click());
  expect(context.renderQueue.startRender).not.toHaveBeenCalled();
  expect(host.querySelector("a")).toBeNull();
  context.renderQueue.startRender.mockRejectedValueOnce(new Error("Vienti epäonnistui"));
  await act(async () => release());
  expect(host.querySelector("[role=alert]")?.textContent).toContain("Vienti epäonnistui");
  expect(host.querySelector("a")).toBeNull();
  await act(async () => host.querySelector("button")!.click());
  expect(context.renderQueue.startRender).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

/** D7: a local export always works. Whether it is a draft is what changes. */
it("calls the export a draft until the exported revision carries a standing approval", async () => {
  const approved: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ approvedRevisions: approved }) })),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<AriExport busy={false} />));
  const receipt = () => host.querySelector("[data-testid=ari-export-approval]");
  expect(receipt()?.getAttribute("data-export-approval")).toBe("draft");
  expect(receipt()?.textContent).toContain("Luonnos, ei hyväksytty");
  // The button is never disabled by the missing approval.
  expect(host.querySelector("button")!.disabled).toBe(false);
  approved.push("old-revision");
  act(() => root.unmount());
  const second = createRoot(host);
  await act(async () => second.render(<AriExport busy={false} />));
  expect(receipt()?.getAttribute("data-export-approval")).toBe("approved");
  expect(receipt()?.textContent).toContain("ei asiakastuotannon julkaisu");
  act(() => second.unmount());
  vi.unstubAllGlobals();
});
