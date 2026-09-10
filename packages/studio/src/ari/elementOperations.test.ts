// @vitest-environment happy-dom
import { openComposition } from "@hyperframes/sdk";
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildElementEdit,
  readElements,
  saveElementOperation,
  type ElementOperation,
} from "./elementOperations";
import { studioFileContentVersion } from "../utils/studioFileVersion";
import { createPersistentEditHistoryController } from "../hooks/usePersistentEditHistory";
import { commitConditionalFiles } from "../../../studio-server/src/ari/conditionalFiles";
import { fileContentVersion } from "../../../studio-server/src/helpers/fileVersion";
import type { EditHistoryState } from "../utils/editHistory";
const source =
  '<!doctype html>\r\n<html><body><div data-composition-id="main" data-duration="7" data-width="1080" data-height="1920"></div><script>const tl=gsap.timeline({paused:true});window.__timelines={main:tl};</script></body></html>\r\n';
const text: ElementOperation = {
  action: "add",
  kind: "text",
  name: "Otsikko",
  text: "Testi <ei koodia>",
};

describe("structural element candidates", () => {
  it("places imported images inside a small nested scene using the copied project URL", async () => {
    const small = source
      .replace('data-width="1080"', 'data-width="935"')
      .replace('data-height="1920"', 'data-height="376"');
    const result = await buildElementEdit(
      small,
      {
        action: "add",
        kind: "image",
        name: "Tuotekuva",
        image: { path: "media/product.png", checksum: "sha" },
      },
      "scenes/card.html",
    );
    const doc = new DOMParser().parseFromString(result.after, "text/html");
    const image = doc.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("../media/product.png");
    expect(image.style.left).toBe("22%");
    expect(image.style.top).toBe("36%");
    expect(image.style.width).toBe("56%");
    expect(image.style.height).toBe("33%");
  });
  it("adds escaped text with a stable unique identity", async () => {
    const a = await buildElementEdit(source, text),
      b = await buildElementEdit(a.after, text);
    expect(a.target).not.toBe(b.target);
    const rows = await readElements(b.after);
    expect(rows).toHaveLength(2);
    expect(rows[0].text).toBe("Testi <ei koodia>");
    expect(b.after).not.toContain("<ei koodia>");
  });
  it("renames, duplicates, orders and removes a primitive", async () => {
    const a = await buildElementEdit(source, text);
    const b = await buildElementEdit(a.after, {
      action: "rename",
      target: a.target,
      name: "Uusi nimi",
    });
    expect((await readElements(b.after))[0].name).toBe("Uusi nimi");
    const c = await buildElementEdit(b.after, { action: "duplicate", target: a.target });
    expect(c.target).not.toBe(a.target);
    const d = await buildElementEdit(c.after, { action: "backward", target: c.target });
    const rows = await readElements(d.after);
    expect(rows.find((r) => r.target === c.target)!.zIndex).toBeLessThan(
      rows.find((r) => r.target === a.target)!.zIndex,
    );
    const e = await buildElementEdit(d.after, { action: "delete", target: c.target });
    expect(await readElements(e.after)).toHaveLength(1);
  });
  it("keeps copied image identity and validates colors", async () => {
    const a = await buildElementEdit(source, {
      action: "add",
      kind: "image",
      name: "Kuva",
      image: { path: "assets/kuva.png", checksum: "abc" },
    });
    const b = await buildElementEdit(a.after, { action: "duplicate", target: a.target });
    expect(
      (await readElements(b.after)).every(
        (r) => r.imagePath === "assets/kuva.png" && r.checksum === "abc",
      ),
    ).toBe(true);
    await expect(
      buildElementEdit(source, {
        action: "add",
        kind: "background",
        name: "Tausta",
        color: "red;display:none",
      }),
    ).rejects.toThrow("väri");
  });
  it("removes bound motion and duplicates an animated element independently", async () => {
    const added = await buildElementEdit(source, text);
    const c = await openComposition(added.after, { history: false });
    c.setAttribute(added.target, "id", "animated");
    c.addGsapTween(added.target, {
      method: "to",
      position: 0,
      duration: 1,
      properties: { x: 40 },
      ease: "none",
    });
    const animated = c.serialize();
    c.dispose();
    const deleted = await buildElementEdit(animated, { action: "delete", target: added.target });
    const result = await openComposition(deleted.after, { history: false });
    expect(result.getAllAnimationIds().size).toBe(0);
    result.dispose();
    const copy = await buildElementEdit(animated, { action: "duplicate", target: added.target });
    const copied = await openComposition(copy.after, { history: false });
    expect(copied.getElement(copy.target)!.animationIds).toHaveLength(1);
    expect(copied.getElement(copy.target)!.animationIds).not.toEqual(
      copied.getElement(added.target)!.animationIds,
    );
    copied.dispose();
  });

  it("removes only the deleted target from a shared tween", async () => {
    const a = await buildElementEdit(source, text);
    const b = await buildElementEdit(a.after, text);
    const document = new DOMParser().parseFromString(b.after, "text/html");
    document.querySelector("script")!.textContent =
      "const tl=gsap.timeline({paused:true});tl.to('.clip',{x:4,duration:1},0);window.__timelines={main:tl};";
    const removed = await buildElementEdit(document.documentElement.outerHTML, {
      action: "delete",
      target: a.target,
    });
    const remaining = await openComposition(removed.after, { history: false });
    expect(remaining.getElement(a.target)).toBeNull();
    expect(remaining.getElement(b.target)!.animationIds).toHaveLength(1);
    remaining.dispose();
  });

  it("refuses stale or unowned targets", async () => {
    await expect(buildElementEdit(source, { action: "delete", target: "missing" })).rejects.toThrow(
      "Kohde",
    );
  });
});

describe("element persistence on real conditional files", () => {
  it("records one entry and restores exact bytes across undo/redo and reopening", async () => {
    const root = mkdtempSync(join(tmpdir(), "ari-elements-"));
    try {
      const path = join(root, "index.html");
      writeFileSync(path, source);
      let state: EditHistoryState | null = null;
      const storage = {
        get: async () => state,
        set: async (_id: string, value: EditHistoryState) => {
          state = value;
        },
        delete: async () => {
          state = null;
        },
      };
      const open = () =>
        createPersistentEditHistoryController({ projectId: "p", storage, onChange: () => {} });
      const history = await open();
      const io = {
        readFile: async () => readFileSync(path, "utf8"),
        writeFile: async (p: string, content: string | null, expected?: string | null) => {
          if (expected === undefined) throw new Error("Missing baseline");
          commitConditionalFiles(root, [
            {
              path: p,
              content: content === null ? null : Buffer.from(content),
              expectedVersion: expected === null ? null : fileContentVersion(expected),
            },
          ]);
        },
        recordEdit: history.recordEdit,
      };
      const save = (version: string, operation: ElementOperation = text) =>
        saveElementOperation({
          projectId: "p",
          sourceFile: "index.html",
          expectedVersion: version,
          operation,
          affectsInstances: 2,
          io,
          verifyImage: async () => {
            throw new Error("image mismatch");
          },
        });
      const receipt = await save(await studioFileContentVersion(source));
      const after = readFileSync(path, "utf8");
      expect(receipt.affectsInstances).toBe(2);
      expect(receipt.version).toBe(await studioFileContentVersion(after));
      expect(history.snapshot().state.undo).toHaveLength(1);
      const reopened = await open();
      expect((await reopened.undo(io)).ok).toBe(true);
      expect(readFileSync(path)).toEqual(Buffer.from(source));
      expect((await reopened.redo(io)).ok).toBe(true);
      expect(readFileSync(path)).toEqual(Buffer.from(after));
      await expect(save(await studioFileContentVersion(source))).rejects.toThrow("muuttunut");
      expect(readFileSync(path, "utf8")).toBe(after);
      await expect(
        save(receipt.version, {
          action: "add",
          kind: "image",
          name: "Kuva",
          image: { path: "assets/x.png", checksum: "wrong" },
        }),
      ).rejects.toThrow("image mismatch");
      expect(readFileSync(path, "utf8")).toBe(after);
      await expect(
        saveElementOperation({
          projectId: "p",
          sourceFile: "index.html",
          expectedVersion: receipt.version,
          operation: text,
          affectsInstances: 1,
          io: {
            ...io,
            recordEdit: async () => {
              throw new Error("history unavailable");
            },
          },
          verifyImage: async () => {},
        }),
      ).rejects.toThrow("history unavailable");
      expect(readFileSync(path)).toEqual(Buffer.from(after));
      const imageCandidate = await buildElementEdit(after, {
        action: "add",
        kind: "image",
        name: "Kuva",
        image: { path: "assets/missing.png", checksum: "wrong" },
      });
      writeFileSync(path, imageCandidate.after);
      await expect(
        save(await studioFileContentVersion(imageCandidate.after), {
          action: "duplicate",
          target: imageCandidate.target,
        }),
      ).rejects.toThrow("image mismatch");
      expect(readFileSync(path, "utf8")).toBe(imageCandidate.after);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
