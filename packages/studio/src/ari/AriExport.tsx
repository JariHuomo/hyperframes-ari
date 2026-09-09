import { useState } from "react";
import { useStudioShellContext } from "../contexts/StudioContext";
import { ariButton } from "./styles";
function jobRecord(value: unknown): value is {
  id: string;
  status: string;
  filename: string;
  progress: number;
  createdAt: number;
  error?: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "status" in value &&
    typeof value.status === "string" &&
    "filename" in value &&
    typeof value.filename === "string" &&
    "progress" in value &&
    typeof value.progress === "number" &&
    "createdAt" in value &&
    typeof value.createdAt === "number"
  );
}
export function AriExport({ busy }: { busy: boolean }) {
  const { renderQueue, waitForPendingDomEditSaves, projectId, writeBlockedReason } =
    useStudioShellContext();
  const [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  const jobs = renderQueue.jobs.filter(jobRecord);
  // Restored history is newest-first; newly started jobs are appended.
  const latest = jobs.reduce<(typeof jobs)[number] | undefined>(
    (newest, job) => (!newest || job.createdAt > newest.createdAt ? job : newest),
    undefined,
  );
  async function start() {
    setPreparing(true);
    setError("");
    try {
      await waitForPendingDomEditSaves();
      await renderQueue.startRender({
        format: "mp4",
        quality: "high",
        resolution: "auto",
        fps: 30,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(false);
    }
  }
  return (
    <section
      aria-label="Videon vienti"
      className="mb-4 space-y-2 rounded border border-emerald-700 p-3 text-sm"
    >
      <button
        className={`${ariButton} w-full bg-emerald-900`}
        disabled={busy || preparing || renderQueue.isRendering || Boolean(writeBlockedReason)}
        onClick={() => void start()}
      >
        {preparing ? "Valmistellaan…" : "Vie video · MP4"}
      </button>
      {latest?.status === "rendering" && (
        <p role="status">Videota valmistetaan… {Math.round(latest.progress)} %</p>
      )}
      {!preparing && !renderQueue.isRendering && latest?.status === "complete" && (
        <a
          className={`${ariButton} flex items-center justify-center`}
          href={`/api/projects/${encodeURIComponent(projectId)}/renders/file/${encodeURIComponent(latest.filename)}`}
          download={latest.filename}
        >
          Lataa valmis MP4
        </a>
      )}
      {(error || latest?.error || renderQueue.actionError) && (
        <p role="alert" className="text-amber-300">
          {error || latest?.error || renderQueue.actionError}
        </p>
      )}
    </section>
  );
}
