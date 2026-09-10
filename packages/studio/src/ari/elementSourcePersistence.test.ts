// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adTemplate } from "../../../studio-server/src/ari/projectTemplates";
import { commitConditionalFiles } from "../../../studio-server/src/ari/conditionalFiles";
import { fileContentVersion } from "../../../studio-server/src/helpers/fileVersion";
import { createPersistentEditHistoryController } from "../hooks/usePersistentEditHistory";
import { memoryHistoryStorage } from "../utils/historyTestStorage";
import { readElements, saveElementOperation, type ElementOperation } from "./elementOperations";

describe("template element transactions on real files", () => {
  it.each(["rename", "duplicate", "delete", "forward", "backward"] as const)(
    "%s restores exact bytes, reopens history, redoes and compensates failure",
    async (action) => {
      const root = mkdtempSync(join(tmpdir(), "ari-template-"));
      try {
        const path = join(root, "index.html");
        const original = adTemplate("Paikallinen", "product").replaceAll("\n", "\r\n");
        writeFileSync(path, original);
        const storage = memoryHistoryStorage();
        const history = await createPersistentEditHistoryController({
          projectId: root,
          storage,
          onChange: () => {},
        });
        const io = {
          readFile: async () => readFileSync(path, "utf8"),
          writeFile: async (file: string, content: string | null, expected?: string | null) => {
            if (expected === undefined) throw new Error("Missing baseline");
            commitConditionalFiles(root, [
              {
                path: file,
                content: content === null ? null : Buffer.from(content),
                expectedVersion: expected === null ? null : fileContentVersion(expected),
              },
            ]);
          },
          recordEdit: history.recordEdit,
        };
        const target = (await readElements(original)).find(
          (row) => row.name === "Pääviesti",
        )!.target;
        const operation: ElementOperation =
          action === "rename" ? { action, target, name: "Uusi nimi" } : { action, target };
        const input = {
          projectId: root,
          sourceFile: "index.html",
          expectedVersion: fileContentVersion(original),
          operation,
          affectsInstances: 2,
          io,
          verifyImage: async () => {},
        };
        // Simulate the second phase failing after the conditional file write.
        await expect(
          saveElementOperation({
            ...input,
            io: {
              ...io,
              recordEdit: async () => {
                throw new Error("history failed");
              },
            },
          }),
        ).rejects.toThrow("history failed");
        expect(readFileSync(path)).toEqual(Buffer.from(original));
        expect(history.snapshot().state.undo).toHaveLength(0);
        const receipt = await saveElementOperation(input);
        const saved = readFileSync(path);
        expect(receipt.version).toBe(fileContentVersion(saved));
        expect(receipt.affectsInstances).toBe(2);
        expect(receipt.deleted).toBe(action === "delete");
        expect(history.snapshot().state.undo).toHaveLength(1);
        const reopened = await createPersistentEditHistoryController({
          projectId: root,
          storage,
          onChange: () => {},
        });
        expect((await reopened.undo(io)).ok).toBe(true);
        expect(readFileSync(path)).toEqual(Buffer.from(original));
        expect((await reopened.redo(io)).ok).toBe(true);
        expect(readFileSync(path)).toEqual(saved);
        await expect(saveElementOperation(input)).rejects.toThrow("muuttunut");
        expect(readFileSync(path)).toEqual(saved);
        // A removed identity is refused even when the version itself is current.
        if (action === "delete") {
          await expect(
            saveElementOperation({ ...input, expectedVersion: receipt.version }),
          ).rejects.toThrow("Kohde");
          expect(readFileSync(path)).toEqual(saved);
        }
        const external = "<!-- other writer -->\r\n" + saved.toString();
        writeFileSync(path, external);
        expect((await reopened.undo(io)).ok).toBe(false);
        expect(readFileSync(path)).toEqual(Buffer.from(external));
        expect(reopened.snapshot().state.undo).toHaveLength(1);
        expect(reopened.snapshot().state.redo).toHaveLength(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
