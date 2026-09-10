import { copyElementStyles } from "./elementStyleCopy";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";
import { parseGsapScriptAcornForWrite } from "@hyperframes/core/gsap-parser-acorn";

export type SceneOperation =
  | { action: "add"; name: string; duration: number; fileName: string }
  | { action: "rename"; target: string; name: string }
  | { action: "detach"; target: string; fileName: string }
  | { action: "duplicate" | "delete" | "earlier" | "later"; target: string };
const serializeScene = (doc: Document) => `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
function sceneName(value: string) {
  if (!value.trim() || value.length > 120) throw new Error("Anna kohtaukselle 1–120 merkin nimi.");
  return value.trim();
}
export function resolveScenePath(hostFile: string, relative: string) {
  if (!relative || /[\\?#:%]/.test(relative) || relative.startsWith("/"))
    throw new Error("Kohtauksen lähteen on oltava paikallinen HTML-tiedosto.");
  const parts = hostFile.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "..") {
      if (!parts.length) throw new Error("Kohtauksen polku poistuu projektista.");
      parts.pop();
    } else if (part !== "." && part) parts.push(part);
  }
  const path = parts.join("/");
  if (!path.endsWith(".html")) throw new Error("Valitse HTML-kohtaus.");
  return path;
}
const numeric = (node: Element, key: string, fallback?: number) => {
  const value = node.getAttribute(key);
  const number = value === null ? fallback : Number(value);
  if (number === undefined || !Number.isFinite(number))
    throw new Error(`Kohtauksen ${key} ei ole vakio.`);
  return number;
};
export function parseSceneHost(source: string, hostFile: string) {
  const doc = new DOMParser().parseFromString(ensureHfIds(source), "text/html");
  const root = doc.querySelector("[data-composition-id]");
  if (!root || root.hasAttribute("data-composition-src"))
    throw new Error("Avaa kohtauksen oma HTML-kooste ensin.");
  const duration = numeric(root, "data-duration");
  if (duration <= 0) throw new Error("Koosteen keston on oltava positiivinen.");
  const nodes = Array.from(root.querySelectorAll("[data-composition-src]"));
  if (nodes.some((node) => node.parentElement !== root))
    throw new Error("Ryhmitelty kohtausisäntä ei vielä tue aikajärjestelyä. Avaa sen oma kooste.");
  const rows = nodes
    .map((node) => ({
      target: node.getAttribute("data-hf-id")!,
      hostId: node.id,
      name: node.getAttribute("data-label") || node.id || "Kohtaus",
      sourceFile: resolveScenePath(hostFile, node.getAttribute("data-composition-src")!),
      start: numeric(node, "data-start", 0),
      duration: numeric(node, "data-duration"),
      playbackStart: numeric(node, "data-playback-start", 0),
      playbackRate: numeric(node, "data-playback-rate", 1),
    }))
    .sort((a, b) => a.start - b.start);
  validateSceneRows(rows);
  const baseDuration = rows[0]?.start ?? duration;
  validateSceneTiming(root, nodes, rows, duration, baseDuration);
  validateHostMotion(doc, nodes);
  return { doc, root, rows, nodes, duration, baseDuration };
}
function newSceneSource(
  id: string,
  label: string,
  duration: number,
  width: number,
  height: number,
) {
  const doc = new DOMParser().parseFromString(
    '<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8"></head><body></body></html>',
    "text/html",
  );
  const root = doc.createElement("div");
  root.id = `${id}-root`;
  root.setAttribute("data-hf-id", `${id}-root`);
  Object.entries({
    "data-composition-id": id,
    "data-duration": String(duration),
    "data-width": String(width),
    "data-height": String(height),
    "data-label": label,
  }).forEach(([key, value]) => root.setAttribute(key, value));
  root.setAttribute(
    "style",
    `position:relative;width:${width}px;height:${height}px;font-family:Arial,sans-serif`,
  );
  const background = doc.createElement("div");
  background.id = `${id}-background`;
  background.setAttribute("data-hf-id", background.id);
  background.className = "clip";
  Object.entries({
    "data-start": "0",
    "data-duration": String(duration),
    "data-track-index": "0",
    "data-label": "Tausta",
    style: "position:absolute;inset:0;background:#f2eedf",
  }).forEach(([key, value]) => background.setAttribute(key, value));
  root.append(background);
  doc.body.append(root);
  const script = doc.createElement("script");
  script.textContent = `(() => { const tl = gsap.timeline({paused:true}); tl.fromTo('#${background.id}', {opacity:0}, {opacity:1,duration:0.4,ease:'power1.out'},0); window.__timelines = window.__timelines || {}; window.__timelines[${JSON.stringify(id)}] = tl; })();`;
  doc.body.append(script);
  return serializeScene(doc);
}
export function editSceneHost(
  source: string,
  hostFile: string,
  operation: Exclude<SceneOperation, { action: "detach" }>,
) {
  const state = parseSceneHost(source, hostFile);
  const { doc, root, rows, baseDuration } = state;
  let ordered = rows.map(
    (row) => state.nodes.find((node) => node.getAttribute("data-hf-id") === row.target)!,
  );
  let node: Element;
  let created: { path: string; content: string } | undefined;
  if (operation.action === "add") {
    const added = addSceneNode(doc, root, hostFile, operation);
    node = added.node;
    created = added.created;
    ordered.push(node);
  } else node = editExistingScene(doc, rows, ordered, operation);
  let end = baseDuration;
  for (const [index, host] of ordered.entries()) {
    host.setAttribute("data-start", String(Number(end.toFixed(6))));
    host.setAttribute("data-track-index", String(index + 10));
    // Managed scene plates sit above the base canvas; preserve an authored override.
    (host as HTMLElement).style.zIndex ||= String(index + 10);
    end += Number(host.getAttribute("data-duration"));
    root.append(host);
  }
  if (end <= 0) throw new Error("Mainokseen on jätettävä vähintään yksi kohtaus.");
  root.setAttribute("data-duration", String(Number(end.toFixed(6))));
  const after = serializeScene(doc);
  return {
    after,
    created,
    target: node.getAttribute("data-hf-id")!,
    deleted: operation.action === "delete",
    beforeDuration: state.duration,
    afterDuration: end,
    rows: parseSceneHost(after, hostFile).rows,
  };
}

type SceneRow = ReturnType<typeof parseSceneHost>["rows"][number];
function validateSceneRows(rows: SceneRow[]) {
  if (
    rows.some(
      (r) =>
        !r.hostId || r.duration <= 0 || r.start < 0 || r.playbackStart < 0 || r.playbackRate <= 0,
    )
  )
    throw new Error(
      "Kohtaus tarvitsee yksilöllisen tunnisteen, positiivisen keston ja vakionopeuden.",
    );
  if (new Set(rows.map((r) => r.hostId)).size !== rows.length)
    throw new Error("Kohtausten tunnisteet törmäävät.");
}
function validateSceneTiming(
  root: Element,
  nodes: Element[],
  rows: SceneRow[],
  duration: number,
  baseDuration: number,
) {
  let end = baseDuration;
  for (const row of rows) {
    if (Math.abs(row.start - end) > 0.000001)
      throw new Error(
        "Päällekkäistä tai aukollista kohtausjonoa ei voi järjestää tässä näkymässä.",
      );
    end += row.duration;
  }
  if (Math.abs(end - duration) > 0.000001)
    throw new Error("Kohtausjonon loppu ei vastaa koosteen kestoa.");
  // Root-owned clips must remain in the unchanged introduction.
  if (
    rows.length &&
    Array.from(root.children).some(
      (node) =>
        !nodes.includes(node) &&
        node.classList.contains("clip") &&
        numeric(node, "data-start", 0) + numeric(node, "data-duration", 0) >
          baseDuration + 0.000001,
    )
  )
    throw new Error("Kohtausjonon kanssa päällekkäinen muu sisältö estää aikajärjestelyn.");
}
function validateHostMotion(doc: Document, nodes: Element[]) {
  for (const script of Array.from(doc.querySelectorAll("script:not([src])"))) {
    const parsed = parseGsapScriptAcornForWrite(script.textContent ?? "");
    if (
      parsed?.located.some(
        ({ animation }) =>
          animation.hasUnresolvedSelector ||
          (() => {
            try {
              return Array.from(doc.querySelectorAll(animation.targetSelector)).some((n) =>
                nodes.includes(n),
              );
            } catch {
              return true;
            }
          })(),
      )
    )
      throw new Error(
        "Isäntään kohdistuva tai dynaaminen liike estää kohtausjärjestelyn. Muokkaa liikettä kohtauksen sisällä.",
      );
  }
}

function addSceneNode(
  doc: Document,
  root: Element,
  hostFile: string,
  operation: Extract<SceneOperation, { action: "add" }>,
) {
  if (!/^[a-z0-9][a-z0-9-]{0,70}\.html$/.test(operation.fileName))
    throw new Error(
      "Tiedoston nimessä sallitaan pienet kirjaimet, numerot ja yhdysmerkki sekä .html-pääte.",
    );
  if (!Number.isFinite(operation.duration) || operation.duration < 0.5 || operation.duration > 120)
    throw new Error("Kohtauksen keston on oltava 0,5–120 sekuntia.");
  const id = `scene-${operation.fileName.slice(0, -5)}`;
  if (doc.getElementById(id) || doc.querySelector(`[data-hf-id="${id}"]`))
    throw new Error("Kohtauksen tunniste on jo käytössä.");
  const path = resolveScenePath(hostFile, `scenes/${operation.fileName}`);
  const created = {
    path,
    content: newSceneSource(
      id,
      sceneName(operation.name),
      operation.duration,
      Number(root.getAttribute("data-width") || 1080),
      Number(root.getAttribute("data-height") || 1920),
    ),
  };
  const node = doc.createElement("div");
  node.id = id;
  node.className = "clip";
  Object.entries({
    "data-hf-id": id,
    "data-composition-id": id,
    "data-composition-src": `scenes/${operation.fileName}`,
    "data-label": sceneName(operation.name),
    "data-duration": String(operation.duration),
    "data-playback-rate": "1",
    "data-playback-start": "0",
    style: "position:absolute;inset:0",
  }).forEach(([key, value]) => node.setAttribute(key, value));
  root.append(node);
  return { node, created };
}
function editExistingScene(
  doc: Document,
  rows: SceneRow[],
  ordered: Element[],
  operation: Exclude<SceneOperation, { action: "add" }>,
) {
  let node: Element;
  const index = rows.findIndex((r) => r.target === operation.target);
  if (index < 0) throw new Error("Kohtaus on poistettu tai valinta on vanhentunut.");
  node = ordered[index]!;
  if (operation.action === "rename") node.setAttribute("data-label", sceneName(operation.name));
  if (operation.action === "delete") {
    node.remove();
    ordered.splice(index, 1);
  }
  if (operation.action === "duplicate") {
    node = duplicateSceneNode(doc, node, rows[index]!.name);
    ordered.splice(index + 1, 0, node);
  }
  if (operation.action === "earlier" || operation.action === "later") {
    moveSceneNode(ordered, index, operation.action);
  }
  return node;
}

function duplicateSceneNode(doc: Document, node: Element, name: string) {
  const copy = node.cloneNode(true);
  if (!(copy instanceof Element)) throw new Error("Kopiointi epäonnistui.");
  let n = 1;
  const identifiers = new Set(
    Array.from(doc.querySelectorAll("[id],[data-hf-id]")).flatMap((element) => [
      element.id,
      element.getAttribute("data-hf-id"),
    ]),
  );
  while (identifiers.has(`${node.id}-copy-${n}`)) n++;
  copy.id = `${node.id}-copy-${n}`;
  copy.setAttribute("data-hf-id", copy.id);
  copyElementStyles(doc, node, copy.id);
  copy.setAttribute("data-composition-id", copy.id);
  copy.setAttribute("data-label", `${name} (kopio)`);
  node.after(copy);
  return copy;
}

function moveSceneNode(ordered: Element[], index: number, direction: "earlier" | "later") {
  const next = index + (direction === "earlier" ? -1 : 1);
  if (next < 0 || next >= ordered.length) throw new Error("Kohtaus on jo jonon reunassa.");
  [ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
}
