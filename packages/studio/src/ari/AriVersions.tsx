import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { AriAgentBridge } from "./agentBridge";
import { useAriStructureActions } from "./useAriStructureActions";
import { versionComparison, type VersionPreview } from "./versionComparison";
import { ariButton } from "./styles";

interface Option {
  id: string;
  name: string;
}
export function AriVersions({
  bridge,
  projectId,
}: {
  bridge: AriAgentBridge;
  projectId: string | null;
}) {
  const [open, setOpen] = useState(false),
    [options, setOptions] = useState<Option[]>([]);
  const [name, setName] = useState("Tarkistusversio"),
    [before, setBefore] = useState(""),
    [after, setAfter] = useState("");
  const actions = useAriStructureActions(bridge);
  const comparison = useSyncExternalStore(
    versionComparison.subscribe,
    versionComparison.getSnapshot,
  );
  const [playbackError, setPlaybackError] = useState("");
  async function list() {
    const result = await actions.call("studio_versions", {});
    const rows = Array.isArray(result.versions) ? result.versions : [];
    const next = rows.map((v) => ({
      id: String(v.id),
      name: String(v.name ?? `Muutos ${v.id.slice(0, 8)}`),
    }));
    setOptions(next);
    setBefore(next.at(-2)?.id ?? "");
    setAfter(next.at(-1)?.id ?? "");
  }
  function show() {
    setOpen(true);
    void actions.run(list);
  }
  useEffect(() => {
    setOpen(false);
    versionComparison.close();
  }, [projectId]);
  useEffect(() => {
    const showVersions = () => show();
    window.addEventListener("ari-open-versions", showVersions);
    return () => window.removeEventListener("ari-open-versions", showVersions);
  });
  useEffect(() => {
    if (versionComparison.getSnapshot()) {
      setOpen(true);
      setPlaybackError("");
    }
  }, [comparison?.before.version.id, comparison?.after.version.id]);
  useEffect(() => {
    const current = versionComparison.getSnapshot();
    if (!current?.playing) return;
    const start = performance.now(),
      time = current.time,
      end = current.duration;
    let frame = 0;
    function tick(now: number) {
      const next = Math.min(end, time + (now - start) / 1000);
      versionComparison.advance(next);
      if (versionComparison.getSnapshot()?.playing) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [comparison?.playing, comparison?.before.version.id]);
  const close = () => {
    versionComparison.close();
    setOpen(false);
  };
  return (
    <>
      <button type="button" className={ariButton} onClick={show}>
        Versiot / vertailu
      </button>
      {open &&
        createPortal(
          <dialog
            open
            aria-label="Versiovertailu"
            className="fixed inset-0 z-50 m-auto max-h-[96vh] w-[min(1000px,96vw)] overflow-auto rounded-xl border border-neutral-500 bg-neutral-900 p-4 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2>Vertaa muutosta</h2>
              <button type="button" className={ariButton} onClick={close}>
                Sulje vertailu
              </button>
            </div>
            <fieldset
              disabled={actions.busy || actions.bridgeBusy}
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <label>
                Version nimi
                <input
                  aria-label="Version nimi"
                  className="block bg-neutral-800 p-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={ariButton}
                onClick={() =>
                  void actions.run(async () => {
                    await actions.call("studio_save_version", { name });
                    await list();
                    actions.setStatus("Tarkistusversio tallennettu");
                  })
                }
              >
                Tallenna tarkistusversio
              </button>
              <VersionSelect
                label="Edellinen versio"
                value={before}
                options={options}
                change={setBefore}
              />
              <VersionSelect
                label="Nykyinen versio"
                value={after}
                options={options}
                change={setAfter}
              />
              <button
                type="button"
                className={ariButton}
                disabled={!before || !after}
                onClick={() =>
                  void actions.run(async () => {
                    await actions.call("studio_compare_versions", {
                      beforeId: before,
                      afterId: after,
                    });
                  })
                }
              >
                Avaa vertailu
              </button>
            </fieldset>
            {comparison && (
              <>
                <p className="my-2 text-sm">
                  Yhteinen aikaväli 0–{comparison.duration.toLocaleString("fi-FI")} s (lyhyemmän
                  version loppuun). Kuvasuhde {comparison.before.width}:{comparison.before.height}.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[comparison.before, comparison.after].map((preview, index) => (
                    <FrozenFrame
                      key={preview.version.id}
                      preview={preview}
                      time={comparison.time}
                      label={index === 0 ? "Edellinen" : "Nykyinen"}
                      onError={(reason) => {
                        setPlaybackError(reason);
                        versionComparison.play(false);
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    className={ariButton}
                    disabled={Boolean(playbackError)}
                    onClick={() => versionComparison.play(!comparison.playing)}
                  >
                    {comparison.playing ? "Pysäytä vertailu" : "Toista vertailu"}
                  </button>
                  <label className="flex flex-1 gap-2">
                    Vertailuaika
                    <input
                      aria-label="Vertailuaika"
                      type="range"
                      className="flex-1"
                      min="0"
                      max={comparison.duration}
                      step="0.01"
                      value={comparison.time}
                      onChange={(e) => {
                        versionComparison.seek(Number(e.target.value));
                      }}
                    />
                  </label>
                  <output>
                    {comparison.time.toLocaleString("fi-FI", { maximumFractionDigits: 2 })} s
                  </output>
                  <button type="button" className={ariButton} onClick={close}>
                    Säilytä muutos
                  </button>
                  <button
                    type="button"
                    className={ariButton}
                    disabled={actions.busy}
                    onClick={() =>
                      void actions.run(async () => {
                        const receipt = await actions.call("studio_comparison", {
                          action: "restore",
                        });
                        actions.setStatus(
                          receipt.previewReady
                            ? "Edellinen versio palautettu"
                            : "Versio palautettu. Esikatselu ei valmistunut; lähde on tallennettu.",
                        );
                      })
                    }
                  >
                    Palauta edellinen
                  </button>
                </div>
              </>
            )}
            <p role="status" className="min-h-6">
              {actions.status}
            </p>
            {(actions.error || playbackError) && (
              <p role="alert" className="text-amber-300">
                {actions.error || playbackError}
              </p>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
function VersionSelect({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string;
  options: Option[];
  change: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        className="block max-w-52 bg-neutral-800 p-2"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Valitse versio</option>
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function FrozenFrame({
  preview,
  time,
  label,
  onError,
}: {
  preview: VersionPreview;
  time: number;
  label: string;
  onError: (reason: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    function message(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.ariVersion === "ready") setReady(true);
      if (event.data?.ariVersion === "error") {
        setFailed(true);
        onError(String(event.data.reason));
      }
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, [onError]);
  useEffect(() => {
    if (ready) frame.current?.contentWindow?.postMessage({ ariVersion: "seek", time }, "*");
  }, [ready, time]);
  return (
    <figure>
      <figcaption>
        {label}: {preview.version.name ?? "Tallennettu muutos"}
      </figcaption>
      <iframe
        ref={frame}
        title={`${label} versio`}
        sandbox="allow-scripts"
        srcDoc={preview.html}
        style={{
          width: `calc(min(48vh, 410px) * ${preview.width / preview.height})`,
          maxWidth: "100%",
          margin: "0 auto",
          display: "block",
          height: "min(48vh, 410px)",
          visibility: failed ? "hidden" : "visible",
        }}
      />
      <p className="text-xs">{failed ? "Toisto estynyt" : ready ? "Valmis" : "Valmistellaan…"}</p>
    </figure>
  );
}
