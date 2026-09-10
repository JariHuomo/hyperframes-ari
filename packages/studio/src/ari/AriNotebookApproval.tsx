import { useState } from "react";
import { ariButton as button } from "./styles";
import { notebookObject, notebookRows } from "./notebookView";
import { ariField as field, ActorTypeSelect } from "./AriNotebookFields";

/**
 * Ari · local version approval (D7)
 *
 * Approving is a named person's decision about one frozen version, and it is
 * local: it publishes nothing and releases nothing. The server refuses an
 * approval without a readable review package and a stated position on all four
 * categories, so this panel never has to judge anything itself.
 */
const categories = [
  ["message", "Viesti"],
  ["layout", "Ulkoasu"],
  ["motion", "Liike"],
  ["audio", "Ääni"],
] as const;

export function AriNotebookApproval({
  data,
  packages,
  busy,
  save,
}: {
  data: Record<string, unknown>;
  packages: Record<string, unknown>[];
  busy: boolean;
  save: (input: object) => Promise<void>;
}) {
  const [packageId, setPackageId] = useState("");
  const [approver, setApprover] = useState(""),
    [approverType, setApproverType] = useState("human");
  const [note, setNote] = useState("");
  const [excused, setExcused] = useState<Record<string, string>>({});
  const chosen = packages.find((item) => String(item.id) === packageId);
  const decide = (decision: "approved" | "rejected") =>
    void save({
      action: "approval",
      versionId: String(chosen?.versionId ?? ""),
      packageId: decision === "approved" ? packageId : undefined,
      decision,
      approver,
      approverType,
      note,
      notApplicable: Object.entries(excused)
        .filter(([, reason]) => reason.trim())
        .map(([category, reason]) => ({ category, reason })),
    });
  return (
    <section aria-label="Version hyväksyntä" className="space-y-3">
      <h3>Version hyväksyntä</h3>
      <p className="text-sm">
        Hyväksyntä on paikallinen ja koskee yhtä jäädytettyä versiota. Se vaatii luettavan
        tarkistuspaketin ja kannanoton kaikkiin neljään osa-alueeseen; tekninen mittaus ei riitä
        arvioksi. Hyväksyntä ei julkaise mitään eikä ole asiakastuotannon hyväksyntä. Hylättyä
        versiota ei voi myöhemmin merkitä hyväksytyksi.
      </p>
      <label className="block">
        Arvioitu tarkistuspaketti
        <select
          className={field}
          disabled={busy}
          value={packageId}
          onChange={(event) => setPackageId(event.target.value)}
        >
          <option value="">Valitse tarkistuspaketti</option>
          {packages.map((item) => (
            <option key={String(item.id)} value={String(item.id)}>
              {String(item.versionName ?? item.versionId)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Päättäjä
        <input
          className={field}
          value={approver}
          onChange={(event) => setApprover(event.target.value)}
        />
      </label>
      <ActorTypeSelect
        label="Päättäjän rooli"
        value={approverType}
        onChange={setApproverType}
        busy={busy}
      />
      <label className="block">
        Perustelu
        <input className={field} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {categories.map(([key, label]) => (
        <label className="block" key={key}>
          {label}: ei sovellu — perustelu
          <input
            className={field}
            value={excused[key] ?? ""}
            onChange={(event) => setExcused({ ...excused, [key]: event.target.value })}
          />
        </label>
      ))}
      <button
        className={button}
        disabled={busy || !packageId || !approver.trim() || !note.trim()}
        onClick={() => decide("approved")}
      >
        Hyväksy versio paikallisesti
      </button>
      <button
        className={button}
        disabled={busy || !packageId || !approver.trim() || !note.trim()}
        onClick={() => decide("rejected")}
      >
        Hylkää versio
      </button>
      <ExportReceipt value={notebookObject(data.export)} />
      <ApprovalList rows={notebookRows(data.approvals)} packages={packages} />
    </section>
  );
}
/** What a local MP4 export of the CURRENT sources would be called. */
function ExportReceipt({ value }: { value: Record<string, unknown> }) {
  return (
    <p data-testid="ari-approval-export" role="status">
      Vienti tästä sisältöversiosta: {value.approved ? "hyväksytty" : "luonnos, ei hyväksytty"} ·{" "}
      {String(value.note)}
    </p>
  );
}
function ApprovalList({
  rows,
  packages,
}: {
  rows: Record<string, unknown>[];
  packages: Record<string, unknown>[];
}) {
  return (
    <section aria-label="Hyväksyntäpäätökset" data-testid="ari-approval-list">
      <h4>Hyväksyntäpäätökset</h4>
      {rows.length === 0 && <p>Yhtään versiota ei ole hyväksytty eikä hylätty.</p>}
      {rows
        .slice()
        .reverse()
        .map((row) => (
          <article className="my-2 border-t border-neutral-600 pt-2" key={String(row.id)}>
            <strong>
              {row.decision === "approved" ? "Hyväksytty paikallisesti" : "Hylätty"} ·{" "}
              {String(
                packages.find((item) => item.versionId === row.versionId)?.versionName ??
                  row.versionId,
              )}
            </strong>
            <p>
              {String(row.approver)} ·{" "}
              {row.approverType === "human"
                ? "Ihmisen kirjaama"
                : row.approverType === "external_agent"
                  ? "Ulkoisen agentin kirjaama"
                  : "Testiaineisto"}{" "}
              · {String(row.createdAt)}
            </p>
            <p>{String(row.note)}</p>
            <p>
              {row.stale
                ? `Vanhentunut: ${staleReasons(row.staleReasons)}. Päätös säilyy historiassa; tarkista uusi versio.`
                : "Koskee nykyistä sisältöversiota."}
            </p>
            {notebookRows(row.notApplicable).map((item) => (
              <p key={String(item.category)}>
                Ei sovellu: {String(item.category)} — {String(item.reason)}
              </p>
            ))}
          </article>
        ))}
    </section>
  );
}
const staleReasons = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((reason) => (reason === "source_changed" ? "mainos muuttui" : "pakettia ei voi lukea"))
    .join(", ");
