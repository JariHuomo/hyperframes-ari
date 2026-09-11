import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface VoiceCostBinding {
  id: string;
  binding: string;
  maxUsd: number;
}

export function reserveVoiceCost(costDir: string, budget: number, quote: VoiceCostBinding) {
  mkdirSync(costDir, { recursive: true });
  let used = 0;
  for (const name of readdirSync(costDir).filter((name) => name.endsWith(".started.json"))) {
    const started = JSON.parse(readFileSync(join(costDir, name), "utf8")) as {
      id: string;
      maxUsd: number;
    };
    const settled = join(costDir, `${started.id}.settled.json`);
    used += existsSync(settled)
      ? Number((JSON.parse(readFileSync(settled, "utf8")) as { actualUsd: number }).actualUsd)
      : Number(started.maxUsd);
  }
  if (used + quote.maxUsd > budget + Number.EPSILON)
    throw new Error("Puheäänen kuluraja ei riitä tähän ajoon.");
  const startedPath = join(costDir, `${quote.id}.started.json`);
  if (existsSync(startedPath))
    throw new Error("Tämä ääniajo on jo käynnistetty; tee uusi hintakortti.");
  writeFileSync(
    startedPath,
    JSON.stringify({ id: quote.id, maxUsd: quote.maxUsd, binding: quote.binding }),
    { flag: "wx" },
  );
}

export function settleVoiceCost(costDir: string, quote: VoiceCostBinding, actualUsd: number) {
  const path = join(costDir, `${quote.id}.settled.json`);
  const receipt = JSON.stringify({ id: quote.id, binding: quote.binding, actualUsd });
  if (!existsSync(path)) {
    writeFileSync(path, receipt, { flag: "wx" });
    return;
  }
  const previous = JSON.parse(readFileSync(path, "utf8")) as {
    id?: unknown;
    binding?: unknown;
    actualUsd?: unknown;
  };
  if (
    previous.id !== quote.id ||
    previous.binding !== quote.binding ||
    previous.actualUsd !== actualUsd
  )
    throw new Error("Puheäänen kulukuitti ei vastaa tätä ajoa.");
}
