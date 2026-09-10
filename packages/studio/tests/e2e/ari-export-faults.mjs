import assert from "node:assert/strict";
import { injectRenderFailure, tool } from "./ari-acceptance-browser.mjs";
import { exportSceneAcceptance } from "./ari-scene-export.mjs";
/** Transport fault injection is separate from the visible authoring acceptance. */
export async function exportFaultAcceptance({ p, current, root, evidence, marker }) {
  if (process.env.ARI_SCENE_EXPORT !== "1") return;
  await injectRenderFailure(p);
  current.faultProof = { injected: "single POST transport 503", previousDownloadHidden: true };
  const before = current.export;
  current.expectedSourceFiles = before.meta.sourceFiles;
  current.mode = "retimed-inflight";
  const mutation = changeAfterSnapshot(p, marker);
  await exportSceneAcceptance({ p, current, root, evidence });
  current.faultProof.mutation = await mutation;
  assert(current.faultProof.mutation.ok, JSON.stringify(current.faultProof.mutation));
  assert.equal(current.export.meta.sourceRevision, before.meta.sourceRevision);
  assert.deepEqual(
    current.export.samples.map((s) => s.rgbSha256),
    before.samples.map((s) => s.rgbSha256),
  );
  current.checks.push(
    "failed export hides old download; retry succeeds; concurrent blue edit cannot change frozen red video",
  );
}
function changeAfterSnapshot(p, marker) {
  return new Promise((resolve, reject) => {
    const listener = async (response) => {
      if (!response.url().endsWith("/render") || response.request().method() !== "POST") return;
      p.off("response", listener);
      try {
        resolve(
          await tool(p, "studio_set_style", {
            handle: marker.handle,
            styles: { "background-color": "#2040e0" },
          }),
        );
      } catch (error) {
        reject(error);
      }
    };
    p.on("response", listener);
  });
}
