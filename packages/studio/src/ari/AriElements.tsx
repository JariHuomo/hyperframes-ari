import { useAriStructureActions } from "./useAriStructureActions";
import {
  AriStructureDialog,
  AriStructureSelection,
  selectStructureRow,
} from "./AriStructureDialog";
import { useEffect, useState } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { ariButton as button } from "./styles";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value)) : {};
export function AriElements({
  bridge,
  sourceFile: contextSourceFile,
  selectedTarget,
  instance,
  instanceLabel,
}: {
  bridge: AriAgentBridge;
  sourceFile: string;
  selectedTarget?: string;
  instance?: string | null;
  instanceLabel?: string;
}) {
  const [sourceFile, setSourceFile] = useState(contextSourceFile);
  const { busy, bridgeBusy, error, status, setStatus, call, run } = useAriStructureActions(bridge);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>({});
  const [assets, setAssets] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("Uusi teksti"),
    [text, setText] = useState("Oma viestisi");
  const [kind, setKind] = useState("text"),
    [color, setColor] = useState("#f2eedf"),
    [image, setImage] = useState("");
  useEffect(() => {
    if (!open && sourceFile !== contextSourceFile) {
      setSourceFile(contextSourceFile);
      setSnapshot({});
      setStatus("");
      setName("Uusi teksti");
    }
  }, [contextSourceFile, open, sourceFile, setStatus]);
  useEffect(() => {
    setSelected(selectedTarget ?? "");
  }, [selectedTarget]);
  const rows = Array.isArray(snapshot.elements) ? snapshot.elements.map(object) : [];
  async function refresh(preferredTarget?: string) {
    const next = await call("studio_elements", { sourceFile });
    setSnapshot(next);
    const target = preferredTarget ?? selectedTarget ?? selected;
    const row = Array.isArray(next.elements)
      ? next.elements.map(object).find((row) => row.target === target)
      : undefined;
    if (row) setName(String(row.name));
    const shelf = await call("studio_images", {});
    setAssets(Array.isArray(shelf.assets) ? shelf.assets.map(object) : []);
  }
  async function refreshProject() {
    const next = await call("studio_refresh_project", { sourceFile });
    setSnapshot(next);
    setAssets(Array.isArray(next.assets) ? next.assets.map(object) : []);
    // The checked read does not replace a name/text draft or the user's selection.
    setStatus("Tilanne päivitetty. Tallentamattomat tiedot säilyivät.");
  }
  async function edit(action: string) {
    const asset = assets.find((a) => a.path === image);
    const receipt = await call("studio_edit_element", {
      sourceFile,
      version: snapshot.version,
      action,
      ...(action === "add"
        ? {
            kind,
            name,
            ...(kind === "text"
              ? { text }
              : kind === "background"
                ? { color }
                : { imagePath: asset?.path, checksum: asset?.checksum }),
          }
        : { target: selected, ...(action === "rename" ? { name } : {}) }),
    });
    setSelected(receipt.deleted ? "" : String(receipt.target));
    setStatus(`Tallennettu. Muutos koskee ${String(receipt.affectsInstances)} esiintymää.`);
    await refresh(receipt.deleted ? "" : String(receipt.target));
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
        Elementit
      </button>
      {open && (
        <AriStructureDialog
          label="Elementtien muokkaus"
          title="Elementit"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <p>
            Tekstin, kuvan ja taustan päällekkäisyysjärjestys. Kohtausten aikajärjestys muokataan
            erikseen.
          </p>
          <p>Tässä näkyvät kohtauksen tekstit, kuvat ja taustat.</p>
          <p data-testid="element-impact">
            {snapshot.affectsInstances === 1
              ? "Muutos koskee tätä kohtausta."
              : `Muutos koskee yhteisen kohtauksen jokaista esiintymää (${String(snapshot.affectsInstances ?? "…")}).`}
            {instanceLabel ? ` Valittu esiintymä: ${instanceLabel}.` : ""}
          </p>
          <fieldset disabled={busy} className="my-4 flex flex-wrap gap-3">
            <legend>Lisää elementti</legend>
            <label>
              Tyyppi{" "}
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="bg-neutral-800 p-2"
              >
                <option value="text">Teksti</option>
                <option value="image">Kuva</option>
                <option value="background">Tausta</option>
              </select>
            </label>
            <label>
              Nimi{" "}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-neutral-800 p-2"
              />
            </label>
            {kind === "text" && (
              <label>
                Teksti{" "}
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="bg-neutral-800 p-2"
                />
              </label>
            )}
            {kind === "background" && (
              <label>
                Taustan väri{" "}
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
            )}
            {kind === "image" && (
              <label>
                Kuva aineistohyllystä{" "}
                <select
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="bg-neutral-800 p-2"
                >
                  <option value="">Valitse kuva</option>
                  {assets.map((asset) => (
                    <option key={String(asset.path)} value={String(asset.path)}>
                      {String(asset.name)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className={button}
              disabled={!snapshot.version}
              onClick={() => void run(() => edit("add"))}
            >
              Lisää elementti
            </button>
          </fieldset>
          <fieldset disabled={busy} className="space-y-3">
            <legend>Muokkaa elementtiä</legend>
            <AriStructureSelection
              label="Valittu elementti"
              placeholder="Valitse elementti"
              value={selected}
              onChange={(target) => {
                setSelected(target);
                selectStructureRow(rows, target, setName, (row) => {
                  void run(async () => {
                    await call("studio_select", {
                      handle: row.handle,
                      ...(instance ? { instance } : {}),
                    });
                  });
                });
              }}
            >
              {rows.map((row) => (
                <option key={String(row.target)} value={String(row.target)}>
                  {String(row.name)}
                </option>
              ))}
            </AriStructureSelection>
            <div className="flex flex-wrap gap-2">
              {[
                ["rename", "Nimeä"],
                ["duplicate", "Kopioi"],
                ["delete", "Poista"],
                ["forward", "Tuo edemmäs"],
                ["backward", "Vie taaemmas"],
              ].map(([action, label]) => (
                <button
                  className={button}
                  key={action}
                  disabled={!selected}
                  onClick={() => void run(() => edit(action!))}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className={button} onClick={() => void run(refreshProject)}>
              Päivitä tilanne
            </button>
          </fieldset>
          <p role="status" className="min-h-8 py-2">
            {busy ? "Tallennetaan…" : status}
          </p>
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
