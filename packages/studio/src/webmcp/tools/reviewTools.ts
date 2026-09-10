import type { ModelContextTool } from "../types";
import { toolFailure } from "../toolResult";
import { reviewPackages } from "../../utils/reviewPackages";

/**
 * Ari · review package tools (D4)
 *
 * The same five bounded commands the visible Tarkistus view uses, over the
 * same service. Preparing a package produces something to LOOK at: a whole
 * video, its first and last frame, and the frames around every changed motion
 * boundary. It is never an assessment. Nothing here records that anyone
 * watched anything, and no result may be reported as a quality approval.
 *
 * The two assessment commands record and read what a named reviewer SAID about
 * one package, in four separate categories. They are the only place a judgement
 * enters, they never invent one, and a category nobody assessed reads back as
 * `missing`. `reviewerType` has no `technical` value: ffprobe, frame extraction
 * and this repository's own browser journeys are measurements reported beside
 * the categories, never inside them. Recording an assessment is still not a
 * release approval — that is D7.
 */
const definitions = [
  {
    name: "studio_prepare_review_package",
    title: "Valmistele tarkistuspaketti",
    write: true,
    description:
      "Render one frozen version into a persistent, verified review package: the whole MP4, its first and last frame, and frames before/at/after every changed motion boundary against optional previousVersionId. Returns the published manifest with coverage, coverageNotes and every asset checksum. Slow: it renders locally and settles only when the package is published. Preparation writes only inside the package directory and changes no source revision, version index or undo history; a failed attempt publishes nothing and can be retried. Preparing is not viewing and never a quality approval.",
  },
  {
    name: "studio_list_review_packages",
    title: "Tarkistuspaketit",
    write: false,
    description:
      "List this project's published review packages, newest first, with version binding, coverage and measured video facts. A row is a menu entry, not an integrity certificate: readable:false marks a package whose manifest no longer validates. Read one to verify its assets.",
  },
  {
    name: "studio_read_review_package",
    title: "Lue tarkistuspaketti",
    write: false,
    description:
      "Read one published package by packageId. The server re-validates the manifest, every frame binding and the length and SHA-256 of every asset before answering, and refuses a package whose media is missing or altered. Assets are fetched from assetUrls, which serve only manifest-listed paths.",
  },
  {
    name: "studio_record_review_assessment",
    title: "Kirjaa tarkistuksen arvio",
    write: true,
    description:
      "Record ONE named reviewer's judgement about one published package in one category (message, layout, motion, audio). Requires packageId, category, reviewer, reviewerType (human, external_agent or test_data — automation must use test_data), verdict (ok or fix), text, wholeVideoWatched and checkedBoundaries ('all' or indexes into this package's boundaries). Conditional on expectedToken from studio_read_review_assessments; a stale token is refused so a concurrent reviewer's row is never lost. The package's version, source revision and declared coverage are copied from the verified manifest, not from this input. Writes only the project notebook: no source revision, version index or undo history changes. This is a recorded opinion, never a measurement and never a release approval.",
  },
  {
    name: "studio_read_review_assessments",
    title: "Lue tarkistuksen arviot",
    write: false,
    description:
      "Read every package's four assessment categories with the notebook token needed to write. Each category is missing, current or stale; missing means nobody assessed it and must never be reported as passed. measured is technical ffprobe data about the render — measured.audio false means the render carried no audio stream, which leaves the audio assessment missing rather than approved. An assessment recorded against an older source revision, or one whose package can no longer be read, stays in history and is marked stale with its reasons.",
  },
] as const;

export function reviewTools(getProjectId: () => string | null): ModelContextTool[] {
  return definitions.map(({ name, title, write, description }) => ({
    name,
    title,
    description,
    inputSchema: {
      type: "object",
      properties: {
        versionId: { type: "string" },
        previousVersionId: { type: ["string", "null"] },
        packageId: { type: "string" },
        expectedToken: { type: ["string", "null"] },
        category: { type: "string", enum: ["message", "layout", "motion", "audio"] },
        reviewer: { type: "string" },
        reviewerType: { type: "string", enum: ["human", "external_agent", "test_data"] },
        verdict: { type: "string", enum: ["ok", "fix"] },
        text: { type: "string" },
        wholeVideoWatched: { type: "boolean" },
        checkedBoundaries: {
          anyOf: [
            { type: "string", enum: ["all"] },
            { type: "array", items: { type: "number" } },
          ],
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: !write, untrustedContentHint: true },
    execute: async (input, context) => {
      try {
        const projectId = getProjectId();
        if (!projectId || context.signal.aborted) throw new Error("Avaa mainos ensin.");
        return await dispatch(name, projectId, input);
      } catch (error) {
        return toolFailure(
          "failed",
          error instanceof Error ? error.message : "Tarkistustoiminto epäonnistui.",
        );
      }
    },
  }));
}

/** One place where a command name becomes a call on the shared service. */
async function dispatch(name: string, projectId: string, input: object) {
  const service = reviewPackages(projectId);
  if (name === "studio_read_review_assessments")
    return { ...(await service.assessments()), projectId, approved: false };
  if (name === "studio_record_review_assessment") {
    const recorded = await service.recordAssessment({
      ...input,
      packageId: required(input, "packageId"),
    });
    return { ...recorded, projectId, approved: false };
  }
  if (name === "studio_list_review_packages")
    return { ok: true, projectId, packages: await service.list() };
  if (name === "studio_read_review_package")
    return receipt(projectId, await service.read(required(input, "packageId")));
  const previous = Reflect.get(input, "previousVersionId");
  return receipt(
    projectId,
    await service.prepare(
      required(input, "versionId"),
      typeof previous === "string" && previous.trim() ? previous : null,
    ),
  );
}

function required(input: object, key: string): string {
  const value = Reflect.get(input, key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Kenttä ${key} puuttuu.`);
  return value;
}

/** URLs are derived here so the agent never has to guess a path into the package. */
function receipt(
  projectId: string,
  manifest: Awaited<ReturnType<ReturnType<typeof reviewPackages>["read"]>>,
) {
  const service = reviewPackages(projectId);
  const url = (path: string) => service.assetUrl(manifest.id, path);
  return {
    ok: true,
    projectId,
    package: manifest,
    viewed: false,
    approved: false,
    assetUrls: {
      video: url(manifest.video.path),
      previousVideo: manifest.previousVideo ? url(manifest.previousVideo.path) : null,
      frames: manifest.frames.map((frame) => ({ ...frame, url: url(frame.path) })),
      boundaryFrames: manifest.boundaryFrames.map((frame) => ({ ...frame, url: url(frame.path) })),
    },
  };
}
