import { useEffect, useState } from "react";
import { useStudioShellContext } from "../contexts/StudioContext";
import { ariButton } from "./styles";
import { readApprovedRevisions } from "./exportApproval";
function jobRecord(value: unknown): value is {
  id: string;
  status: string;
  filename: string;
  progress: number;
  createdAt: number;
  error?: string;
  sourceRevision?: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const fields = {
    id: "string",
    status: "string",
    filename: "string",
    progress: "number",
    createdAt: "number",
  };
  return Object.entries(fields).every(
    ([key, type]) => key in value && typeof Reflect.get(value, key) === type,
  );
}
export function AriExport({ busy }: { busy: boolean }) {
  const { renderQueue, waitForPendingDomEditSaves, projectId, writeBlockedReason } =
    useStudioShellContext();
  const [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  // D7: a local export is always allowed. What it is CALLED depends on whether
  // the revision it was rendered from carries a standing local approval.
  const [approved, setApproved] = useState<string[]>([]);
  const jobs = renderQueue.jobs.filter(jobRecord);
  // Restored history is newest-first; newly started jobs are appended.
  const latest = jobs.reduce<(typeof jobs)[number] | undefined>(
    (newest, job) => (!newest || job.createdAt > newest.createdAt ? job : newest),
    undefined,
  );
  useEffect(() => {
    let live = true;
    void readApprovedRevisions(projectId).then((rows) => {
      if (live) setApproved(rows);
    });
    return () => {
      live = false;
    };
  }, [projectId, latest?.id, latest?.status]);
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
      <ExportResult
        latest={latest}
        hidden={Boolean(error || preparing || renderQueue.isRendering)}
        projectId={projectId}
        approved={approved}
      />
      {(error || latest?.error || renderQueue.actionError) && (
        <p role="alert" className="text-amber-300">
          {error || latest?.error || renderQueue.actionError}
        </p>
      )}
    </section>
  );
}

function ExportResult({
  latest,
  hidden,
  projectId,
  approved,
}: {
  latest:
    | { status: string; progress: number; sourceRevision?: string; filename: string }
    | undefined;
  hidden: boolean;
  projectId: string;
  approved: string[];
}) {
  if (!latest) return null;
  return (
    <>
      {latest.status === "rendering" && (
        <p role="status">Videota valmistetaan… {Math.round(latest.progress)} %</p>
      )}
      {latest.sourceRevision && (
        <p data-source-revision={latest.sourceRevision}>
          Vientiversio {latest.sourceRevision.slice(0, 12)}. Myöhemmät muutokset tarvitsevat uuden
          viennin.
        </p>
      )}
      {latest.sourceRevision && (
        <p
          data-testid="ari-export-approval"
          data-export-approval={approved.includes(latest.sourceRevision) ? "approved" : "draft"}
        >
          {approved.includes(latest.sourceRevision)
            ? "Hyväksytty versio. Tiedosto on silti paikallinen luonnostiedosto, ei asiakastuotannon julkaisu."
            : "Luonnos, ei hyväksytty. Tiedosto on paikallinen luonnostiedosto, ei asiakastuotannon julkaisu."}
        </p>
      )}
      {!hidden && latest.status === "complete" && (
        <a
          className={`${ariButton} flex items-center justify-center`}
          href={`/api/projects/${encodeURIComponent(projectId)}/renders/file/${encodeURIComponent(latest.filename)}`}
          download={latest.filename}
        >
          Lataa valmis MP4
        </a>
      )}
    </>
  );
}
