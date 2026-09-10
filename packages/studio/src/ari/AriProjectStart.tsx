import { useEffect, useMemo } from "react";
import { projectTools } from "../webmcp/tools/projectTools";
import { getModelContext } from "../webmcp/types";
import { loadModelContextPolyfill } from "../webmcp/polyfill";
import { registerStudioTools } from "../webmcp/registrar";
import { useAriAgentBridge } from "./useAriAgentBridge";
import { AriProjects } from "./AriProjects";

/** Creation is also reachable when the local workspace has no project yet. */
export function AriProjectStart() {
  const tools = useMemo(() => projectTools(() => null), []);
  const bridge = useAriAgentBridge(tools);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const context = getModelContext() ?? (await loadModelContextPolyfill());
      if (context && !controller.signal.aborted)
        await registerStudioTools(context, tools, controller.signal);
    })();
    return () => controller.abort();
  }, [tools]);
  return (
    <div className="text-neutral-100">
      {bridge && <AriProjects bridge={bridge} projectId={null} />}
    </div>
  );
}
