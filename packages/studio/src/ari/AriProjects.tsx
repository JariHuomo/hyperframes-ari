import { useEffect, useState, useRef } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { ariButton as button } from "./styles";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
async function call(bridge: AriAgentBridge, name: string, input: object = {}) {
  const result = object(await bridge.call(name, input));
  if (result.ok !== true) throw new Error(String(result.reason ?? "Toiminto ei onnistunut."));
  return result;
}
export function AriProjects({
  bridge,
  projectId,
}: {
  bridge: AriAgentBridge;
  projectId: string | null;
}) {
  const activeProject = useRef(projectId);
  activeProject.current = projectId;
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState("new");
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("product");
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [assets, setAssets] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [rejections, setRejections] = useState<string[]>([]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    setAssets([]);
    setProposal(null);
    setStatus("");
    setRejections([]);
  }, [projectId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Toiminto ei onnistunut.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const listed = await call(bridge, "studio_projects");
    setProjects(Array.isArray(listed.projects) ? listed.projects.map(object) : []);
    if (projectId) {
      const shelf = await call(bridge, "studio_images");
      setAssets(Array.isArray(shelf.assets) ? shelf.assets.map(object) : []);
    }
  }
  function assertSameProject() {
    if (activeProject.current !== projectId)
      throw new Error("Mainos vaihtui. Tuo loput kuvat valittuun mainokseen erikseen.");
  }
  async function importFiles(files: File[]) {
    setRejections([]);
    if (files.length > 20) throw new Error("Valitse enintään 20 kuvaa kerrallaan.");
    const rejected: string[] = [];
    let imported = 0;
    // Read only one selected file at a time, including on the browser side.
    for (const file of files) {
      assertSameProject();
      if (file.size > 8 * 1024 * 1024) {
        rejected.push(`${file.name}: Enimmäiskoko on 8 MiB.`);
        continue;
      }
      const base64 = await selectedFileBase64(file);
      assertSameProject();
      const result = object(
        await bridge.call("studio_import_images", {
          files: [{ name: file.name, base64 }],
        }),
      );
      if (!Array.isArray(result.results))
        throw new Error(String(result.reason ?? "Tuonti ei onnistunut."));
      for (const row of Array.isArray(result.results) ? result.results.map(object) : []) {
        if (row.ok) imported++;
        else rejected.push(`${file.name}: ${String(row.error)}`);
      }
    }
    setRejections(rejected);
    setStatus(`${imported} kuvaa tuotu. Kuvat säilyvät mainoksen mukana.`);
    await refresh();
  }
  return (
    <>
      <button
        className={button}
        onClick={() => {
          setOpen(true);
          void run(refresh);
        }}
      >
        Uusi mainos / aineisto
      </button>
      {open && (
        <dialog
          ref={dialog}
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setOpen(false);
          }}
          aria-label="Mainokset ja aineisto"
          className="fixed inset-4 z-[200] m-auto h-[calc(100%-2rem)] w-[calc(100%-2rem)] overflow-auto rounded-xl border border-neutral-500 bg-neutral-950 p-6 text-neutral-100 shadow-xl"
        >
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Mainokset ja aineisto</h2>
              <button autoFocus className={button} disabled={busy} onClick={() => setOpen(false)}>
                Sulje
              </button>
            </div>
            <nav aria-label="Mainoksen toiminnot" className="flex gap-3">
              {[
                ["new", "Uusi mainos"],
                ["images", "Aineisto"],
                ["open", "Avaa mainos"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={button}
                  aria-pressed={view === value}
                  disabled={busy || (value === "images" && !projectId)}
                  onClick={() => setView(value!)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <fieldset
              hidden={view !== "new"}
              disabled={busy}
              className="space-y-3 rounded border border-neutral-600 p-4"
            >
              <legend>Uusi mainos</legend>
              <label className="block">
                Mainoksen nimi
                <input
                  className="ml-3 rounded bg-neutral-800 p-2"
                  value={name}
                  maxLength={80}
                  onChange={(event) => {
                    setName(event.target.value);
                    setProposal(null);
                  }}
                />
              </label>
              <label className="block">
                Pohja
                <select
                  className="ml-3 rounded bg-neutral-800 p-2"
                  value={template}
                  onChange={(event) => {
                    setTemplate(event.target.value);
                    setProposal(null);
                  }}
                >
                  <option value="blank">Tyhjä mainos</option>
                  <option value="product">Tuote, pääviesti ja toimintakehote</option>
                </select>
              </label>
              <p>Pystymainos · 1080 × 1920 · 7 sekuntia · äänetön</p>
              {template === "blank" && (
                <p>Tyhjä sisältöpohja: vain tausta ja sen pehmeä sisääntulo.</p>
              )}
              <button
                className={button}
                onClick={() =>
                  void run(async () => {
                    const result = await call(bridge, "studio_prepare_project", { name, template });
                    setProposal(object(result.project));
                  })
                }
              >
                Tarkista tiedot
              </button>
              {proposal && (
                <div className="space-y-2 rounded bg-neutral-900 p-3">
                  <p>
                    {String(proposal.name)} · {String(proposal.duration)} sekuntia
                  </p>
                  <p className="break-all">Tallennuspaikka: {String(proposal.dir)}</p>
                  <button
                    className={button}
                    onClick={() =>
                      void run(async () => {
                        const receipt = await call(bridge, "studio_create_project", {
                          name: proposal.name,
                          template: proposal.template,
                          location: proposal.dir,
                        });
                        const project = object(receipt.project);
                        setStatus("Mainos luotu ja tallennettu.");
                        setProposal(null);
                        await call(bridge, "studio_open_project", { id: project.id });
                        await refresh();
                      })
                    }
                  >
                    Luo mainos
                  </button>
                </div>
              )}
            </fieldset>
            <fieldset
              hidden={view !== "open"}
              disabled={busy}
              className="rounded border border-neutral-600 p-4"
            >
              <legend>Avaa mainos</legend>
              <div className="flex flex-wrap gap-2">
                {projects.map((project) => (
                  <button
                    className={button}
                    key={String(project.id)}
                    onClick={() =>
                      void run(async () => {
                        await call(bridge, "studio_open_project", { id: project.id });
                        setOpen(false);
                      })
                    }
                  >
                    {String(project.title ?? project.id)}
                  </button>
                ))}
              </div>
            </fieldset>
            {projectId && (
              <fieldset
                hidden={view !== "images"}
                disabled={busy}
                className="space-y-3 rounded border border-neutral-600 p-4"
              >
                <legend>Lisää aineistoa</legend>
                <p>
                  PNG, JPEG ja WebP · enintään 8 MiB ja 16 megapikseliä / kuva. Muut tiedostotyypit
                  eivät vielä käy. Kuva kopioidaan mainokseen.
                </p>
                <button className={button} onClick={() => fileInput.current?.click()}>
                  Valitse kuvat
                </button>
                <input
                  ref={fileInput}
                  aria-label="Valitse kuvat"
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    void run(() => importFiles(files));
                  }}
                />
                <button className={button} onClick={() => void run(refresh)}>
                  Päivitä aineistohylly
                </button>
                <ul className="grid grid-cols-3 gap-3" aria-label="Aineistohylly">
                  {assets.map((asset, index) => (
                    <li key={String(asset.path)} className="rounded bg-neutral-900 p-2">
                      <img
                        className="h-28 w-full object-contain"
                        src={`/api/projects/${encodeURIComponent(projectId)}/preview/${String(asset.path)}`}
                        alt={`Tuotu kuva ${index + 1}`}
                      />
                      <p className="break-words">
                        {String(asset.name)} · {String(asset.width)} × {String(asset.height)}
                      </p>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <p role="status">{busy ? "Toiminto käynnissä…" : status}</p>
            {error && (
              <p role="alert" className="text-amber-200">
                {error}
              </p>
            )}
            {rejections.length > 0 && (
              <ul aria-label="Hylätyt kuvat" role="alert">
                {rejections.map((text, index) => (
                  <li key={index}>{text} Valitse toinen tiedosto.</li>
                ))}
              </ul>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}

function selectedFileBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Kuvan lukeminen epäonnistui."));
    reader.readAsDataURL(file);
  }).catch(() => "");
}
