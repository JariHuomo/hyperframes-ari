import { useState } from "react";
import type { ReviewAssessments, ReviewPackage } from "../utils/reviewPackages";
import { ariButton as button } from "./styles";

/**
 * Ari · attributed assessments (D4)
 *
 * Four separate judgements about ONE package, each with a named reviewer, a
 * reviewer type and a stated coverage. Three rules are visible on screen:
 *
 * - A category nobody assessed says **puuttuu**. It is never blank and never
 *   reads as approved.
 * - The technical measurements sit in their own block. A render with no audio
 *   track is a measurement; it leaves the audio assessment missing.
 * - After the ad's sources change, an older assessment stays listed and is
 *   marked **vanhentunut** with its reason instead of being rewritten.
 */
const field =
  "block w-full rounded border border-neutral-500 bg-neutral-900 p-2 focus-visible:outline focus-visible:outline-emerald-300";
const categoryNames: Record<string, string> = {
  message: "Viesti",
  layout: "Ulkoasu",
  motion: "Liike",
  audio: "Ääni",
};
const statusNames: Record<string, string> = {
  missing: "puuttuu",
  current: "kirjattu",
  stale: "vanhentunut",
};
const reviewerNames: Record<string, string> = {
  human: "Ihmisen kirjaama",
  external_agent: "Ulkoisen agentin kirjaama",
  test_data: "Testiaineisto",
};
const staleNames: Record<string, string> = {
  source_changed: "mainoksen lähde on muuttunut arvion jälkeen",
  package_unreadable: "tarkistuspakettia ei voi enää lukea",
};
const seconds = (value: number) =>
  `${value.toLocaleString("fi-FI", { maximumFractionDigits: 3 })} s`;

export function AriReviewAssessments({
  call,
  busy,
  pkg,
}: {
  call: (name: string, input: object) => Promise<Record<string, unknown>>;
  busy: boolean;
  pkg: ReviewPackage;
}) {
  const [data, setData] = useState<ReviewAssessments | null>(null);
  const [category, setCategory] = useState("message");
  const [reviewer, setReviewer] = useState("");
  const [reviewerType, setReviewerType] = useState("human");
  const [verdict, setVerdict] = useState("ok");
  const [text, setText] = useState("");
  const [watched, setWatched] = useState(false);
  const [allBoundaries, setAllBoundaries] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function guard(action: () => Promise<string>) {
    setWorking(true);
    setMessage("Odota hetki…");
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Arvioiden käsittely epäonnistui.");
    } finally {
      setWorking(false);
    }
  }
  const read = () =>
    guard(async () => {
      setData((await call("studio_read_review_assessments", {})) as unknown as ReviewAssessments);
      return "Arviot luettu. Puuttuva osa-alue näkyy puuttuvana.";
    });
  const record = () =>
    guard(async () => {
      setData(
        (await call("studio_record_review_assessment", {
          packageId: pkg.id,
          expectedToken: data?.token ?? null,
          category,
          reviewer,
          reviewerType,
          verdict,
          text,
          wholeVideoWatched: watched,
          checkedBoundaries: allBoundaries ? "all" : checked,
        })) as unknown as ReviewAssessments,
      );
      setText("");
      return "Arvio kirjattu. Mainoksen sisältö ei muuttunut.";
    });

  const row = data?.packages.find((item) => item.packageId === pkg.id);
  return (
    <section data-testid="ari-review-assessments" className="mt-4 space-y-3 text-sm">
      <h3>Arviot</h3>
      <p>
        Arvio on nimetyn tarkistajan oma näkemys. Tekniset mittaukset eivät täytä arviota, eikä
        kirjattu arvio ole julkaisun hyväksyntä.
      </p>
      <button className={button} disabled={busy || working} onClick={() => void read()}>
        {data ? "Päivitä arviot" : "Avaa arviot"}
      </button>
      <p role="status" data-testid="ari-assessment-status" className="min-h-6">
        {message}
      </p>
      <p data-testid="ari-review-measured">
        <strong>Tekninen mittaus:</strong> {pkg.measured.width} × {pkg.measured.height},{" "}
        {pkg.measured.fps} kuvaa sekunnissa, {seconds(pkg.measured.duration)}.{" "}
        {pkg.measured.audio
          ? "Videossa on ääniraita; mittaus ei kerro sen laadusta."
          : "Videossa ei ole ääniraitaa. Tämä on mittaus, ei ääniarvio, joten ääniarvio jää puuttumaan."}
      </p>
      {data && (
        <>
          <fieldset disabled={busy || working} className="space-y-2">
            <legend>Kirjaa arvio</legend>
            <label>
              Osa-alue
              <select
                aria-label="Osa-alue"
                className={field}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {Object.entries(categoryNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Arvion tekijä
              <input
                aria-label="Arvion tekijä"
                className={field}
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
              />
            </label>
            <label>
              Tekijän rooli
              <select
                aria-label="Tekijän rooli"
                className={field}
                value={reviewerType}
                onChange={(event) => setReviewerType(event.target.value)}
              >
                {Object.entries(reviewerNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Arvio
              <select
                aria-label="Arvio"
                className={field}
                value={verdict}
                onChange={(event) => setVerdict(event.target.value)}
              >
                <option value="ok">Kunnossa</option>
                <option value="fix">Korjattavaa</option>
              </select>
            </label>
            <label className="block">
              <input
                type="checkbox"
                aria-label="Katsoin koko videon"
                checked={watched}
                onChange={(event) => setWatched(event.target.checked)}
              />{" "}
              Katsoin koko videon
            </label>
            <label className="block">
              <input
                type="checkbox"
                aria-label="Tarkastin kaikki rajat"
                checked={allBoundaries}
                onChange={(event) => setAllBoundaries(event.target.checked)}
              />{" "}
              Tarkastin kaikki {pkg.boundaries.length} rajaa
            </label>
            {!allBoundaries &&
              pkg.boundaries.map((boundary, index) => (
                <label className="block" key={`${boundary.motionId}-${boundary.edge}-${index}`}>
                  <input
                    type="checkbox"
                    aria-label={`Raja ${index + 1}`}
                    checked={checked.includes(index)}
                    onChange={(event) =>
                      setChecked(
                        event.target.checked
                          ? [...checked, index]
                          : checked.filter((value) => value !== index),
                      )
                    }
                  />{" "}
                  Raja {index + 1}: {seconds(boundary.masterTime)}
                </label>
              ))}
            <label>
              Perustelu
              <textarea
                aria-label="Perustelu"
                className={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <button
              className={`${button} bg-emerald-900`}
              disabled={!reviewer.trim() || !text.trim()}
              onClick={() => void record()}
            >
              Kirjaa arvio
            </button>
          </fieldset>
          <AssessmentList row={row} revision={data.revision} />
        </>
      )}
    </section>
  );
}

function AssessmentList({
  row,
  revision,
}: {
  row: ReviewAssessments["packages"][number] | undefined;
  revision: string;
}) {
  const categories =
    row?.categories ??
    Object.keys(categoryNames).map((category) => ({
      category: category as "message",
      status: "missing" as const,
      assessments: [],
    }));
  return (
    <div data-testid="ari-review-assessment-list" className="space-y-2">
      <p>Luettu sisältöversio: {revision}</p>
      {categories.map((entry) => (
        <article key={entry.category} data-testid={`ari-assessment-${entry.category}`}>
          <h4>
            {categoryNames[entry.category]}: {statusNames[entry.status]}
          </h4>
          {entry.assessments.length === 0 && (
            <p>Kukaan ei ole arvioinut tätä osa-aluetta. Puuttuva arvio ei ole hyväksyntä.</p>
          )}
          {entry.assessments.map((item) => (
            <div className="border-t border-neutral-600 pt-1" key={item.id}>
              <p>
                <strong>{item.reviewer}</strong> · {reviewerNames[item.reviewerType]} ·{" "}
                {item.verdict === "ok" ? "Kunnossa" : "Korjattavaa"} · {item.createdAt}
              </p>
              <p>{item.text}</p>
              <p>
                Kattavuus:{" "}
                {item.wholeVideoWatched ? "koko video katsottu" : "koko videota ei katsottu"},{" "}
                {item.checkedBoundaries === "all"
                  ? "kaikki rajat tarkastettu"
                  : item.checkedBoundaries.length === 0
                    ? "ei tarkastettuja rajoja"
                    : `tarkastetut rajat ${item.checkedBoundaries.map((index) => index + 1).join(", ")}`}
                . Paketin kattavuus: {item.packageCoverage}.
              </p>
              <p>
                {item.stale
                  ? `Vanhentunut arvio: ${item.staleReasons.map((reason) => staleNames[reason] ?? reason).join("; ")}. Arvio säilyy historiassa.`
                  : "Koskee nykyistä sisältöversiota."}
              </p>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}
