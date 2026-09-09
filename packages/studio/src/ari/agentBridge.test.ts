import { describe, expect, it, vi } from "vitest";
import { createAriAgentBridge } from "./agentBridge";
import type { ModelContextTool } from "../webmcp/types";

function tool(execute: ModelContextTool["execute"]): ModelContextTool {
  return {
    name: "studio_set_text",
    description: "Write",
    inputSchema: { type: "object" },
    execute,
  };
}

describe("Ari bridge", () => {
  it("uses the real tool receipt unchanged and makes it visible", async () => {
    const receipt = { ok: true, stage: "dispatched", changed: true };
    const execute = vi.fn(async () => receipt);
    const controller = new AbortController();
    const api = createAriAgentBridge([tool(execute)], controller.signal);
    const listener = vi.fn();
    api.subscribe(listener);
    expect(await api.call("studio_set_text", { handle: "x", text: "Hello" })).toBe(receipt);
    expect(execute).toHaveBeenCalledWith(
      { handle: "x", text: "Hello" },
      { signal: controller.signal },
    );
    expect(api.getSnapshot()).toMatchObject({ state: "done", result: receipt });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(api.tools()[0]).not.toHaveProperty("execute");
  });

  it("refuses concurrent commands instead of retargeting a pending write", async () => {
    let finish: (value: object) => void = () => {};
    const api = createAriAgentBridge(
      [
        tool(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        ),
      ],
      new AbortController().signal,
    );
    const first = api.call("studio_set_text", {});
    expect(await api.call("studio_set_text", {})).toMatchObject({ ok: false, kind: "blocked" });
    expect(api.getSnapshot()?.state).toBe("running");
    finish({ ok: true });
    await first;
    expect(api.getSnapshot()?.state).toBe("done");
  });

  it("revokes retained bridge references on disconnect", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => ({ ok: true }));
    const api = createAriAgentBridge([tool(execute)], controller.signal);
    controller.abort();
    expect(await api.call("studio_set_text", {})).toMatchObject({ ok: false, kind: "blocked" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects malformed top-level input and unknown commands without dispatch", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const api = createAriAgentBridge([tool(execute)], new AbortController().signal);
    for (const input of [null, [], "oops", 0]) {
      expect(await api.call("studio_set_text", input)).toMatchObject({
        ok: false,
        kind: "invalid",
      });
    }
    expect(await api.call("invented")).toMatchObject({ ok: false, kind: "invalid" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("releases the single-flight lock after an exception", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk failure"))
      .mockResolvedValueOnce({ ok: true });
    const api = createAriAgentBridge([tool(execute)], new AbortController().signal);
    expect(await api.call("studio_set_text")).toMatchObject({ ok: false, reason: "disk failure" });
    expect(await api.call("studio_set_text")).toEqual({ ok: true });
  });
});
