import type { FeedbackResult } from "../../../studio-server/src/ari/creativeFeedback";
export type { FeedbackResult };
export interface FeedbackQuote {
  id: string;
  reviewer: string;
  label: string;
  model: string;
  video: boolean;
  maxUsd: number;
  expiresAt: number;
}
export interface FeedbackOption {
  id: string;
  label: string;
  vendor: string;
  model: string;
  video: boolean;
  maxUsd: number;
}
const base = (project: string, pkg: string) =>
  `/api/ari/projects/${encodeURIComponent(project)}/review/${encodeURIComponent(pkg)}/feedback`;
async function request(url: string, body?: object) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(data.error ?? "Palautetta ei saatu.");
  return data;
}
export function creativeFeedback(project: string, pkg: string) {
  return {
    async read(): Promise<(FeedbackResult & { stale: boolean })[]> {
      return (await request(base(project, pkg))).results;
    },
    async options(): Promise<FeedbackOption[]> {
      return (await request(`${base(project, pkg)}/options`)).options;
    },
    async quote(reviewer: string): Promise<FeedbackQuote> {
      return (await request(`${base(project, pkg)}/quote`, { reviewer })).quote;
    },
    async run(quoteId: string): Promise<FeedbackResult & { stale: boolean }> {
      return (await request(`${base(project, pkg)}/run`, { quoteId, approved: true })).result;
    },
  };
}
