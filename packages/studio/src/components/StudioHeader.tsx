// Modified for Ari Studio; changes documented in /ARI.md.
import { useRef, type MouseEvent } from "react";
import { RotateCcw, RotateCw, Camera } from "../icons/SystemIcons";
import { getHistoryShortcutLabel } from "../utils/studioHelpers";
import { useStudioShellContext } from "../contexts/StudioContext";
import { usePanelLayoutContext } from "../contexts/PanelLayoutContext";
import { useViewMode, type StudioViewMode } from "../contexts/ViewModeContext";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { Tooltip } from "./ui";
import { usePlayerStore } from "../player";

export interface StudioHeaderProps {
  captureFrameHref: string;
  captureFrameFilename: string;
  handleCaptureFrameClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  refreshCaptureFrameTime: () => void;
  capturing?: boolean;
  inspectorButtonActive: boolean;
  inspectorPanelActive: boolean;
  onExport?: () => void;
}

// Ari fork branding; upstream attribution remains in LICENSE and ARI.md.
function HyperframesLogo() {
  return (
    <div aria-label="Ari Studio — HyperFrames fork" className="leading-tight">
      <span className="text-lg font-semibold tracking-tight text-emerald-200">Ari Studio</span>
      <span className="block text-[10px] text-neutral-400">powered by HyperFrames</span>
    </div>
  );
}

const VIEW_MODE_OPTIONS: Array<{ mode: StudioViewMode; label: string }> = [
  { mode: "storyboard", label: "Storyboard" },
  { mode: "timeline", label: "Preview" },
];

/** Segmented control switching the main stage between storyboard and preview. */
export function ViewModeToggle() {
  const { viewMode, setViewMode } = useViewMode();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectMode = (mode: StudioViewMode) => {
    if (mode === viewMode) return;
    if (setViewMode(mode)) trackStudioEvent("view_mode_toggle", { mode });
  };

  // Complete APG tabs pattern: roving tabIndex + arrow-key navigation.
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowLeft" ? -1 : 1;
    const next = (index + dir + VIEW_MODE_OPTIONS.length) % VIEW_MODE_OPTIONS.length;
    tabRefs.current[next]?.focus();
    selectMode(VIEW_MODE_OPTIONS[next].mode);
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-md bg-neutral-800 p-0.5"
      role="tablist"
      aria-label="Studio view"
    >
      {VIEW_MODE_OPTIONS.map(({ mode, label }, index) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => selectMode(mode)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`rounded px-3 py-1 text-[11px] font-medium transition-colors active:scale-[0.98] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-studio-accent ${
              active ? "bg-neutral-200 text-neutral-900" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Does the header's Inspector button open the panel, or close it?
 *
 * Takes the EFFECTIVE collapse state, so a panel the window has railed away
 * counts as closed even though the user's stored intent still says open. The
 * argument name is the guard: passing raw intent here is the bug this exists
 * to keep out.
 */
export function shouldOpenInspector(
  effectiveRightCollapsed: boolean,
  inspectorPanelActive: boolean,
): boolean {
  return effectiveRightCollapsed || !inspectorPanelActive;
}

// fallow-ignore-next-line complexity
export function StudioHeader({
  captureFrameHref,
  captureFrameFilename,
  handleCaptureFrameClick,
  refreshCaptureFrameTime,
  capturing,
  inspectorButtonActive,
  inspectorPanelActive,
  onExport,
}: StudioHeaderProps) {
  const { projectId, editHistory, handleUndo, handleRedo, renderQueue } = useStudioShellContext();
  // effectiveRightCollapsed, not the raw intent: in the auto-railed state the
  // intent is still "open" while the panel is hidden, so branching on intent
  // made this button write rightCollapsed=true — and that value is synced into
  // the shareable Studio URL, so a dead click would rewrite a link.
  const { effectiveRightCollapsed, setRightCollapsed, setRightPanelTab } = usePanelLayoutContext();
  const focusMode = usePlayerStore((state) => state.studioFocusMode);
  const setFocusMode = usePlayerStore((state) => state.setStudioFocusMode);
  const inspectorVisible = inspectorButtonActive && !focusMode;
  const isRendering = renderQueue.isRendering;
  const ffmpegMissing = renderQueue.ffmpegMissing;

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-neutral-900 border-b border-neutral-800 flex-shrink-0">
      {/* Left: logo + project name */}
      <div className="flex items-center gap-3">
        <HyperframesLogo />
        <span className="text-neutral-700 select-none" aria-hidden="true">
          |
        </span>
        <span className="text-[11px] font-medium text-neutral-300">{projectId}</span>
      </div>
      {/* Center: storyboard / preview toggle */}
      <ViewModeToggle />
      {/* Right: toolbar buttons */}
      <div className="flex items-center gap-1.5">
        <Tooltip
          label={
            editHistory.undoLabel
              ? `Undo ${editHistory.undoLabel} (${getHistoryShortcutLabel("undo")})`
              : `Undo (${getHistoryShortcutLabel("undo")})`
          }
          side="bottom"
        >
          <button
            type="button"
            onClick={() => {
              trackStudioEvent("toolbar_action", { action: "undo" });
              void handleUndo();
            }}
            disabled={!editHistory.canUndo}
            className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors active:scale-[0.98] ${
              editHistory.canUndo
                ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                : "text-neutral-700 cursor-default"
            }`}
            aria-label="Undo"
          >
            <RotateCcw size={14} />
          </button>
        </Tooltip>
        <Tooltip
          label={
            editHistory.redoLabel
              ? `Redo ${editHistory.redoLabel} (${getHistoryShortcutLabel("redo")})`
              : `Redo (${getHistoryShortcutLabel("redo")})`
          }
          side="bottom"
        >
          <button
            type="button"
            onClick={() => {
              trackStudioEvent("toolbar_action", { action: "redo" });
              void handleRedo();
            }}
            disabled={!editHistory.canRedo}
            className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors active:scale-[0.98] ${
              editHistory.canRedo
                ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                : "text-neutral-700 cursor-default"
            }`}
            aria-label="Redo"
          >
            <RotateCw size={14} />
          </button>
        </Tooltip>
        <Tooltip label={capturing ? "Capturing frame…" : "Capture current frame"} side="bottom">
          <a
            href={captureFrameHref}
            download={captureFrameFilename}
            onClick={(e) => {
              if (capturing) {
                e.preventDefault();
                return;
              }
              trackStudioEvent("toolbar_action", { action: "capture_frame" });
              handleCaptureFrameClick(e);
            }}
            onFocus={refreshCaptureFrameTime}
            onPointerDown={refreshCaptureFrameTime}
            aria-disabled={capturing || undefined}
            className={`h-7 flex items-center gap-1.5 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
              capturing
                ? "text-neutral-600 cursor-default"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 active:scale-[0.98]"
            }`}
            aria-label={capturing ? "Capturing frame" : "Capture current frame"}
          >
            {capturing ? (
              <svg
                className="animate-spin motion-reduce:animate-none h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <Camera size={14} />
            )}
            <span>{capturing ? "Capturing…" : "Capture"}</span>
          </a>
        </Tooltip>
        <Tooltip label="Inspector" side="bottom">
          <button
            type="button"
            onClick={() => {
              if (shouldOpenInspector(effectiveRightCollapsed || focusMode, inspectorPanelActive)) {
                setFocusMode(false);
                trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: false });
                setRightPanelTab("design");
                setRightCollapsed(false);
                return;
              }
              trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: true });
              // Keep the current selection when collapsing the Inspector — closing
              // the panel shouldn't deselect the element.
              setRightCollapsed(true);
            }}
            aria-pressed={inspectorVisible}
            className={`h-7 flex items-center gap-1.5 px-2.5 rounded-md text-[11px] font-medium border transition-colors active:scale-[0.98] ${
              inspectorVisible
                ? "text-studio-accent bg-studio-accent/10 border-studio-accent/30"
                : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 border-transparent"
            }`}
            aria-label="Inspector"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
            </svg>
            Inspector
          </button>
        </Tooltip>
        <Tooltip
          label={
            ffmpegMissing
              ? "FFmpeg is not installed. Opens the Renders panel with the install command."
              : isRendering
                ? "A render is already in progress"
                : "Render and export this composition"
          }
          side="bottom"
        >
          <button
            type="button"
            disabled={isRendering}
            onClick={() => {
              if (isRendering) return;
              setFocusMode(false);
              setRightPanelTab("renders");
              setRightCollapsed(false);
              // Without an encoder this render cannot finish, so the click
              // delivers the user to the prompt that fixes it instead of
              // queueing a job that exists only to fail. Disabling the button
              // would leave them staring at a dead control with no route to
              // the explanation.
              if (ffmpegMissing) return;
              onExport?.();
            }}
            className="h-7 flex items-center gap-1.5 px-3 rounded-md text-[11px] font-semibold bg-studio-accent text-[#09090B] enabled:hover:brightness-110 transition-[filter,transform] enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRendering ? "Rendering…" : "Export"}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
