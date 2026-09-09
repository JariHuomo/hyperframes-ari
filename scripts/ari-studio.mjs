#!/usr/bin/env node
/** Ari fork: start a local studio, optionally registering an existing project. */
import {
  existsSync,
  mkdirSync,
  realpathSync,
  cpSync,
  symlinkSync,
  openSync,
  closeSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Ari: resolve an existing Bun, including an npx-cached install, without downloading.
function bunExecutablePath(executable) {
  try {
    const path = execFileSync(executable, ["-e", "process.stdout.write(process.execPath)"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return path && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}
function resolveBun() {
  for (const executable of [process.env.npm_execpath, join(homedir(), ".bun/bin/bun"), "bun"]) {
    if (!executable) continue;
    const path = bunExecutablePath(executable);
    if (path) return path;
  }
  return npxBunPath();
}
function npxBunPath() {
  try {
    return execFileSync(
      "npx",
      ["--no-install", "bun", "-e", "process.stdout.write(process.execPath)"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    throw new Error("Bun puuttuu. Asenna Bun tai suorita ensin: npx --yes bun --version");
  }
}
const { values } = parseArgs({
  options: {
    project: { type: "string" },
    port: { type: "string", default: "3077" },
    help: { type: "boolean" },
    background: { type: "boolean" },
  },
});
if (values.help) {
  process.stdout.write(
    "Ari Studio\n  node scripts/ari-studio.mjs [--project /absolute/project] [--port 3077] [--background]\nWithout --project, opens a private copy of the edit-loop sandbox.\nWith --project, edits are saved directly to that directory.\n",
  );
  process.exit(0);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Port must be 1024–65535.");
if (!existsSync(join(root, "packages/studio-server/dist/index.js"))) {
  throw new Error("First run: bun install --frozen-lockfile && bun run ari:build");
}
const projects = join(root, "packages/studio/data/projects");
mkdirSync(projects, { recursive: true });
let projectId = "ari-sandbox";
if (values.project) {
  const source = realpathSync(resolve(values.project));
  if (!existsSync(join(source, "index.html"))) throw new Error("Project needs an index.html file.");
  projectId = basename(source);
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId))
    throw new Error("Project folder name must use letters, digits, - or _.");
  const link = join(projects, projectId);
  if (existsSync(link)) {
    if (realpathSync(link) !== source)
      throw new Error(`Another project already uses ${projectId}.`);
  } else symlinkSync(source, link, "dir");
} else {
  const destination = join(projects, projectId);
  if (!existsSync(destination))
    cpSync(join(root, "packages/studio/tests/e2e/fixtures/webmcp-edit-loop"), destination, {
      recursive: true,
    });
}
if (!values.background)
  process.stdout.write(`Ari Studio: http://127.0.0.1:${port}/#project/${projectId}\n`);
const bun = resolveBun();
if (values.background) {
  let occupied;
  try {
    occupied = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
  } catch {}
  if (occupied) throw new Error(`Portti ${port} on jo käytössä. Valitse toinen portti.`);
}
const runtimeDir = join(root, ".ari-studio");
if (values.background) mkdirSync(runtimeDir, { recursive: true });
const logPath = join(runtimeDir, `${port}.log`);
const logFd = values.background ? openSync(logPath, "a") : undefined;
const child = spawn(
  bun,
  ["run", "--cwd", "packages/studio", "dev", "--", "--port", String(port), "--strictPort"],
  {
    cwd: root,
    stdio: logFd === undefined ? "inherit" : ["ignore", logFd, logFd],
    detached: Boolean(values.background),
    env: {
      ...process.env,
      PATH: `${dirname(bun)}:${resolve(dirname(bun), "../../.bin")}:${process.env.PATH ?? ""}`,
      HYPERFRAMES_NO_TELEMETRY: "1",
      VITE_HYPERFRAMES_NO_TELEMETRY: "1",
      HYPERFRAMES_AUTO_PROXY: "false",
      PRODUCER_LOW_MEMORY_MODE: "1",
    },
  },
);
if (logFd !== undefined) closeSync(logFd);
child.on("error", (error) => {
  process.stderr.write(
    `${error.message}\nUse bun run ari:studio (or npx --yes bun run ari:studio).\n`,
  );
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
if (values.background) {
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      ready = (
        await fetch(`http://127.0.0.1:${port}/api/projects`, { signal: AbortSignal.timeout(1000) })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  if (!ready) {
    if (child.pid && child.exitCode === null) process.kill(-child.pid, "SIGTERM");
    throw new Error(`Studio ei käynnistynyt. Tarkista loki: ${logPath}`);
  }
  child.unref();
  process.stdout.write(`Ari Studio: http://127.0.0.1:${port}/#project/${projectId}\n`);
  process.stdout.write(`PID ${child.pid}; loki: ${logPath}\n`);
} else {
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}
