import { useState } from "react";
import { ariButton as button } from "./styles";
import { notebookObject, notebookRows } from "./notebookView";
import { ariField as field, ActorTypeSelect } from "./AriNotebookFields";

/**
 * Ari · Pysäytä työ (D6)
 *
 * The button only writes the notebook. The refusal itself happens on the
 * shared write path in the server, so an agent tool meets the same stop.
 */
export function AriNotebookStop({
  data,
  busy,
  save,
}: {
  data: Record<string, unknown>;
  busy: boolean;
  save: (input: object) => Promise<void>;
}) {
  const repair = notebookObject(data.repair);
  const stop = repair.stop === null ? null : notebookObject(repair.stop);
  const [by, setBy] = useState(""),
    [byType, setByType] = useState("human"),
    [reason, setReason] = useState("");
  const action = stop ? "resume_work" : "stop_work";
  return (
    <section aria-label="Työn pysäytys" className="space-y-3">
      <h3>Työn pysäytys</h3>
      <p role="status" data-testid="ari-stop-state">
        {stop
          ? `Työ on pysäytetty: ${String(stop.by)} · ${String(stop.reason)} · ${String(stop.createdAt)}`
          : "Työ on käynnissä."}
      </p>
      <p className="text-sm">
        Pysäytys estää seuraavan seuratun lähdemuutoksen sekä näistä painikkeista että agentin
        toiminnoista. Jo aloitettu tallennus kirjoitetaan loppuun, joten mikään muutos ei jää
        puolitiehen. Muistikirja, havainnot, arviot ja hyväksynnät ovat käytettävissä myös
        pysäytettynä — ne eivät ole lähdemuutoksia.
      </p>
      <label className="block">
        {stop ? "Jatkamisen kirjaaja" : "Pysäytyksen kirjaaja"}
        <input className={field} value={by} onChange={(event) => setBy(event.target.value)} />
      </label>
      <ActorTypeSelect label="Kirjaajan rooli" value={byType} onChange={setByType} busy={busy} />
      <label className="block">
        Syy
        <input
          className={field}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button
        className={button}
        // "Jatka työtä" is also the name of the operation-resume control above,
        // so this one carries an accessible name that says which one it is.
        aria-label={stop ? "Jatka pysäytettyä työtä" : "Pysäytä työ"}
        disabled={busy || !by.trim() || !reason.trim()}
        onClick={() => void save({ action, by, byType, reason })}
      >
        {stop ? "Jatka työtä" : "Pysäytä työ"}
      </button>
      <StopHistory entries={notebookRows(repair.stopHistory)} />
    </section>
  );
}
function StopHistory({ entries }: { entries: Record<string, unknown>[] }) {
  return (
    <section aria-label="Pysäytyshistoria">
      <h4>Pysäytyshistoria</h4>
      {entries.length === 0 && <p>Työtä ei ole pysäytetty.</p>}
      {entries
        .slice()
        .reverse()
        .map((entry) => (
          <p key={String(entry.id)}>
            {entry.action === "stop" ? "Pysäytetty" : "Jatkettu"} · {String(entry.by)} ·{" "}
            {String(entry.reason)} · {String(entry.createdAt)}
          </p>
        ))}
    </section>
  );
}
