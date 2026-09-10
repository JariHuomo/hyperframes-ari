import { useState } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { ariButton } from "./styles";
import { notebookResult, notebookRows, notebookObject } from "./notebookView";

export function AriResumeWork({ bridge }: { bridge: AriAgentBridge }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function resume() {
    setBusy(true);
    try {
      const result = notebookResult(await bridge.call("studio_resume_work", {}));
      setRows(notebookRows(result.operations));
      setMessage("Tallennetut tulokset tarkistettu. Muutoksia ei toistettu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tuloksia ei voitu selvittää.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Tallennetut toiminnot">
      <button className={ariButton} disabled={busy} onClick={() => void resume()}>
        Jatka työtä
      </button>
      <p role="status">{message}</p>
      <p className="text-sm">
        Tässä näkyvät seuratut sisältömuutokset. Muita toimintoja ei toisteta automaattisesti.
      </p>
      <details>
        <summary>Mitä jatkaminen kattaa?</summary>
        <p>
          Elementtien ja kohtausten rakenne, tavallinen teksti ja ulkoasu sekä liikkeen lisäys,
          ajoitus, tuntuma ja poisto.
        </p>
        <p>
          Kuvatuonnit, version palautus, muotoiltu teksti ja liikkeeseen sidottu paikan siirto eivät
          kuulu tähän seurantaan. Tarkista niiden tulos erikseen.
        </p>
      </details>
      {rows.map((row) => (
        <article key={String(row.id)} className="my-2 border-t border-neutral-600 pt-2">
          <strong>Mainoksen muutos</strong>
          <p>
            {row.status === "completed"
              ? "Tehty — tallennus vahvistettu"
              : "Kesken — tulos epäselvä, älä toista muutosta"}
          </p>
          {row.changedSince === true && (
            <p>
              Mainoksen sisältö on muuttunut tämän toiminnon jälkeen. Tarkista nykyinen työ ennen
              jatkamista.
            </p>
          )}
          <details>
            <summary>Tallennuksen tiedot</summary>
            <p>Toiminto: {String(row.id)}</p>
            {row.receipt !== null && <p>Versio: {String(notebookObject(row.receipt).versionId)}</p>}
          </details>
        </article>
      ))}
    </section>
  );
}
