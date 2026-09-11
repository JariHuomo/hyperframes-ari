import type { ReviewPackage } from "../utils/reviewPackages";
import { reviewPackages } from "../utils/reviewPackages";

/**
 * Ari · review package viewer (D4)
 *
 * Shows exactly what the verified manifest published and nothing else: the
 * whole video, its first and last frame, and each changed motion boundary's
 * before/at/after frames, every one of them labelled with the frozen version
 * it came from. A sample with no image says why it has none instead of
 * disappearing. The header states in Finnish that a prepared package is
 * material to look at, not evidence that anyone looked or approved.
 */
const seconds = (value: number) =>
  `${value.toLocaleString("fi-FI", { maximumFractionDigits: 3 })} s`;

const changes: Record<string, string> = {
  added: "Lisätty liike",
  changed: "Muutettu liike",
  removed: "Poistettu liike",
};
const positions: Record<string, string> = { before: "Ennen", at: "Kohdalla", after: "Jälkeen" };
const edges: Record<string, string> = { start: "alku", end: "loppu" };

export function coverageText(pkg: ReviewPackage): string {
  const base: Record<string, string> = {
    "first-version":
      "Ensimmäinen versio: koko video sekä ensimmäinen ja viimeinen ruutu. Muuttuneita liikerajoja ei voi verrata ilman edellistä versiota.",
    "changed-motion-boundaries":
      "Koko video, ensimmäinen ja viimeinen ruutu sekä jokaisen muuttuneen liikkeen rajaruudut.",
    "changed-motion-boundaries-partial":
      "Koko video, ensimmäinen ja viimeinen ruutu sekä muuttuneiden liikkeiden rajaruudut. Kattavuus on osittainen.",
    "whole-video-first-last-only":
      "Koko video sekä ensimmäinen ja viimeinen ruutu. Liikerajoja ei ole poimittu.",
  };
  return base[pkg.coverage] ?? "Kattavuutta ei tunneta.";
}

function versionLabel(pkg: ReviewPackage, versionId: string): string {
  if (versionId === pkg.versionId) return pkg.versionName ?? "Nykyinen versio";
  if (versionId === pkg.previousVersionId) return pkg.previousVersionName ?? "Edellinen versio";
  return versionId;
}

export function AriReviewView({ projectId, pkg }: { projectId: string; pkg: ReviewPackage }) {
  const url = (path: string) => reviewPackages(projectId).assetUrl(pkg.id, path);
  return (
    <section data-testid="ari-review-package" className="mt-4 space-y-3 text-sm">
      <p data-testid="ari-review-coverage">
        <strong>Kattavuus:</strong> {coverageText(pkg)}
      </p>
      {pkg.coverageNotes.length > 0 && (
        <ul className="list-disc pl-5">
          {pkg.coverageNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <p>
        Versio: <strong>{pkg.versionName ?? pkg.versionId}</strong>
        {pkg.previousVersionId
          ? ` · verrattu versioon ${pkg.previousVersionName ?? pkg.previousVersionId}`
          : " · ei vertailuversiota"}
      </p>
      <p>
        Video {pkg.measured.width} × {pkg.measured.height}, {pkg.measured.fps} kuvaa sekunnissa,{" "}
        {seconds(pkg.measured.duration)}, {pkg.measured.frames} ruutua.
      </p>
      <p data-testid="ari-review-disclaimer" className="text-amber-200">
        Paketti on katsottavaa aineistoa. Sen valmistuminen ei tarkoita, että kukaan olisi katsonut
        videon, eikä se ole laadun hyväksyntä.
      </p>
      {pkg.overview && (
        <a href={url(pkg.overview.path)} download="mainoksen-kuvakooste.png">
          Lataa koko mainoksen kuvakooste · PNG
        </a>
      )}
      <video
        data-testid="ari-review-video"
        controls
        muted
        preload="metadata"
        src={url(pkg.video.path)}
        className="max-h-72 w-auto"
      />
      <div className="grid grid-cols-2 gap-3">
        {pkg.frames.map((frame, index) => (
          <figure key={frame.path}>
            <img
              alt={index === 0 ? "Ensimmäinen ruutu" : "Viimeinen ruutu"}
              src={url(frame.path)}
            />
            <figcaption>
              {index === 0 ? "Ensimmäinen ruutu" : "Viimeinen ruutu"}: ruutu {frame.frame},{" "}
              {seconds(frame.time)} · {versionLabel(pkg, pkg.versionId)}
            </figcaption>
          </figure>
        ))}
      </div>
      <h3 data-testid="ari-review-boundary-count">
        Muuttuneiden liikkeiden rajat: {pkg.boundaries.length}
      </h3>
      {pkg.boundaries.length === 0 && <p>Rajaruutuja ei ole tässä paketissa.</p>}
      {pkg.boundaries.map((boundary, index) => (
        <article
          key={`${boundary.motionId}-${boundary.edge}-${index}`}
          data-testid="ari-review-boundary"
        >
          <h4>
            {changes[boundary.change] ?? boundary.change}, {edges[boundary.edge] ?? boundary.edge} ·{" "}
            {boundary.target} · esiintymä {boundary.instance.index}/{boundary.instance.count}
          </h4>
          <p>
            Kohtauksessa {seconds(boundary.localTime)}, koko videossa {seconds(boundary.masterTime)}{" "}
            · versio {versionLabel(pkg, boundary.versionId)}
            {boundary.withinInstance ? "" : " · esiintymän aikajana ei yllä tähän kohtaan"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {boundary.samples.map((sample) => (
              <figure key={sample.position}>
                {sample.path ? (
                  <img
                    alt={`${positions[sample.position]} ruutu ${sample.frame}`}
                    src={url(sample.path)}
                  />
                ) : (
                  <p>Ruutu {sample.frame} on videon ulkopuolella; kuvaa ei ole.</p>
                )}
                <figcaption>
                  {positions[sample.position] ?? sample.position}: ruutu {sample.frame},{" "}
                  {seconds(sample.time)}
                  {sample.status === "reused" ? " · sama ruutu kuin aiemmassa rajassa" : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
