import { versionHistoryFiles } from "../utils/projectVersions";
import { useCallback, type MutableRefObject } from "react";
import { nullableProjectFiles, writeHistoryProjectFile } from "../utils/nullableProjectFiles";
import { serializeStudioFileMutations } from "../utils/studioFileMutationCoordinator";
import { STUDIO_MOTION_PATH } from "../components/editor/studioMotion";

export function useHistoryFileIO({
  projectId,
  readOptionalProjectFile,
  readProjectFile,
  writeProjectFile,
  domEditSaveTimestampRef,
}: {
  projectId: string | null | undefined;
  readOptionalProjectFile: (path: string) => Promise<string | null>;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string, expected?: string) => Promise<void>;
  domEditSaveTimestampRef: MutableRefObject<number>;
}) {
  const readHistoryFile = useCallback(
    (path: string, encoding?: "base64"): Promise<string | null> =>
      projectId && encoding === "base64"
        ? versionHistoryFiles(projectId).readFile(path)
        : projectId
          ? nullableProjectFiles(projectId).readFile(path)
          : path === STUDIO_MOTION_PATH
            ? readOptionalProjectFile(path)
            : readProjectFile(path),
    [projectId, readOptionalProjectFile, readProjectFile],
  );
  const writeHistoryFile = useCallback(
    async (
      path: string,
      content: string | null,
      expectedContent?: string | null,
      encoding?: "base64",
    ): Promise<void> => {
      domEditSaveTimestampRef.current = Date.now();
      if (projectId && encoding === "base64")
        return versionHistoryFiles(projectId).writeFile(path, content, expectedContent);
      await writeHistoryProjectFile(projectId, writeProjectFile, path, content, expectedContent);
    },
    [projectId, domEditSaveTimestampRef, writeProjectFile],
  );
  const serializeHistoryFiles = useCallback(
    <T>(paths: readonly string[], task: () => Promise<T>) =>
      serializeStudioFileMutations(writeProjectFile, paths, task),
    [writeProjectFile],
  );

  return { readHistoryFile, writeHistoryFile, serializeHistoryFiles };
}
