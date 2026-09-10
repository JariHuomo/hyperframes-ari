import { prepareTrackedEdit, trackedOperationWriter } from "./sourceOperations";
import { writeConditionalFiles } from "./conditionalFileTransaction";
import type { MutableRefObject } from "react";
import type { EditHistoryKind } from "./editHistory";
import { serializeStudioFileMutations } from "./studioFileMutationCoordinator";
import { createStudioSaveHttpError } from "./studioSaveDiagnostics";

export interface RecordEditInput<T extends string | null = string> {
  operationId?: string;
  label: string;
  kind: EditHistoryKind;
  coalesceKey?: string;
  coalesceMs?: number;
  files: Record<string, { before: T; after: T }>;
}

export interface DomEditCommitBaseParams {
  activeCompPath: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: ProjectFileWriter;
  domEditSaveTimestampRef: MutableRefObject<number>;
  editHistory: { recordEdit: (entry: RecordEditInput) => Promise<void> };
  projectIdRef: MutableRefObject<string | null>;
  reloadPreview: () => void;
  clearDomSelection: () => void;
}

type ProjectFileWriter = (path: string, content: string, expectedContent?: string) => Promise<void>;

interface SaveProjectFilesWithHistoryInput<T extends string | null> {
  operationId?: string;
  operationOwner?: object;
  projectId: string;
  label: string;
  kind: EditHistoryKind;
  coalesceKey?: string;
  coalesceMs?: number;
  files: Record<string, T>;
  readFile: (path: string) => Promise<T>;
  writeFile: (path: string, content: T, expectedContent?: T) => Promise<void>;
  recordEdit: (entry: RecordEditInput<T>) => Promise<void>;
  /**
   * What a path holds ON DISK right now, when that is not the same as the
   * history's "before".
   *
   * The two are normally one value, so the write's optimistic-concurrency
   * expectation was taken straight from the undo baseline. They come apart when
   * a server-side mutation has already written part of the edit: deleting a clip
   * POSTs `remove-element`, which rewrites the file, and only then saves the
   * duration shrink — expecting the pre-delete content it read at the start. The
   * server had moved the file on, so the write was refused as a conflict, the
   * save queue paused, and the clip stayed on the timeline until a reload.
   *
   * Undo still restores `before`; this only says what to expect on disk.
   */
  diskContent?: Record<string, T>;
}

export async function readProjectFileContent(pid: string, path: string): Promise<string> {
  const response = await fetch(`/api/projects/${pid}/files/${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw await createStudioSaveHttpError(response, `Failed to read ${path}`);
  }
  const data = (await response.json()) as { content?: string };
  if (typeof data.content !== "string") {
    throw new Error(`Missing file contents for ${path}`);
  }
  return data.content;
}

export async function saveProjectFilesWithHistory<T extends string | null>({
  label,
  kind,
  coalesceKey,
  coalesceMs,
  files,
  readFile,
  writeFile,
  recordEdit,
  diskContent,
  operationOwner,
  operationId,
}: SaveProjectFilesWithHistoryInput<T>): Promise<string[] & { operationId?: string }> {
  return serializeStudioFileMutations(writeFile, Object.keys(files), async () => {
    const snapshots: Record<string, { before: T; after: T }> = {};
    for (const [path, after] of Object.entries(files)) {
      const before = await readFile(path);
      if (before !== after) {
        snapshots[path] = { before, after };
      }
    }

    const changedPaths = Object.keys(snapshots);
    if (changedPaths.length === 0) return [];

    const entry = await prepareTrackedEdit(
      operationOwner ?? recordEdit,
      { operationId, label, kind, coalesceKey, coalesceMs, files: snapshots },
      diskContent,
    );
    await writeConditionalFiles(
      Object.fromEntries(changedPaths.map((path) => [path, snapshots[path].after])),
      Object.fromEntries(changedPaths.map((path) => [path, snapshots[path].before])),
      trackedOperationWriter(operationOwner ?? recordEdit, entry, writeFile),
      () => recordEdit(entry),
      diskContent,
    );
    return Object.assign(changedPaths, { operationId: entry.operationId });
  });
}
