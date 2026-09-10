import { AriResumeWork } from "./AriResumeWork";
import { useState } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { AriStructureDialog } from "./AriStructureDialog";
import { ariButton as button } from "./styles";
import { notebookObject, notebookResult, notebookRows } from "./notebookView";
import { AriNotebookRepair } from "./AriNotebookRepair";
import { AriNotebookStop } from "./AriNotebookStop";
import { AriNotebookApproval } from "./AriNotebookApproval";
import { ariField as field } from "./AriNotebookFields";
export function AriNotebook({
  bridge,
  projectId,
}: {
  bridge: AriAgentBridge;
  projectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={button} disabled={!projectId} onClick={() => setOpen(true)}>
        Muistikirja
      </button>
      {open && <NotebookDialog key={projectId} bridge={bridge} onClose={() => setOpen(false)} />}
    </>
  );
}
function NotebookDialog({ bridge, onClose }: { bridge: AriAgentBridge; onClose: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [goal, setGoal] = useState(""),
    [texts, setTexts] = useState("");
  const [taskText, setTaskText] = useState("");
  const [author, setAuthor] = useState(""),
    [authorType, setAuthorType] = useState("human");
  const [coverage, setCoverage] = useState(""),
    [observation, setObservation] = useState("");
  const [images, setImages] = useState<Record<string, unknown>[]>([]);
  const [packages, setPackages] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function read(preserve: boolean) {
    setBusy(true);
    setMessage("Odota hetki…");
    try {
      const result = notebookResult(await bridge.call("studio_notebook", {}));
      const shelf = notebookResult(await bridge.call("studio_images", {}));
      // The approval panel decides about a prepared review package, so the same
      // read brings the packages this project already has.
      const prepared = notebookResult(await bridge.call("studio_list_review_packages", {}));
      setData(result);
      setImages(notebookRows(shelf.assets));
      setPackages(notebookRows(prepared.packages).filter((item) => item.readable === true));
      if (!preserve) {
        const book = notebookObject(result.notebook);
        setGoal(String(book.goal));
        setTexts(String(book.texts));
        setSelected(notebookRows(book.assets).map((item) => String(item.path)));
      }
      setMessage(preserve ? "Tilanne päivitetty. Luonnoksesi säilyi." : "Muistikirja avattu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Luku epäonnistui.");
    } finally {
      setBusy(false);
    }
  }
  async function save(input: object) {
    if (!data) return;
    setBusy(true);
    setMessage("Odota hetki…");
    try {
      const result = notebookResult(
        await bridge.call("studio_update_notebook", { ...input, expectedToken: data.token }),
      );
      setData(result);
      setMessage("Muistikirja tallennettu. Mainoksen sisältö ei muuttunut.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tallennus epäonnistui.");
    } finally {
      setBusy(false);
    }
  }
  const book = data ? notebookObject(data.notebook) : null;
  return (
    <AriStructureDialog label="Muistikirja" title="Työn muistikirja" busy={busy} onClose={onClose}>
      <p className="my-2 text-sm">
        Sovittu sisältö ja käsin kirjatut tehtävät. Tehtävän merkintä ei todista mainoksen
        muokkausta.
      </p>
      <button className={button} disabled={busy} onClick={() => void read(Boolean(data))}>
        {data ? "Päivitä tilanne" : "Avaa muistikirja"}
      </button>
      <p role="status" className="min-h-12 py-2">
        {message}
      </p>
      <AriResumeWork bridge={bridge} />
      {book && (
        <div className="space-y-5">
          <section aria-label="Sovittu sisältö">
            <label>
              Tavoite
              <textarea className={field} value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <label>
              Sovitut tekstit
              <textarea
                className={field}
                value={texts}
                onChange={(e) => setTexts(e.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={busy}
              onClick={() => void save({ action: "brief", goal, texts })}
            >
              Tallenna tavoite ja tekstit
            </button>
          </section>
          <section aria-label="Valitut aineistot">
            <h3>Valitut aineistot</h3>
            {images.map((item) => (
              <label className="block" key={String(item.path)}>
                <input
                  type="checkbox"
                  checked={selected.includes(String(item.path))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, String(item.path)]
                        : selected.filter((path) => path !== item.path),
                    )
                  }
                />{" "}
                {String(item.name ?? item.path)}
              </label>
            ))}
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                void save({
                  action: "assets",
                  assets: images
                    .filter((item) => selected.includes(String(item.path)))
                    .map((item) => ({ path: item.path, checksum: item.checksum })),
                })
              }
            >
              Tallenna aineistovalinta
            </button>
          </section>
          <section aria-label="Tehtävät">
            <label>
              Uusi tehtävä
              <input
                className={field}
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={busy || !taskText.trim()}
              onClick={() => void save({ action: "task", text: taskText })}
            >
              Lisää tehtävä
            </button>
            <div className="grid grid-cols-3 gap-4">
              {[
                ["done", "Tehty"],
                ["active", "Kesken"],
                ["next", "Seuraavaksi"],
              ].map(([status, title]) => (
                <section key={status}>
                  <h3>{title}</h3>
                  {notebookRows(book.tasks)
                    .filter((item) => item.status === status)
                    .map((item) => (
                      <div key={String(item.id)}>
                        <p>{String(item.text)}</p>
                        <select
                          aria-label={`Tehtävän tila: ${item.text}`}
                          className={field}
                          disabled={busy}
                          value={String(item.status)}
                          onChange={(e) =>
                            void save({
                              action: "task_status",
                              id: item.id,
                              status: e.target.value,
                            })
                          }
                        >
                          <option value="next">Seuraavaksi</option>
                          <option value="active">Kesken</option>
                          <option value="done">Tehty</option>
                        </select>
                      </div>
                    ))}
                </section>
              ))}
            </div>
          </section>
          {data && (
            <>
              <AriNotebookStop
                key={`stop-${String(data.token)}`}
                data={data}
                busy={busy}
                save={save}
              />
              <AriNotebookRepair key={String(data.token)} data={data} busy={busy} save={save} />
              <AriNotebookApproval
                key={`approval-${String(data.token)}`}
                data={data}
                packages={packages}
                busy={busy}
                save={save}
              />
            </>
          )}
          <section aria-label="Havainnot">
            <h3>Havainnot</h3>
            <label>
              Havainnon tekijä
              <input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
            <label>
              Tekijän rooli
              <select
                className={field}
                value={authorType}
                onChange={(e) => setAuthorType(e.target.value)}
              >
                <option value="human">Ihmisen kirjaama</option>
                <option value="external_agent">Ulkoisen agentin kirjaama</option>
                <option value="technical">Tekninen tarkistus</option>
              </select>
            </label>
            <label>
              Katsottu kattavuus
              <input
                className={field}
                value={coverage}
                onChange={(e) => setCoverage(e.target.value)}
              />
            </label>
            <label>
              Havainto
              <textarea
                className={field}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </label>
            <button
              className={button}
              disabled={busy || !author.trim() || !coverage.trim() || !observation.trim()}
              onClick={() =>
                void save({
                  action: "observation",
                  author,
                  authorType,
                  coverage,
                  text: observation,
                  revision: data?.revision,
                })
              }
            >
              Kirjaa havainto
            </button>
            {notebookRows(book.observations).map((item) => (
              <article className="my-3 border-t border-neutral-600 pt-2" key={String(item.id)}>
                <strong>
                  {String(item.author)} ·{" "}
                  {item.authorType === "technical"
                    ? "Tekninen tarkistus"
                    : item.authorType === "human"
                      ? "Ihmisen kirjaama"
                      : "Ulkoisen agentin kirjaama"}
                </strong>
                <p>{String(item.text)}</p>
                <p>
                  Kattavuus: {String(item.coverage)} · {String(item.createdAt)}
                </p>
                <p>
                  {item.revision === data?.revision
                    ? "Luettua sisältöversiota koskeva havainto"
                    : "Aiemman version havainto — tarkista uudelleen"}
                </p>
                <details>
                  <summary>Katsottu versio</summary>
                  {String(item.revision)}
                </details>
              </article>
            ))}
          </section>
        </div>
      )}
    </AriStructureDialog>
  );
}
