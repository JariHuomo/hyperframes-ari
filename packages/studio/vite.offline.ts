import { appendFileSync } from "node:fs";
/** Explicit local acceptance mode, installed before the API/font module loads. */
export function installOfflineServerGuard() {
  if (process.env.ARI_OFFLINE_LOG)
    appendFileSync(process.env.ARI_OFFLINE_LOG, JSON.stringify({ installed: true }) + "\n");
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      if (process.env.ARI_OFFLINE_LOG)
        appendFileSync(process.env.ARI_OFFLINE_LOG, JSON.stringify({ blocked: url.href }) + "\n");
      return Promise.reject(new Error(`Offline Studio refused ${url.origin}`));
    }
    return original(input, init);
  };
}
