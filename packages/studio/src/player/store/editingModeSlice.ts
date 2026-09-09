// Modified for Ari Studio; changes documented in /ARI.md.
/**
 * The two editing-mode toggles the timeline toolbar owns.
 *
 * A store slice rather than toolbar-local state because both are read far from
 * where they are set: the motion-path arm is consumed by the canvas click
 * handler and published by MotionPathOverlay, and the auto-keyframe flag
 * decides what a drag/resize/rotate does inside the edit commit path.
 *
 * `motionPathArmed` is also cleared by playerStore on selection change — arming
 * survives neither a new element nor a project switch, so those resets stay
 * with the state they clear alongside.
 */
import type { StoreApi } from "zustand";

export interface EditingModeSlice {
  /** Ari fork: shared so header actions can reveal panels hidden by focus mode. */
  studioFocusMode: boolean;
  setStudioFocusMode: (focused: boolean) => void;
  /** Motion-path "set destination" mode. Armed from the preview toolbar
   *  (replaces the old double-click-on-canvas UX); while armed, one canvas
   *  click places the new path's destination. */
  motionPathArmed: boolean;
  setMotionPathArmed: (armed: boolean) => void;
  /** Published by MotionPathOverlay so the toolbar shows the button only when
   *  the selected element can actually take a path. */
  motionPathCreateAvailable: boolean;
  setMotionPathCreateAvailable: (available: boolean) => void;
  /** Global toggle for the "Add keyframe" diamond in the timeline toolbar
   *  (#1808). When false, a manual drag/resize/rotate edit on an element that
   *  already has a live tween shifts every keyframe by the edit's delta
   *  (preserving the animation's shape) instead of inserting/updating a
   *  keyframe at the playhead. */
  autoKeyframeEnabled: boolean;
  setAutoKeyframeEnabled: (enabled: boolean) => void;
}

export function createEditingModeSlice(
  set: StoreApi<EditingModeSlice>["setState"],
): EditingModeSlice {
  return {
    studioFocusMode: true,
    setStudioFocusMode: (focused) => set({ studioFocusMode: focused }),
    motionPathArmed: false,
    setMotionPathArmed: (armed) => set({ motionPathArmed: armed }),
    motionPathCreateAvailable: false,
    setMotionPathCreateAvailable: (available) => set({ motionPathCreateAvailable: available }),
    // Ari fork: moving an element must not silently record motion after reload.
    autoKeyframeEnabled: false,
    setAutoKeyframeEnabled: (enabled) => set({ autoKeyframeEnabled: enabled }),
  };
}
