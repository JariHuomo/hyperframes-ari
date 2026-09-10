import { studioFileContentVersion, studioWriteHeaders } from "./studioFileVersion";

/** Project-bound structural source I/O. null is absence; "" is an existing empty file. */
export function nullableProjectFiles(projectId: string) {
  const base = `/api/ari/projects/${encodeURIComponent(projectId)}`;
  return {
    async readFile(path: string): Promise<string | null> {
      const response = await fetch(`${base}/source?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (
        !response.ok ||
        data.ok !== true ||
        (data.content !== null && typeof data.content !== "string")
      )
        throw new Error("Tiedostoa ei voitu lukea.");
      return data.content;
    },
    async writeFile(path: string, content: string | null, expectedContent?: string | null) {
      if (expectedContent === undefined) throw new Error("Tiedoston lähtötilanne puuttuu.");
      const expectedVersion =
        expectedContent === null ? null : await studioFileContentVersion(expectedContent);
      const response = await fetch(`${base}/source-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
        body: JSON.stringify({ files: [{ path, content, expectedVersion }] }),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error ?? "Tallennus epäonnistui.");
    },
  };
}

/** Existing string writes retain their version cache and editor synchronization. */
export async function writeHistoryProjectFile(
  projectId: string | null | undefined,
  writeExisting: (path: string, content: string, expected?: string) => Promise<void>,
  path: string,
  content: string | null,
  expected?: string | null,
): Promise<void> {
  if (content === null || expected === null) {
    if (!projectId) throw new Error("Projektia ei ole avattu.");
    await nullableProjectFiles(projectId).writeFile(path, content, expected);
  } else {
    await writeExisting(path, content, expected);
  }
}
