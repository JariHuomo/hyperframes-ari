#!/usr/bin/env node
/** Ari fork: start a local studio, optionally registering an existing project. */
import { existsSync, mkdirSync, realpathSync, cpSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    project: { type: "string" },
    port: { type: "string", default: "3077" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  process.stdout.write(
    "Ari Studio\n  bun run ari:studio [--project /absolute/project] [--port 3077]\nWithout --project, opens a private copy of the edit-loop sandbox.\nWith --project, edits are saved directly to that directory.\n",
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
process.stdout.write(`Ari Studio: http://127.0.0.1:${port}/#project/${projectId}\n`);
const child = spawn(
  "bun",
  ["run", "--cwd", "packages/studio", "dev", "--", "--port", String(port), "--strictPort"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      HYPERFRAMES_NO_TELEMETRY: "1",
      VITE_HYPERFRAMES_NO_TELEMETRY: "1",
      HYPERFRAMES_AUTO_PROXY: "false",
      PRODUCER_LOW_MEMORY_MODE: "1",
    },
  },
);
child.on("error", (error) => {
  process.stderr.write(
    `${error.message}\nUse bun run ari:studio (or npx --yes bun run ari:studio).\n`,
  );
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
