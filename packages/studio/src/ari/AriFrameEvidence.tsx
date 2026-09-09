import { useEffect, useState, useSyncExternalStore } from "react";
import { useStudioPlaybackContext, useStudioShellContext } from "../contexts/StudioContext";
import { studioEditLifecycle } from "../webmcp/writeCoordinator";
import type { AriCallReceipt } from "./agentBridge";
export function AriFrameEvidence({ call }: { call: AriCallReceipt | null }) {
  const { refreshKey } = useStudioPlaybackContext();
  const { editHistory } = useStudioShellContext();
  const edit = useSyncExternalStore(studioEditLifecycle.subscribe, studioEditLifecycle.getSnapshot);
  const revision = `${refreshKey}:${edit.phase === "idle" ? "idle" : edit.callId}:${editHistory.undoLabel}:${editHistory.redoLabel}`;
  const [frame, setFrame] = useState<{ url: string; time: number; revision: string } | null>(null);
  useEffect(() => {
    if (call?.state !== "done" || call.tool !== "studio_frame") return;
    const captured = capturedFrame(call.result);
    if (captured) setFrame({ ...captured, revision });
    // The revision belongs to capture completion; later edits must not re-bind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call]);
  if (!frame) return null;
  const stale = revision !== frame.revision;
  return (
    <div className="mb-3 text-sm">
      <p className={stale ? "text-amber-300" : "text-emerald-200"}>
        {stale ? "Ruutukuva vanhentunut — tarkista uudelleen" : "Tallennettu ruutukuva"} ·{" "}
        {frame.time.toFixed(2)} s
      </p>
      {!stale && (
        <a href={frame.url} target="_blank" rel="noreferrer">
          <img
            src={frame.url}
            alt={`Renderöity ruutu kohdassa ${frame.time.toFixed(2)} sekuntia`}
            className="mt-2 max-h-36 rounded object-contain"
          />
        </a>
      )}
    </div>
  );
}

function capturedFrame(result: unknown) {
  if (typeof result !== "object" || result === null || Reflect.get(result, "ok") !== true)
    return null;
  const url: unknown = Reflect.get(result, "url"),
    time: unknown = Reflect.get(result, "time");
  if (typeof url !== "string" || typeof time !== "number") return null;
  return safeFrameUrl(url) ? { url, time } : null;
}
function safeFrameUrl(url: string) {
  const parsed = new URL(url, window.location.href);
  return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/");
}
