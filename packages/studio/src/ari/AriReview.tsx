import { useState } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { useAriStructureActions } from "./useAriStructureActions";
import { AriStructureDialog } from "./AriStructureDialog";
import { AriReviewView } from "./AriReviewView";
import { AriReviewAssessments } from "./AriReviewAssessments";
import type { ReviewPackage, ReviewPackageSummary } from "../utils/reviewPackages";
import { ariButton as button } from "./styles";

/**
 * Ari · review package path (D4)
 *
 * The visible path runs through the SAME bounded tools an agent calls, so a
 * reviewer and a script cannot end up with different notions of what was
 * prepared. Preparation renders on the server and can take minutes; the state
 * shown is therefore the request's own — kesken, valmis or epäonnistui — and a
 * failed attempt publishes nothing, so retrying is safe.
 */
interface Option {
  id: string;
  name: string;
}
const states: Record<string, string> = {
  idle: "Ei valmisteltua pakettia tässä istunnossa.",
  preparing: "Valmistellaan tarkistuspakettia. Video renderöidään paikallisesti; tämä kestää.",
  ready: "Tarkistuspaketti on valmis katsottavaksi. Katselu ja arviot kirjataan erikseen.",
  failed: "Valmistelu epäonnistui. Pakettia ei julkaistu; voit yrittää uudelleen.",
};

export function AriReview({
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
        Tarkistuspaketti
      </button>
      {open && projectId && (
        <ReviewDialog
          key={projectId}
          bridge={bridge}
          projectId={projectId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReviewDialog({
  bridge,
  projectId,
  onClose,
}: {
  bridge: AriAgentBridge;
  projectId: string;
  onClose: () => void;
}) {
  const actions = useAriStructureActions(bridge);
  const [versions, setVersions] = useState<Option[]>([]);
  const [packages, setPackages] = useState<ReviewPackageSummary[]>([]);
  const [versionId, setVersionId] = useState("");
  const [previousVersionId, setPreviousVersionId] = useState("");
  const [pkg, setPkg] = useState<ReviewPackage | null>(null);
  const [state, setState] = useState<keyof typeof states>("idle");
  const busy = actions.busy || actions.bridgeBusy || state === "preparing";

  async function refresh() {
    const listing = await actions.call("studio_versions", {});
    const rows = Array.isArray(listing.versions) ? listing.versions : [];
    const options = rows.map((v: { id: string; name?: string }) => ({
      id: String(v.id),
      name: String(v.name ?? `Muutos ${String(v.id).slice(0, 8)}`),
    }));
    setVersions(options);
    setVersionId((current) => current || (options.at(-1)?.id ?? ""));
    setPreviousVersionId((current) => current || (options.at(-2)?.id ?? ""));
    const found = await actions.call("studio_list_review_packages", {});
    setPackages((found.packages as ReviewPackageSummary[]) ?? []);
  }

  async function prepare() {
    setState("preparing");
    try {
      const receipt = await actions.call("studio_prepare_review_package", {
        versionId,
        previousVersionId: previousVersionId || null,
      });
      setPkg(receipt.package as ReviewPackage);
      setState("ready");
      await refresh();
    } catch (error) {
      setState("failed");
      throw error;
    }
  }

  async function openPackage(id: string) {
    const receipt = await actions.call("studio_read_review_package", { packageId: id });
    setPkg(receipt.package as ReviewPackage);
    setState("ready");
  }

  return (
    <AriStructureDialog
      label="Tarkistuspaketti"
      title="Tarkistuspaketti"
      busy={busy}
      onClose={onClose}
    >
      <p className="my-2 text-sm">
        Valitse jäädytetty versio ja valinnainen vertailuversio. Paketti sisältää koko videon,
        ensimmäisen ja viimeisen ruudun sekä muuttuneiden liikkeiden rajaruudut.
      </p>
      <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
        <button className={button} onClick={() => void actions.run(refresh)}>
          Hae versiot
        </button>
        <VersionSelect
          label="Tarkistettava versio"
          value={versionId}
          options={versions}
          change={setVersionId}
          placeholder="Valitse versio"
        />
        <VersionSelect
          label="Vertailuversio"
          value={previousVersionId}
          options={versions}
          change={setPreviousVersionId}
          placeholder="Ei vertailuversiota"
        />
        <button
          className={`${button} bg-emerald-900`}
          disabled={!versionId}
          onClick={() => void actions.run(prepare)}
        >
          Valmistele tarkistuspaketti
        </button>
      </fieldset>
      <p role="status" data-testid="ari-review-state" className="min-h-6">
        {states[state]}
      </p>
      {actions.error && (
        <p role="alert" className="text-amber-300">
          {actions.error}
        </p>
      )}
      <h3 className="mt-3">Valmiit paketit</h3>
      <ul data-testid="ari-review-list">
        {packages.length === 0 && <li>Ei valmisteltuja paketteja.</li>}
        {packages.map((row) => (
          <li key={row.id} className="flex items-center gap-2 py-1 text-sm">
            <span>
              {row.readable
                ? `${row.versionName ?? row.versionId} · ${row.boundaryCount} rajaa`
                : `${row.id} · lukukelvoton: ${row.error ?? ""}`}
            </span>
            <button
              className={button}
              disabled={busy || !row.readable}
              onClick={() => void actions.run(() => openPackage(row.id))}
            >
              Avaa paketti
            </button>
          </li>
        ))}
      </ul>
      {pkg && (
        <>
          <AriReviewView projectId={projectId} pkg={pkg} />
          <AriReviewAssessments
            call={(name, input) => actions.call(name, input)}
            busy={busy}
            pkg={pkg}
          />
        </>
      )}
    </AriStructureDialog>
  );
}

function VersionSelect({
  label,
  value,
  options,
  change,
  placeholder,
}: {
  label: string;
  value: string;
  options: Option[];
  change: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        className="block max-w-52 bg-neutral-800 p-2"
        value={value}
        onChange={(event) => change(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
