/** Ari fork: one callable surface for scripts and the visible control panel. */
import type { ModelContextTool } from "../webmcp/types";
import { toolFailure } from "../webmcp/toolResult";

export interface AriCallReceipt {
  id: number;
  tool: string;
  state: "running" | "done";
  result?: unknown;
}
export interface AriAgentBridge {
  version: 1;
  tools: () => Omit<ModelContextTool, "execute">[];
  call: (name: string, input?: unknown) => Promise<unknown>;
  getSnapshot: () => AriCallReceipt | null;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    ariStudio?: AriAgentBridge;
  }
}

export function createAriAgentBridge(
  tools: ModelContextTool[],
  signal: AbortSignal,
): AriAgentBridge {
  let receipt: AriCallReceipt | null = null;
  let busy = false;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const publish = (next: AriCallReceipt) => {
    receipt = next;
    for (const listener of listeners) listener();
  };
  return {
    version: 1,
    tools: () => tools.map(({ execute: _execute, ...description }) => description),
    getSnapshot: () => receipt,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async call(name, input = {}) {
      if (signal.aborted) return toolFailure("blocked", "Studio connection closed; reconnect.");
      if (busy)
        return toolFailure("blocked", "An action is running. Await it before the next action.");
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) return toolFailure("invalid", "Unknown tool. Read ariStudio.tools().");
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return toolFailure("invalid", "Tool input must be a JSON object.");
      }
      busy = true;
      const id = ++sequence;
      publish({ id, tool: name, state: "running" });
      let result: unknown;
      try {
        result = await tool.execute(input, { signal });
      } catch (error) {
        result = toolFailure("failed", error instanceof Error ? error.message : String(error));
      } finally {
        busy = false;
      }
      publish({ id, tool: name, state: "done", result });
      return result;
    },
  };
}
