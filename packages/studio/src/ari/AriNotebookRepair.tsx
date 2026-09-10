import { useState } from "react";
import { ariButton as button } from "./styles";
import { notebookObject, notebookRows } from "./notebookView";
import { ariField as field } from "./AriNotebookFields";

/**
 * Ari · approved content and repair rounds (D5)
 *
 * These controls only edit the notebook. The refusal itself happens on the
 * shared write path in the server, so an agent tool meets exactly the same
 * limit as this panel does.
 */
export function AriNotebookRepair({
  data,
  busy,
  save,
}: {
  data: Record<string, unknown>;
  busy: boolean;
  save: (input: object) => Promise<void>;
}) {
  const book = notebookObject(data.notebook);
  const repair = notebookObject(data.repair);
  const tasks = notebookRows(book.tasks);
  const rounds = notebookRows(repair.tasks);
  const [limit, setLimit] = useState(String(repair.limit ?? 2));
  const [label, setLabel] = useState(""),
    [locked, setLocked] = useState("");
  const [planId, setPlanId] = useState(""),
    [remaining, setRemaining] = useState(""),
    [suggestion, setSuggestion] = useState("");
  const plan = (id: string) => {
    setPlanId(id);
    const task = tasks.find((item) => item.id === id);
    setRemaining(String(task?.remaining ?? ""));
    setSuggestion(String(task?.suggestion ?? ""));
  };
  return (
    <section aria-label="Hyväksytty sisältö ja korjauskierrokset" className="space-y-3">
      <h3>Hyväksytty sisältö ja korjauskierrokset</h3>
      <p className="text-sm">
        Raja ja lukitukset koskevat sekä näitä painikkeita että agentin toimintoja: kirjoitus
        torjutaan palvelussa ennen kuin mitään tallennetaan. Suoja ulottuu samoihin seurattuihin
        muutoksiin kuin Jatka työtä: kuvatuonnit, version palautus, muotoiltu teksti ja liikkeeseen
        sidottu paikan siirto jäävät sen ulkopuolelle.
      </p>
      <label className="block">
        Korjauskierrosten raja tehtävää kohti
        <input
          className={field}
          inputMode="numeric"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
        />
      </label>
      <button
        className={button}
        disabled={busy || !/^\d+$/.test(limit.trim())}
        onClick={() => void save({ action: "repair_limit", limit: Number(limit.trim()) })}
      >
        Tallenna kierrosraja
      </button>
      <TaskSelect
        label="Korjauskierroksia käyttävä tehtävä"
        placeholder="Ei valittua tehtävää"
        tasks={tasks}
        busy={busy}
        value={String(repair.activeTaskId ?? "")}
        onChange={(id) => void save({ action: "active_repair", id })}
      />
      <RoundList rounds={rounds} tasks={tasks} limit={Number(repair.limit ?? 2)} />
      <TaskSelect
        label="Tehtävän puutteet ja ehdotus"
        placeholder="Valitse tehtävä"
        tasks={tasks}
        busy={busy}
        value={planId}
        onChange={plan}
      />
      <label className="block">
        Jäljellä oleva puute
        <input
          className={field}
          value={remaining}
          onChange={(event) => setRemaining(event.target.value)}
        />
      </label>
      <label className="block">
        Seuraava ehdotus
        <input
          className={field}
          value={suggestion}
          onChange={(event) => setSuggestion(event.target.value)}
        />
      </label>
      <button
        className={button}
        disabled={busy || !planId}
        onClick={() => void save({ action: "repair_plan", id: planId, remaining, suggestion })}
      >
        Tallenna puute ja ehdotus
      </button>
      <label className="block">
        Lukittavan tekstin nimi
        <input className={field} value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="block">
        Lukittava teksti
        <input
          className={field}
          value={locked}
          onChange={(event) => setLocked(event.target.value)}
        />
      </label>
      <button
        className={button}
        disabled={busy || !label.trim() || locked.trim().length < 2}
        onClick={() => void save({ action: "lock", label, text: locked })}
      >
        Lukitse hyväksytty teksti
      </button>
      <LockList locks={notebookRows(book.locks)} tasks={tasks} busy={busy} save={save} />
      <RefusalList refusals={notebookRows(repair.refusals)} />
    </section>
  );
}
function TaskSelect({
  label,
  placeholder,
  tasks,
  busy,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  tasks: Record<string, unknown>[];
  busy: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      {label}
      <select
        className={field}
        disabled={busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {tasks.map((task) => (
          <option key={String(task.id)} value={String(task.id)}>
            {String(task.text)}
          </option>
        ))}
      </select>
    </label>
  );
}
function RoundList({
  rounds,
  tasks,
  limit,
}: {
  rounds: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  limit: number;
}) {
  return (
    <ul aria-label="Käytetyt korjauskierrokset">
      {rounds.map((row) => (
        <li key={String(row.id)}>
          {String(tasks.find((task) => task.id === row.id)?.text ?? row.id)}: {String(row.used)}/
          {String(limit)} kierrosta{row.exhausted ? " — raja täynnä" : ""}
          {Boolean(row.exhausted) && (
            <span>
              {" "}
              · Jäljellä oleva puute: {String(row.remaining) || "ei kirjattu"} · Seuraava ehdotus:{" "}
              {String(row.suggestion) || "ei kirjattu"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
function LockList({
  locks,
  tasks,
  busy,
  save,
}: {
  locks: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  busy: boolean;
  save: (input: object) => Promise<void>;
}) {
  return (
    <ul aria-label="Lukitut tekstit">
      {locks.map((lock) => (
        <li className="my-2 border-t border-neutral-600 pt-2" key={String(lock.id)}>
          <strong>{String(lock.label)}</strong>: {String(lock.text)}
          <button
            className={button}
            disabled={busy}
            onClick={() => void save({ action: "unlock", id: lock.id })}
          >
            Poista lukitus
          </button>
          {tasks.map((task) => (
            <label className="block" key={String(task.id)}>
              <input
                type="checkbox"
                disabled={busy}
                checked={Array.isArray(lock.tasks) && lock.tasks.includes(task.id)}
                onChange={(event) =>
                  void save({
                    action: "authority",
                    id: lock.id,
                    taskId: task.id,
                    granted: event.target.checked,
                  })
                }
              />{" "}
              Muutosvaltuus tehtävälle: {String(task.text)}
            </label>
          ))}
        </li>
      ))}
    </ul>
  );
}
function RefusalList({ refusals }: { refusals: Record<string, unknown>[] }) {
  return (
    <section aria-label="Torjutut muutokset">
      <h4>Torjutut muutokset</h4>
      {refusals.length === 0 && <p>Ei torjuttuja muutoksia.</p>}
      {refusals
        .slice()
        .reverse()
        .map((item) => (
          <p key={String(item.id)}>
            {String(item.createdAt)} · {String(item.message)}
          </p>
        ))}
    </section>
  );
}
