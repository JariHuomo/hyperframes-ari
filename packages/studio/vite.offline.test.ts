import { afterEach, expect, it, vi } from "vitest";
import { installOfflineServerGuard } from "./vite.offline";
afterEach(() => vi.unstubAllGlobals());
it("blocks font metadata and remote assets before fetch while permitting the local API", async () => {
  const fetch = vi.fn(async () => new Response("local"));
  vi.stubGlobal("fetch", fetch);
  installOfflineServerGuard();
  await expect(globalThis.fetch("https://fonts.google.com/metadata/fonts")).rejects.toThrow(
    "Offline",
  );
  await expect(globalThis.fetch(new Request("https://example.com/image.png"))).rejects.toThrow(
    "Offline",
  );
  expect(fetch).not.toHaveBeenCalled();
  await globalThis.fetch("http://127.0.0.1:3084/api/projects");
  expect(fetch).toHaveBeenCalledOnce();
});
