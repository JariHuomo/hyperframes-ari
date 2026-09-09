import { useEffect, useState } from "react";
import type { ModelContextTool } from "../webmcp/types";
import { readStudioUiPreferences } from "../utils/studioUiPreferences";
import { createAriAgentBridge, type AriAgentBridge } from "./agentBridge";

export function useAriAgentBridge(tools: readonly ModelContextTool[]): AriAgentBridge | null {
  const [bridge, setBridge] = useState<AriAgentBridge | null>(null);
  useEffect(() => {
    if (readStudioUiPreferences().agentToolsEnabled === false) return;
    const controller = new AbortController();
    const next = createAriAgentBridge([...tools], controller.signal);
    window.ariStudio = next;
    setBridge(next);
    return () => {
      controller.abort();
      if (window.ariStudio === next) delete window.ariStudio;
    };
  }, [tools]);
  return bridge;
}
