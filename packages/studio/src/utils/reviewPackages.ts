import type { ReviewPackage } from "../../../studio-server/src/ari/reviewPackage";
import type { ReviewPackageSummary } from "../../../studio-server/src/ari/reviewList";
import type { readReviewAssessments } from "../../../studio-server/src/ari/reviewAssessmentsView";

/**
 * Ari · review package client (D4)
 *
 * One transport for the visible Tarkistus view and the discoverable agent
 * tools, so neither can quietly acquire a different notion of what a package
 * is. Every read returns the SERVER-verified manifest; the client never
 * reconstructs a package from parts it happens to hold.
 */
export type { ReviewPackage, ReviewPackageSummary };
export type ReviewAssessments = ReturnType<typeof readReviewAssessments>;

const base = (projectId: string) => `/api/ari/projects/${encodeURIComponent(projectId)}/review`;

async function request(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Tarkistuspakettia ei voitu lukea.");
  if (!response.ok || Reflect.get(data, "ok") !== true)
    throw new Error(String(Reflect.get(data, "error") ?? "Tarkistustoiminto epäonnistui."));
  return data as Record<string, unknown>;
}

export function reviewPackages(projectId: string) {
  return {
    async list(): Promise<ReviewPackageSummary[]> {
      return (await request(base(projectId))).packages as ReviewPackageSummary[];
    },
    /** Renders on the server; the promise settles only when a package is published. */
    async prepare(versionId: string, previousVersionId: string | null): Promise<ReviewPackage> {
      return (await request(`${base(projectId)}/prepare`, { versionId, previousVersionId }))
        .package as ReviewPackage;
    },
    async read(packageId: string): Promise<ReviewPackage> {
      return (await request(`${base(projectId)}/${encodeURIComponent(packageId)}`))
        .package as ReviewPackage;
    },
    /** Assessments live in the project notebook; this is the same store, read back. */
    async assessments(): Promise<ReviewAssessments> {
      return (await request(`${base(projectId)}/assessments`)) as unknown as ReviewAssessments;
    },
    /** Conditional on the notebook token the read returned. */
    async recordAssessment(input: object): Promise<ReviewAssessments> {
      return (await request(
        `${base(projectId)}/assessments`,
        input,
      )) as unknown as ReviewAssessments;
    },
    /** Manifest-listed paths only; the server refuses anything else. */
    assetUrl(packageId: string, path: string): string {
      return `${base(projectId)}/${encodeURIComponent(packageId)}/asset?path=${encodeURIComponent(path)}`;
    },
  };
}
