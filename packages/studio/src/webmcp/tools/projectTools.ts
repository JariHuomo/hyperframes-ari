import type { ModelContextTool } from "../types";
import { toolFailure } from "../toolResult";
import { buildProjectHash } from "../../utils/projectRouting";

async function authoringRequest(
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, init);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Studion vastausta ei voitu lukea.");
  if (!response.ok || Reflect.get(result, "ok") === false)
    throw new Error(String(Reflect.get(result, "error") ?? "Toiminto ei onnistunut."));
  return Object.fromEntries(Object.entries(result));
}
const post = (path: string, input: object) =>
  authoringRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
const schema = (properties: object = {}, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const nameField = { type: "string", minLength: 1, maxLength: 80 };
const templateField = { type: "string", enum: ["blank", "product"] };

/** Both visible controls and discovered agent tools call these same services.
 * Image inputs contain explicitly selected bytes, never a server filesystem path.
 */
export function projectTools(getProjectId: () => string | null): ModelContextTool[] {
  function activePath() {
    const id = getProjectId();
    if (!id) throw new Error("Avaa mainos ennen aineiston tuontia.");
    return `/api/ari/projects/${encodeURIComponent(id)}`;
  }
  function tool(
    name: string,
    title: string,
    description: string,
    inputSchema: object,
    action: (input: object, signal: AbortSignal) => Promise<unknown>,
    readOnlyHint = false,
  ): ModelContextTool {
    return {
      name,
      title,
      description,
      inputSchema,
      annotations: { readOnlyHint, untrustedContentHint: true },
      execute: async (input, { signal }) => {
        if (signal.aborted)
          return toolFailure("blocked", "Toiminto keskeytettiin ennen tallennusta.");
        try {
          return await action(input, signal);
        } catch (error) {
          return toolFailure(
            "failed",
            error instanceof Error ? error.message : "Toiminto ei onnistunut.",
          );
        }
      },
    };
  }
  return [
    tool(
      "studio_projects",
      "Mainokset ja pohjat",
      "List local projects and creation options. Returns ok, projects, options including the host-approved root and 7 s 1080×1920 templates. No write.",
      schema(),
      async () => ({
        ok: true,
        ...(await authoringRequest("/api/projects")),
        options: await authoringRequest("/api/ari/projects/options"),
      }),
      true,
    ),
    tool(
      "studio_prepare_project",
      "Tarkista uuden mainoksen tiedot",
      "Return ok and project with name, id, dir, template and duration before creation. Does not write. Use returned dir as location in studio_create_project.",
      schema({ name: nameField, template: templateField }, ["name", "template"]),
      (input) => post("/api/ari/projects/propose", input),
      true,
    ),
    tool(
      "studio_create_project",
      "Luo mainos",
      "Create a new local 7 s portrait ad. Requires reviewed name, template and exact location from studio_prepare_project. Refuses existing directories. Returns ok, stage saved, project, file versions, affectsProjects:1. Does not open automatically; use studio_open_project.",
      schema({ name: nameField, template: templateField, location: { type: "string" } }, [
        "name",
        "template",
        "location",
      ]),
      (input) => post("/api/ari/projects/create", input),
    ),
    tool(
      "studio_open_project",
      "Avaa mainos",
      "Open an existing local project by id from studio_projects or a creation receipt. Returns ok and stage opened. Await studio_look for the loaded state before editing.",
      schema({ id: { type: "string" } }, ["id"]),
      async (input) => {
        const id = Reflect.get(input, "id");
        if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))
          throw new Error("Projektin tunniste ei kelpaa.");
        const listing = await authoringRequest("/api/projects");
        if (
          !Array.isArray(listing.projects) ||
          !listing.projects.some(
            (item) => item && typeof item === "object" && Reflect.get(item, "id") === id,
          )
        )
          throw new Error("Projektia ei löydy.");
        window.location.hash = buildProjectHash(id);
        return { ok: true, stage: "opened", projectId: id };
      },
    ),
    tool(
      "studio_import_images",
      "Lisää aineistoa",
      "Import selected PNG/JPEG/WebP bytes into the active project. files is 1–20 {name,base64} objects (raw base64, max 8 MiB and 16 MP each). No paths or URLs are read. Each result has its own ok/error; successful files survive other rejections. Receipt includes copied path, checksum, dimensions and version. No undo/delete of media in A2.",
      schema(
        {
          files: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: schema({ name: { type: "string" }, base64: { type: "string" } }, [
              "name",
              "base64",
            ]),
          },
        },
        ["files"],
      ),
      async (input, signal) => {
        const path = activePath();
        const files = Reflect.get(input, "files");
        if (!Array.isArray(files) || !files.length || files.length > 20)
          throw new Error("Valitse 1–20 kuvaa.");
        const results = [];
        for (const file of files) {
          results.push(await importOneImage(activePath, path, file, signal));
        }
        if (!results.some((result) => result.ok === true))
          return {
            ok: false,
            kind: "failed",
            reason: "Yhtään kuvaa ei tuotu.",
            stage: "not_saved",
            partial: false,
            results,
          };
        return {
          ok: true,
          stage: "saved",
          partial: results.some((result) => result.ok === false),
          results,
        };
      },
    ),
    tool(
      "studio_images",
      "Lue aineistohylly",
      "List verified copied images in the active project. Returns ok, projectId and assets with path, checksum, dimensions and bytes. No write.",
      schema(),
      () => authoringRequest(`${activePath()}/images`),
      true,
    ),
  ];
}

function imageFields(file: unknown) {
  if (!file || typeof file !== "object") throw new Error("Kuvan tiedot puuttuvat.");
  const name = Reflect.get(file, "name"),
    base64 = Reflect.get(file, "base64");
  if (typeof name !== "string" || typeof base64 !== "string")
    throw new Error("Kuvan nimi ja sisältö tarvitaan.");
  if (base64.length > 4 * Math.ceil((8 * 1024 * 1024) / 3))
    throw new Error("Kuva on liian suuri. Enimmäiskoko on 8 MiB.");
  return { name, base64 };
}
async function importOneImage(
  activePath: () => string,
  path: string,
  file: unknown,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  try {
    if (signal.aborted) throw new Error("Tuonti keskeytettiin. Aiemmin tuodut kuvat säilyvät.");
    if (activePath() !== path)
      throw new Error("Aktiivinen mainos vaihtui. Valitse kuvat uudelleen.");
    const { name, base64 } = imageFields(file);
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return await authoringRequest(`${path}/images?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Kuvaa ei voitu tuoda." };
  }
}
