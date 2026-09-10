import type { OperationReceipt } from "./operationJournal.js";
export interface FrozenVersion {
  id: string;
  revision: string;
  name: string | null;
  createdAt: number;
  files: Record<string, string>;
  sourceBytes: number;
  replayError: string | null;
}
export interface VersionIndex {
  schema: 1;
  versions: FrozenVersion[];
  history: unknown;
  operations?: OperationReceipt[];
}
export const versionIndexPath = ".ari-versions/index.json";
export const versionBlobPath = (hash: string) => {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Version tarkistussumma ei kelpaa.");
  return `.ari-versions/objects/${hash}`;
};
export function parseVersionIndex(content: Buffer | null): VersionIndex {
  if (content === null) return { schema: 1, versions: [], history: null };
  const value = JSON.parse(content.toString());
  if (value.schema !== 1 || !Array.isArray(value.versions))
    throw new Error("Versiosäilö on vioittunut.");
  validateReceipts(value.operations);
  for (const v of value.versions) {
    if (
      typeof v.id !== "string" ||
      typeof v.revision !== "string" ||
      !v.files ||
      typeof v.files !== "object" ||
      !Number.isFinite(v.sourceBytes)
    )
      throw new Error("Version tiedot ovat vioittuneet.");
    for (const hash of Object.values(v.files)) {
      if (typeof hash !== "string") throw new Error("Version tiedot ovat vioittuneet.");
      versionBlobPath(hash);
    }
  }
  return value;
}

function validateReceipts(operations: OperationReceipt[] | undefined) {
  if (operations !== undefined) {
    if (!Array.isArray(operations) || operations.length > 1000)
      throw new Error("Toimintojen tulokset ovat vioittuneet.");
    const ids = new Set<string>();
    for (const receipt of operations) {
      if (
        !receipt ||
        ![
          receipt.id,
          receipt.binding,
          receipt.historyId,
          receipt.versionId,
          receipt.resultRevision,
        ].every((v) => typeof v === "string" && v.length > 0) ||
        ids.has(receipt.id)
      )
        throw new Error("Toiminnon tulos on vioittunut.");
      ids.add(receipt.id);
    }
  }
}
