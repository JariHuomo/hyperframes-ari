import { bindOperationHistory } from "../utils/sourceOperations";
import { withStudioFileRefresh } from "../utils/studioFileMutationCoordinator";
import { createProjectEditHistoryStorage } from "../utils/projectVersions";
import { writeConditionalFiles } from "../utils/conditionalFileTransaction";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildEditHistoryEntry,
  createEmptyEditHistory,
  hashEditHistoryContent,
  pushEditHistoryEntry,
  redoEditHistory,
  undoEditHistory,
  type BuildEditHistoryEntryInput,
  type EditHistoryEntry,
  type EditHistoryKind,
  type EditHistoryState,
  type EditHistoryTransitionResult,
} from "../utils/editHistory";
import {
  loadEditHistoryState,
  saveEditHistoryState,
  type EditHistoryStorageAdapter,
} from "../utils/editHistoryStorage";

interface RecordEditInput {
  operationId?: string;
  label: string;
  kind: EditHistoryKind;
  coalesceKey?: string;
  coalesceMs?: number;
  files: BuildEditHistoryEntryInput["files"];
}

interface ApplyCallbacks {
  readFile: (path: string, encoding?: "base64") => Promise<string | null>;
  writeFile: (
    path: string,
    content: string | null,
    expectedContent?: string | null,
    encoding?: "base64",
  ) => Promise<void>;
  serialize?: <T>(paths: readonly string[], task: () => Promise<T>) => Promise<T>;
}

interface UsePersistentEditHistoryOptions {
  projectId: string | null;
  storage?: EditHistoryStorageAdapter;
  now?: () => number;
}

/**
 * Per-file content the restore just applied. `restored` is the bytes written to
 * disk (the undo/redo target); `previous` is what was on disk immediately before
 * (the current live preview state). The undo preview-sync diffs these to decide
 * whether the restore is soft-reloadable (attributes/style/GSAP-script only) or
 * needs a full iframe reload.
 */
interface ApplyRestoredFile {
  previous: string | null;
  restored: string | null;
}

interface ApplyResult {
  ok: boolean;
  reason?: "empty" | "content-mismatch";
  label?: string;
  paths?: string[];
  files?: Record<string, ApplyRestoredFile>;
}

interface PersistentEditHistoryStoreOptions {
  projectId: string;
  storage: EditHistoryStorageAdapter;
  initialState: EditHistoryState;
  now?: () => number;
  onChange: (state: EditHistoryState) => void;
}

type EditHistoryMutation<T> = (state: EditHistoryState) => Promise<{
  state: EditHistoryState;
  result: T;
}>;

/** Pair the just-written (`restored`) bytes with the pre-write (`previous`) bytes per path. */
function restoredFilesMap(
  filesToWrite: Record<string, string | null>,
  currentFiles: Record<string, string | null>,
  entry: EditHistoryEntry,
): Record<string, ApplyRestoredFile> {
  const out: Record<string, ApplyRestoredFile> = {};
  for (const [path, restored] of Object.entries(filesToWrite)) {
    out[path] = {
      previous: previewContent(path, currentFiles[path], entry.files[path].encoding),
      restored: previewContent(path, restored, entry.files[path].encoding),
    };
  }
  return out;
}

/** Binary assets force a full preview refresh; source diffs receive decoded UTF-8. */
function previewContent(path: string, value: string | null, encoding?: "base64") {
  if (encoding !== "base64" || value === null) return value;
  if (!/\.(html|css|js|json|svg|txt|md)$/.test(path)) return null;
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
}

function createEntryId(now: number): string {
  return `edit-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function snapshotEditHistoryState(state: EditHistoryState) {
  const undoEntry = state.undo[state.undo.length - 1] ?? null;
  const redoEntry = state.redo[state.redo.length - 1] ?? null;
  return {
    canUndo: Boolean(undoEntry),
    canRedo: Boolean(redoEntry),
    undoLabel: undoEntry?.label ?? null,
    redoLabel: redoEntry?.label ?? null,
    undoPaths: undoEntry ? Object.keys(undoEntry.files) : [],
    redoPaths: redoEntry ? Object.keys(redoEntry.files) : [],
    state,
  };
}

async function readCurrentFileHashes(
  paths: string[],
  readFile: (path: string) => Promise<string | null>,
): Promise<{
  currentFiles: Record<string, string | null>;
  currentHashes: Record<string, string>;
}> {
  const currentFiles: Record<string, string | null> = {};
  const currentHashes: Record<string, string> = {};
  for (const path of paths) {
    const content = await readFile(path);
    currentFiles[path] = content;
    currentHashes[path] = hashEditHistoryContent(content);
  }
  return { currentFiles, currentHashes };
}

/**
 * Apply one undo/redo step: read current on-disk hashes, run the direction's
 * transition, write the restored files with rollback, and shape the ApplyResult.
 * `entry` is the stack top used to know which paths to hash before applying.
 */
async function applyHistoryStep(
  currentState: EditHistoryState,
  entry: EditHistoryEntry | undefined,
  transition: (
    state: EditHistoryState,
    currentHashes: Record<string, string>,
    now: number,
  ) => EditHistoryTransitionResult,
  now: () => number,
  callbacks: ApplyCallbacks,
  persist: (state: EditHistoryState) => Promise<void>,
): Promise<{ state: EditHistoryState; result: ApplyResult }> {
  if (!entry) {
    return { state: currentState, result: { ok: false, reason: "empty" } };
  }
  const paths = Object.keys(entry.files);
  const apply = async (): Promise<{ state: EditHistoryState; result: ApplyResult }> => {
    const { currentFiles, currentHashes } = await readCurrentFileHashes(paths, (path) =>
      callbacks.readFile(path, entry.files[path].encoding),
    );
    const side = transition === undoEditHistory ? "after" : "before";
    if (paths.some((path) => currentFiles[path] !== entry.files[path][side])) {
      return { state: currentState, result: { ok: false, reason: "content-mismatch" } };
    }
    const result = transition(currentState, currentHashes, now());
    if (!result.ok) {
      return {
        state: currentState,
        result: { ok: false, reason: result.reason },
      };
    }
    await writeConditionalFiles(
      result.filesToWrite,
      currentFiles,
      (path, content, expected) =>
        callbacks.writeFile(path, content, expected, entry.files[path].encoding),
      () => persist(result.state),
    );
    return {
      state: result.state,
      result: {
        ok: true,
        label: result.entry.label,
        paths: Object.keys(result.entry.files),
        files: restoredFilesMap(result.filesToWrite, currentFiles, entry),
      },
    };
  };
  return callbacks.serialize ? callbacks.serialize(paths, apply) : apply();
}

export function createPersistentEditHistoryStore({
  projectId,
  storage,
  initialState,
  now = Date.now,
  onChange,
}: PersistentEditHistoryStoreOptions) {
  let state = initialState;
  let queue = Promise.resolve();

  const persist = (nextState: EditHistoryState) =>
    saveEditHistoryState(storage, projectId, nextState);

  const mutate = async <T>(mutation: EditHistoryMutation<T>): Promise<T> => {
    const run = queue.then(async () => {
      const { state: nextState, result } = await mutation(state);
      if (nextState !== state) {
        state = nextState;
        onChange(nextState);
      }
      return result;
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    snapshot: () => snapshotEditHistoryState(state),
    /** Replace the complete stack, never only its persistence token. */
    async refresh(readSources: () => Promise<void> = async () => {}) {
      return withStudioFileRefresh(() =>
        mutate<void>(async () => {
          const next = storage.refresh
            ? ((await storage.refresh(projectId, readSources)) ?? createEmptyEditHistory())
            : await loadEditHistoryState(storage, projectId);
          if (!storage.refresh) await readSources();
          return { state: next, result: undefined };
        }),
      );
    },
    async recordEdit(input: RecordEditInput) {
      await mutate<void>(async (currentState) => {
        const timestamp = now();
        const entry = buildEditHistoryEntry({
          ...input,
          id: createEntryId(timestamp),
          projectId,
          now: timestamp,
        });
        const nextState = pushEditHistoryEntry(currentState, entry);
        await persist(nextState);
        return {
          state: nextState,
          result: undefined,
        };
      });
    },
    async undo(callbacks: ApplyCallbacks): Promise<ApplyResult> {
      return mutate<ApplyResult>((currentState) =>
        applyHistoryStep(
          currentState,
          currentState.undo[currentState.undo.length - 1],
          undoEditHistory,
          now,
          callbacks,
          persist,
        ),
      );
    },
    async redo(callbacks: ApplyCallbacks): Promise<ApplyResult> {
      return mutate<ApplyResult>((currentState) =>
        applyHistoryStep(
          currentState,
          currentState.redo[currentState.redo.length - 1],
          redoEditHistory,
          now,
          callbacks,
          persist,
        ),
      );
    },
  };
}

export async function createPersistentEditHistoryController({
  projectId,
  storage,
  now = Date.now,
  onChange,
}: {
  projectId: string;
  storage: EditHistoryStorageAdapter;
  now?: () => number;
  onChange: (state: EditHistoryState) => void;
}) {
  let state = await loadEditHistoryState(storage, projectId);
  const store = createPersistentEditHistoryStore({
    projectId,
    storage,
    initialState: state,
    now,
    onChange: (nextState) => {
      state = nextState;
      onChange(nextState);
    },
  });

  return store;
}

export function usePersistentEditHistory(options: UsePersistentEditHistoryOptions) {
  const storage = useMemo(
    () => options.storage ?? createProjectEditHistoryStorage(),
    [options.storage],
  );
  const now = options.now ?? Date.now;
  const [state, setState] = useState<EditHistoryState>(() => createEmptyEditHistory());
  const [loaded, setLoaded] = useState(false);
  const projectId = options.projectId;
  const storeRef = useRef<ReturnType<typeof createPersistentEditHistoryStore> | null>(null);
  const storeProjectIdRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;

  useEffect(() => {
    let cancelled = false;
    const emptyState = createEmptyEditHistory();
    storeRef.current = null;
    storeProjectIdRef.current = null;
    setState(emptyState);
    setLoaded(false);
    if (!projectId) {
      setLoaded(true);
      return;
    }

    loadEditHistoryState(storage, projectId)
      .then((loadedState) => {
        if (cancelled) return;
        storeRef.current = createPersistentEditHistoryStore({
          projectId,
          storage,
          initialState: loadedState,
          now,
          onChange: setState,
        });
        storeProjectIdRef.current = projectId;
        setState(loadedState);
      })
      .catch(() => {
        if (cancelled) return;
        storeRef.current = createPersistentEditHistoryStore({
          projectId,
          storage,
          initialState: emptyState,
          now,
          onChange: setState,
        });
        storeProjectIdRef.current = projectId;
        setState(emptyState);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [now, projectId, storage]);

  const recordEdit = useCallback(
    async (input: RecordEditInput) => {
      if (!projectId) throw new Error("Projektia ei ole avattu.");
      if (activeProjectIdRef.current !== projectId) {
        throw new Error(`Cannot record an edit for inactive project ${projectId}`);
      }
      const store = storeRef.current;
      if (!store) throw new Error("Muutoshistoria latautuu. Yritä hetken kuluttua uudelleen.");
      if (storeProjectIdRef.current !== projectId) {
        throw new Error(`Edit history store does not belong to project ${projectId}`);
      }
      await store.recordEdit(input);
    },
    [projectId],
  );

  if (projectId && !options.storage) bindOperationHistory(recordEdit, projectId);

  const undo = useCallback(
    async (callbacks: ApplyCallbacks): Promise<ApplyResult> => {
      if (
        !projectId ||
        activeProjectIdRef.current !== projectId ||
        storeProjectIdRef.current !== projectId
      ) {
        return { ok: false, reason: "empty" };
      }
      return storeRef.current?.undo(callbacks) ?? { ok: false, reason: "empty" };
    },
    [projectId],
  );

  const redo = useCallback(
    async (callbacks: ApplyCallbacks): Promise<ApplyResult> => {
      if (
        !projectId ||
        activeProjectIdRef.current !== projectId ||
        storeProjectIdRef.current !== projectId
      ) {
        return { ok: false, reason: "empty" };
      }
      return storeRef.current?.redo(callbacks) ?? { ok: false, reason: "empty" };
    },
    [projectId],
  );

  const refresh = useCallback(
    async (readSources: () => Promise<void>) => {
      if (
        !projectId ||
        activeProjectIdRef.current !== projectId ||
        storeProjectIdRef.current !== projectId ||
        !storeRef.current
      )
        throw new Error("Mainoksen historia ei ole valmis päivitettäväksi.");
      await storeRef.current.refresh(async () => {
        await readSources();
        if (activeProjectIdRef.current !== projectId)
          throw new Error("Avoin mainos vaihtui päivityksen aikana.");
      });
    },
    [projectId],
  );

  return {
    refresh,
    loaded,
    ...snapshotEditHistoryState(state),
    recordEdit,
    undo,
    redo,
  };
}
