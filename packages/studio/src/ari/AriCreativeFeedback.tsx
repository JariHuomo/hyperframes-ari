import { useState } from "react";
import { useStudioShellContext } from "../contexts/StudioContext";
import { projectVersions } from "../utils/projectVersions";
import { reviewPackages, type ReviewPackage } from "../utils/reviewPackages";
import {
  creativeFeedback,
  type FeedbackOption,
  type FeedbackQuote,
  type FeedbackResult,
} from "../utils/creativeFeedback";
import { AriStructureDialog } from "./AriStructureDialog";
import { ariButton as button } from "./styles";

async function currentOverview(projectId: string): Promise<ReviewPackage> {
  const versions = projectVersions(projectId),
    reviews = reviewPackages(projectId);
  const current = await versions.list();
  let found: ReviewPackage | null = null;
  for (const row of await reviews.list()) {
    if (!row.readable || row.sourceRevision !== current.revision) continue;
    const candidate = await reviews.read(row.id);
    if (candidate.overview) {
      found = candidate;
      break;
    }
  }
  if (!found) {
    const version = [...current.versions].reverse().find((v) => v.revision === current.revision);
    const id = version?.id ?? (await versions.save("Mainoksen kuvakooste")).version.id;
    found = await reviews.prepare(id, null);
  }
  return found;
}

export function AriCreativeFeedback({ busy: parentBusy }: { busy: boolean }) {
  const { projectId, waitForPendingDomEditSaves, writeBlockedReason } = useStudioShellContext();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [pkg, setPkg] = useState<ReviewPackage | null>(null);
  const [quote, setQuote] = useState<FeedbackQuote | null>(null);
  const [options, setOptions] = useState<FeedbackOption[]>([]);
  const [results, setResults] = useState<(FeedbackResult & { stale: boolean })[]>([]);
  async function start(wantsFeedback: boolean) {
    setOpen(true);
    setBusy(true);
    setError("");
    setQuote(null);
    setResults([]);
    setOptions([]);
    setPkg(null);
    setStatus("Valmistellaan koko mainoksen kuvakoostetta…");
    try {
      await waitForPendingDomEditSaves();
      const found = await currentOverview(projectId);
      setPkg(found);
      setStatus("Kuvakooste on valmis. PNG-vienti on maksuton.");
      const feedback = creativeFeedback(projectId, found.id);
      const saved = await feedback.read();
      setResults(saved);
      // The reviewer is a deliberate choice, so an empty shelf offers the options, never a default.
      if (wantsFeedback) setOptions(await feedback.options());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kuvakooste epäonnistui.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  async function ask(reviewer: string) {
    if (!pkg) return;
    setBusy(true);
    setError("");
    try {
      setQuote(await creativeFeedback(projectId, pkg.id).quote(reviewer));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Palautetta ei saatu.");
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    if (!pkg || !quote) return;
    setBusy(true);
    setError("");
    setStatus("AI arvioi mainosta. Tämä voi kestää muutaman minuutin…");
    try {
      const value = await creativeFeedback(projectId, pkg.id).run(quote.id);
      setResults((current) => [...current.filter((r) => r.reviewer !== value.reviewer), value]);
      setQuote(null);
      setStatus("Palaute on tallennettu tälle mainosversiolle.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Palautetta ei saatu.");
      setQuote(null);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  const disabled = parentBusy || busy || !projectId || Boolean(writeBlockedReason);
  const url = (path: string) => (pkg ? reviewPackages(projectId).assetUrl(pkg.id, path) : "");
  return (
    <section
      aria-label="Mainoksen kokonaisuus"
      className="my-3 space-y-2 rounded border border-neutral-600 p-3 text-sm"
    >
      <button className={`${button} w-full`} disabled={disabled} onClick={() => void start(false)}>
        Koko mainos · PNG
      </button>
      <button
        className={`${button} w-full bg-emerald-900`}
        disabled={disabled}
        onClick={() => void start(true)}
      >
        Pyydä AI-palaute
      </button>
      <p className="text-xs text-neutral-300">
        Näe mainoksen kokonaisuus ja löydä tärkeimmät parannukset.
      </p>
      {open && (
        <AriStructureDialog
          label="Mainoksen kokonaisuus ja palaute"
          title="Mainoksen kokonaisuus ja palaute"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <p role="status" className="my-3">
            {status}
          </p>
          {error && (
            <p role="alert" className="my-3 text-amber-300">
              {error}
            </p>
          )}
          {pkg?.overview && (
            <>
              <p className="mb-3 text-sm">
                {pkg.overview.samples.length} näyteruutua alusta loppuun. Kooste auttaa arvioimaan
                sommittelua; liikkeen näet videosta. Myöhemmät muokkaukset tarvitsevat uuden
                koosteen.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  className={button}
                  href={url("overview.png")}
                  download="mainoksen-kuvakooste.png"
                >
                  Lataa kuvakooste · PNG
                </a>
                <a className={button} href={url("last.png")} download="mainoksen-loppukuva.png">
                  Lataa loppukuva · PNG
                </a>
                <a className={button} href={url("video.mp4")} download="mainos-luonnos.mp4">
                  Lataa tarkistusvideo
                </a>
              </div>
              <details open={!quote && results.length === 0} className="my-4">
                <summary className="cursor-pointer py-2">Näytä koko mainoksen kuvakooste</summary>
                <img
                  className="my-4 w-full"
                  alt="Mainoksen aikajana aikaleimattuina kuvina"
                  src={url("overview.png")}
                />
              </details>
              {!quote && options.length > 0 && (
                <div className="my-4 space-y-2">
                  <h3 className="text-lg">Valitse arvioija</h3>
                  {options.map((option) => (
                    <button
                      key={option.id}
                      className={`${button} w-full`}
                      disabled={busy || results.some((r) => r.reviewer === option.id && !r.stale)}
                      onClick={() => void ask(option.id)}
                    >
                      {option.label} · enintään{" "}
                      {option.maxUsd.toLocaleString("fi-FI", { minimumFractionDigits: 2 })} USD ·{" "}
                      {option.video ? "näkee videon" : "näkee vain kuvat"}
                    </button>
                  ))}
                  <p className="text-xs text-neutral-300">
                    Molemmat arviot voi pyytää samasta versiosta. Veloitus käytön mukaan.
                  </p>
                </div>
              )}
            </>
          )}
          {quote && (
            <section className="my-4 space-y-3 rounded border border-emerald-600 p-4">
              <h3 className="text-lg">AI-palaute mainoksesta</h3>
              <p>
                {quote.video ? "Video, kuvakooste ja loppukuva" : "Kuvakooste ja loppukuva"}{" "}
                lähetetään arvioitavaksi palveluun {quote.label}. Saat palautteen viestistä,
                ilmeestä, liikkeestä ja äänestä sekä kolme tärkeintä parannusta.
              </p>
              <p>
                Hinta enintään {quote.maxUsd.toLocaleString("fi-FI", { minimumFractionDigits: 2 })}{" "}
                USD. Veloitus käytön mukaan. PNG-vienti on maksuton.
              </p>
              <p className="text-sm">
                {quote.label} · Palaute ei muuta mainosta eikä hyväksy sitä julkaisuun.
              </p>
              <button
                className={`${button} bg-emerald-900`}
                disabled={busy}
                onClick={() => void analyze()}
              >
                Hyväksy hinta ja arvioi mainos
              </button>
            </section>
          )}
          {results.map((row) => (
            <FeedbackView key={row.reviewer} result={row} />
          ))}
        </AriStructureDialog>
      )}
    </section>
  );
}
function FeedbackView({ result }: { result: FeedbackResult & { stale: boolean } }) {
  const f = result.feedback;
  return (
    <section className="my-4 space-y-4" aria-label={`AI:n palaute · ${result.label}`}>
      <h3 className="text-xl">AI:n palaute · {result.label}</h3>
      {result.stale && (
        <p className="text-amber-300">Mainos on muuttunut. Tämä palaute koskee aiempaa versiota.</p>
      )}
      <p>{f.summary}</p>
      <div>
        <h4 className="font-bold">Säilytä nämä</h4>
        <ul className="list-disc pl-5">
          {f.strengths.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      <h4 className="font-bold">Kolme tärkeintä parannusta</h4>
      <ol className="list-decimal space-y-3 pl-5">
        {f.improvements.map((i, n) => (
          <li key={n}>
            <strong>
              {i.atSeconds.toLocaleString("fi-FI")} s · {i.problem}
            </strong>
            <p>{i.change}</p>
            <p className="text-neutral-300">{i.reason}</p>
          </li>
        ))}
      </ol>
      {[
        ["Mainosteksti", f.copy],
        ["Visuaalinen ilme", f.design],
        ["Liike ja rytmi", f.motion],
        ["Ääni", f.audio],
      ].map(([label, value]) => (
        <div key={label}>
          <h4 className="font-bold">{label}</h4>
          <p>{value}</p>
        </div>
      ))}
      <p className="text-sm text-neutral-300">{f.limitations}</p>
      <p className="text-sm">
        {result.label} ·{" "}
        {result.video
          ? "Arvioija sai koko videon, kuvakoosteen ja loppukuvan."
          : "Arvioija näki vain kuvakoosteen ja loppukuvan, ei videota."}{" "}
        AI:n näkemys, ei julkaisuhyväksyntä. Toteutunut kulu{" "}
        {result.actualUsd.toLocaleString("fi-FI", { maximumFractionDigits: 6 })} USD.
      </p>
    </section>
  );
}
