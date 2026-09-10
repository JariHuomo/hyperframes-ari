import { useState, useSyncExternalStore } from "react";
import type { AriAgentBridge } from "./agentBridge";
/** Both structure dialogs wait for the same bridge and expose recoverable failures. */
export function useAriStructureActions(bridge: AriAgentBridge) {
  const bridgeBusy =
    useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)?.state === "running";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function call(tool: string, args: object): Promise<Record<string, unknown>> {
    const value = await bridge.call(tool, args);
    const result =
      value && typeof value === "object" ? Object.fromEntries(Object.entries(value)) : {};
    if (result.ok !== true) throw new Error(String(result.reason ?? "Toiminto epäonnistui."));
    return result;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Toiminto epäonnistui.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, bridgeBusy, error, status, setStatus, call, run };
}
