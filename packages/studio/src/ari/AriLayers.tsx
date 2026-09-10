import { buildStudioLook, type StudioLookSnapshot } from "../webmcp/tools/lookTools";
import type { AriAgentBridge } from "./agentBridge";
export function AriLayers({
  bridge,
  getSnapshot,
  busy,
}: {
  bridge: AriAgentBridge;
  getSnapshot: () => StudioLookSnapshot;
  busy: boolean;
}) {
  const look = buildStudioLook(getSnapshot(), { limit: 100 });
  return (
    <nav
      aria-label="Tasot"
      className="h-full overflow-auto border-r border-neutral-600 bg-[#202525] p-2 text-neutral-100"
    >
      <h2 className="px-2 py-3 text-sm font-semibold">Tasot</h2>
      {look.ok &&
        // A scene hosted twice contributes the SAME element handle once per
        // placement, so the handle alone is not a unique React key: the second
        // row was dropped and every render logged a duplicate-key warning.
        // Both rows are real placements, so they are kept and keyed by position.
        look.elements.flatMap((e, index) => {
          // One source identity may occur in several hosts. Render each choice once.
          if (look.elements.findIndex((row) => row.handle === e.handle) !== index) return [];
          const scene = look.scenes.find((row) => row.sourceFile === e.sourceFile);
          return (scene?.instances.length ? scene.instances : [null]).map((instance) => (
            <button
              key={`${e.handle}:${instance?.hostId ?? "root"}`}
              aria-pressed={
                look.selection?.handle === e.handle &&
                (!instance || scene?.instance === instance.hostId)
              }
              className="mb-1 block min-h-10 w-full rounded border border-neutral-600 px-2 py-2 text-left text-xs hover:bg-neutral-700 aria-pressed:border-emerald-400 aria-pressed:bg-emerald-950"
              disabled={busy}
              onClick={() =>
                void bridge.call("studio_select", {
                  handle: e.handle,
                  ...(instance ? { instance: instance.hostId } : {}),
                })
              }
            >
              <span className="block break-words">
                {e.label}
                {instance ? ` · ${instance.label}` : ""}
              </span>
              <span className="block truncate text-[10px] text-neutral-400">{e.sourceFile}</span>
            </button>
          ));
        })}
    </nav>
  );
}
