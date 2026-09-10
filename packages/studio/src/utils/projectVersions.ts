import { UncertainSourceOperation } from "./sourceOperations";
import {
  serializeStudioFileMutations,
  waitForStudioFileMutations,
} from "./studioFileMutationCoordinator";
import type { EditHistoryState } from "./editHistory";
import type { EditHistoryStorageAdapter } from "./editHistoryStorage";
import { createIndexedDbEditHistoryStorage } from "./editHistoryStorage";
import { studioWriteHeaders } from "./studioFileVersion";
import { writeConditionalFiles } from "./conditionalFileTransaction";
import type { FrozenVersion } from "../../../studio-server/src/ari/versionTypes";

class VersionRequestRejected extends Error {}

async function request(projectId: string, path: string, body?: unknown) {
  const response = await fetch(
    `/api/ari/projects/${encodeURIComponent(projectId)}/versions/${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok || data.ok !== true)
    throw new VersionRequestRejected(data.error ?? "Versiota ei voitu tallentaa.");
  return data;
}
export function projectVersions(projectId: string) {
  return {
    async list(): Promise<{
      versions: FrozenVersion[];
      revision: string;
      indexToken: string | null;
      history: EditHistoryState | null;
    }> {
      return request(projectId, "index");
    },
    async read(id: string): Promise<{ version: FrozenVersion; files: Record<string, string> }> {
      return request(projectId, `read/${encodeURIComponent(id)}`);
    },
    async save(name?: string) {
      await waitForStudioFileMutations();
      const index = await request(projectId, "index");
      return request(projectId, "save", {
        name,
        expectedRevision: index.revision,
        expectedIndex: index.indexToken,
      });
    },
    async delete(id: string, expectedIndex: string | null) {
      return request(projectId, `delete/${encodeURIComponent(id)}`, { expectedIndex });
    },
    async prepareRestore(id: string): Promise<{
      version: FrozenVersion;
      expectedRevision: string;
      files: Record<string, { before: string | null; after: string | null; encoding: "base64" }>;
    }> {
      return request(projectId, `restore/${encodeURIComponent(id)}`);
    },
  };
}
/** All files in a restore use explicit base64; existing UTF-8 history remains unchanged. */
export function versionHistoryFiles(projectId: string) {
  return {
    async readFile(path: string): Promise<string | null> {
      return (await request(projectId, `file?path=${encodeURIComponent(path)}`)).content;
    },
    async writeFile(path: string, content: string | null, before?: string | null) {
      if (before === undefined) throw new Error("Tiedoston lähtötilanne puuttuu.");
      await request(projectId, "file", { path, content, before });
    },
  };
}
export async function restoreProjectVersion(
  projectId: string,
  prepared: Awaited<ReturnType<ReturnType<typeof projectVersions>["prepareRestore"]>>,
  recordEdit: (input: {
    label: string;
    kind: "source";
    files: typeof prepared.files;
  }) => Promise<void>,
  /** The same project-bound writer identity used by ordinary edits. */
  writeOwner: object,
  assertActive: () => void = () => {},
) {
  return serializeStudioFileMutations(writeOwner, Object.keys(prepared.files), async () => {
    assertActive();
    const live = await projectVersions(projectId).list();
    assertActive();
    if (live.revision !== prepared.expectedRevision)
      throw new Error("Projekti muuttui. Valmistele palautus uudelleen.");
    const files = Object.fromEntries(
      Object.entries(prepared.files).map(([path, f]) => [path, f.after]),
    );
    const before = Object.fromEntries(
      Object.entries(prepared.files).map(([path, f]) => [path, f.before]),
    );
    await writeConditionalFiles(
      files,
      before,
      versionHistoryFiles(projectId).writeFile,
      async () => {
        const result = await projectVersions(projectId).list();
        if (result.revision !== prepared.version.revision)
          throw new Error("Projekti muuttui palautuksen aikana.");
        assertActive();
        await recordEdit({
          label: `Palauta ${prepared.version.name ?? "versio"}`,
          kind: "source",
          files: prepared.files,
        });
      },
    );
    return {
      restoredFrom: prepared.version.id,
      revision: prepared.version.revision,
      paths: Object.keys(prepared.files),
    };
  });
}
/** Server publication is authoritative; IndexedDB is read only for one-time legacy migration. */
export function createProjectEditHistoryStorage(): EditHistoryStorageAdapter {
  const tokens = new Map<string, string | null>();
  const legacy = createIndexedDbEditHistoryStorage();
  return {
    async get(id) {
      const data = await request(id, "index");
      tokens.set(id, JSON.stringify(data.history));
      if (data.history !== null) return data.history;
      return legacy.get(id).catch(() => null);
    },
    async refresh(id, readSources) {
      const before = await request(id, "index");
      const state = before.history ?? (await legacy.get(id).catch(() => null));
      await readSources();
      const after = await request(id, "index");
      if (before.revision !== after.revision || before.indexToken !== after.indexToken)
        throw new Error("Mainos muuttui päivityksen aikana. Päivitä tilanne uudelleen.");
      // Publish the token only after every source read and the final validation succeed.
      tokens.set(id, JSON.stringify(before.history));
      return state;
    },
    async set(id, state) {
      if (!tokens.has(id)) throw new Error("Muutoshistoria on avattava ennen tallennusta.");
      const current = await request(id, "index");
      if (JSON.stringify(current.history) !== tokens.get(id))
        throw new Error("Muutoshistoria muuttui. Päivitä tilanne ennen jatkamista.");
      const result = await publishHistory(id, state, current);
      tokens.set(id, JSON.stringify(result.history));
      Object.assign(state, result.history);
    },
    async delete() {
      throw new Error("Säilytettyjä versioita ei poisteta historian tyhjennyksellä.");
    },
  };
}

async function publishHistory(
  id: string,
  state: EditHistoryState,
  current: { revision: string; indexToken: string | null },
) {
  try {
    return await request(id, "save", {
      expectedRevision: current.revision,
      expectedIndex: current.indexToken,
      history: state,
    });
  } catch (error) {
    const operationId = state.undo.at(-1)?.operationId;
    if (!operationId || error instanceof VersionRequestRejected) throw error;
    // A lost response is not a failed write. Only a durably bound receipt resolves it.
    try {
      const saved = await request(id, "index");
      if (saved.operations?.some((receipt: { id: string }) => receipt.id === operationId))
        return saved;
    } catch {
      /* Keep the uncertain operation intact for explicit reconciliation. */
    }
    throw new UncertainSourceOperation();
  }
}
