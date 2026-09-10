import { afterEach, expect, it, vi } from "vitest";
import { nullableProjectFiles } from "./nullableProjectFiles";
import { studioFileContentVersion } from "./studioFileVersion";

afterEach(() => vi.unstubAllGlobals());

it("reads absence distinctly and sends explicit creation/deletion preconditions", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ok: true, content: null }))
    .mockResolvedValueOnce(Response.json({ ok: true, content: "" }))
    .mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const io = nullableProjectFiles("project");
  expect(await io.readFile("new.html")).toBeNull();
  expect(await io.readFile("empty.html")).toBe("");
  await io.writeFile("new.html", "", null);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
    files: [{ path: "new.html", content: "", expectedVersion: null }],
  });
  await io.writeFile("empty.html", null, "");
  expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({
    files: [
      { path: "empty.html", content: null, expectedVersion: await studioFileContentVersion("") },
    ],
  });
  await expect(io.writeFile("a.html", null)).rejects.toThrow("lähtötilanne");
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("refuses failed reads rather than interpreting them as missing files", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 404 })));
  await expect(nullableProjectFiles("p").readFile("a.html")).rejects.toThrow("lukea");
});

it("propagates server conflicts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ok: false, error: "conflict" }, { status: 409 })),
  );
  await expect(nullableProjectFiles("p").writeFile("a.html", "", null)).rejects.toThrow("conflict");
});
