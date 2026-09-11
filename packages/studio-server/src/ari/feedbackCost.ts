import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { feedbackTask, type FeedbackReviewer } from "./creativeFeedbackContract.js";

interface CostStart {
  id: string;
  maxUsd: number;
}
/** Unknown or interrupted calls keep their full reservation. No automatic retry after a crash. */
export function reserveFeedbackCost(
  costDir: string,
  budget: number,
  id: string,
  binding: string,
  reviewer: FeedbackReviewer,
) {
  mkdirSync(costDir, { recursive: true });
  let reserved = 0;
  for (const name of readdirSync(costDir).filter((n) => n.endsWith(".started.json"))) {
    const started: CostStart = JSON.parse(readFileSync(join(costDir, name), "utf8"));
    const endPath = join(costDir, `${started.id}.settled.json`);
    const usd: unknown = existsSync(endPath)
      ? JSON.parse(readFileSync(endPath, "utf8")).actualUsd
      : started.maxUsd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0)
      throw new Error("Aiemman AI-palautteen kulut pitää tarkistaa.");
    reserved += usd;
  }
  if (reserved + reviewer.maxUsd > budget)
    throw new Error("AI-palautteelle asetettu yhteinen kuluraja tulisi vastaan.");
  writeFileSync(
    join(costDir, `${id}.started.json`),
    JSON.stringify({
      id,
      binding,
      reviewer: reviewer.id,
      model: reviewer.model,
      task: feedbackTask,
      maxUsd: reviewer.maxUsd,
      createdAt: Date.now(),
    }),
    { flag: "wx" },
  );
}
