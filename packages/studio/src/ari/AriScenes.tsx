import { useAriStructureActions } from "./useAriStructureActions";
import {
  AriStructureDialog,
  AriStructureSelection,
  selectStructureRow,
} from "./AriStructureDialog";
import { useState } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { ariButton as button } from "./styles";
import { ariNumber } from "./AriNumber";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value)) : {};
export function AriScenes({ bridge, sourceFile }: { bridge: AriAgentBridge; sourceFile: string }) {
  const { busy, bridgeBusy, error, status, setStatus, call, run } = useAriStructureActions(bridge);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [selected, setSelected] = useState("");
  const [name, setName] = useState("Uusi kohtaus"),
    [fileName, setFileName] = useState("kohtaus-1.html"),
    [duration, setDuration] = useState("2");
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null),
    [pending, setPending] = useState<object | null>(null);
  async function refresh() {
    const state = await call("studio_scenes", { sourceFile });
    setRows(Array.isArray(state.rows) ? state.rows.map(object) : []);
  }
  function invalidate() {
    setProposal(null);
    setPending(null);
    setStatus("");
  }
  async function prepare(action: string) {
    const args = {
      sourceFile,
      action,
      ...(action === "add"
        ? { name, fileName, duration: ariNumber(duration) }
        : {
            target: selected,
            ...(action === "rename" ? { name } : {}),
            ...(action === "detach" ? { fileName } : {}),
          }),
    };
    setProposal(null);
    setPending(null);
    const plan = await call("studio_prepare_scene", args);
    setProposal(plan);
    setPending(args);
  }
  async function save() {
    if (!proposal || !pending) return;
    const receipt = await call("studio_edit_scene", {
      ...pending,
      reviewVersion: proposal.reviewVersion,
    });
    setSelected(receipt.deleted ? "" : String(receipt.target));
    setProposal(null);
    setPending(null);
    setStatus("Kohtausmuutos tallennettu. Voit perua koko muutoksen.");
    await refresh();
  }
  return (
    <>
      <button
        className={button}
        disabled={busy || bridgeBusy}
        onClick={() => {
          setOpen(true);
          void run(refresh);
        }}
      >
        Kohtaukset
      </button>
      {open && (
        <AriStructureDialog
          label="Kohtausten aikajärjestys"
          title="Kohtausten aikajärjestys"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <p>
            Järjestä kohtaukset ajassa. Elementtien päällekkäisyysjärjestys muokataan
            Elementit-näkymässä.
          </p>
          <p>
            Kopio käyttää samaa sisältöä. Poisto poistaa vain tämän esiintymän. Uusi kohtaus
            lisätään nykyisen sisällön perään.
          </p>
          <fieldset disabled={busy} className="my-4 flex flex-wrap gap-3">
            <legend>Kohtauksen tiedot</legend>
            <label>
              Kohtauksen nimi{" "}
              <input
                className="bg-neutral-800 p-2"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <label>
              Uuden kohtauksen tiedostonimi{" "}
              <input
                className="bg-neutral-800 p-2"
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <label>
              Uuden kohtauksen kesto (s){" "}
              <input
                className="w-24 bg-neutral-800 p-2"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <button className={button} onClick={() => void run(() => prepare("add"))}>
              Lisää kohtaus
            </button>
          </fieldset>
          <fieldset disabled={busy} className="space-y-3">
            <legend>Nykyiset kohtaukset</legend>
            <AriStructureSelection
              label="Valittu kohtaus"
              placeholder="Valitse kohtaus"
              value={selected}
              onChange={(target) => {
                setSelected(target);
                invalidate();
                selectStructureRow(rows, target, setName, (row) => {
                  void run(async () => {
                    await call("studio_seek", {
                      time: Number(row.start) + Math.min(0.5, Number(row.duration) / 2),
                    });
                    await call("studio_select", { handle: row.handle, instance: row.hostId });
                  });
                });
              }}
            >
              {rows.map((row) => (
                <option key={String(row.target)} value={String(row.target)}>
                  {String(row.name)} · {String(row.start)}–
                  {Number(row.start) + Number(row.duration)} s
                </option>
              ))}
            </AriStructureSelection>
            <div className="flex flex-wrap gap-2">
              {[
                ["rename", "Nimeä kohtaus"],
                ["duplicate", "Kopioi kohtaus"],
                ["detach", "Tee oma kopio"],
                ["delete", "Poista kohtaus"],
                ["earlier", "Siirrä aiemmaksi"],
                ["later", "Siirrä myöhemmäksi"],
              ].map(([action, label]) => (
                <button
                  key={action}
                  className={button}
                  disabled={!selected}
                  onClick={() => void run(() => prepare(action!))}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className={button}
              onClick={() => {
                invalidate();
                void run(refresh);
              }}
            >
              Päivitä kohtausjono
            </button>
          </fieldset>
          {proposal && (
            <section
              aria-label="Kohtausmuutoksen vaikutus"
              className="my-4 rounded border border-emerald-500 p-3"
            >
              <h3>Tarkista ennen tallennusta</h3>
              <p>
                Kokonaiskesto: {String(proposal.beforeDuration)} s →{" "}
                {String(proposal.afterDuration)} s. Aloitussisältö: {String(proposal.baseDuration)}{" "}
                s.
              </p>
              <ol>
                {Array.isArray(proposal.rows) &&
                  proposal.rows.map(object).map((row) => (
                    <li key={String(row.target)}>
                      {String(row.name)}: {String(row.start)}–
                      {Number(row.start) + Number(row.duration)} s · nopeus ×
                      {String(row.playbackRate)}
                    </li>
                  ))}
              </ol>
              <p>{String(proposal.sourcePolicy)}</p>
              {Array.isArray(proposal.sharedSources) &&
                proposal.sharedSources.map(object).map((row, i) => (
                  <p key={i}>
                    {String(row.name ?? `Yhteinen sisältö ${i + 1}`)}: {String(row.instances)}{" "}
                    {row.instances === 1 ? "esiintymä" : "esiintymää"}
                  </p>
                ))}
              <button className={button} disabled={busy} onClick={() => void run(save)}>
                Tallenna kohtausmuutos
              </button>
            </section>
          )}
          <p role="status">{busy ? "Käsitellään…" : status}</p>
          {error && (
            <p role="alert" className="text-amber-200">
              {error}
            </p>
          )}
        </AriStructureDialog>
      )}
    </>
  );
}
