/** Ari motion presets: one source mutation and one undo entry. */
export interface StudioMotionOptions {
  preset?: "fade" | "slide" | "grow";
  position?: number;
  duration?: number;
  ease?: string;
}
export function motionPresetProperties(
  preset: StudioMotionOptions["preset"],
): Record<string, number> {
  switch (preset) {
    case "slide":
      return { opacity: 0, y: 80 };
    case "grow":
      return { opacity: 0, scale: 0.8 };
    default:
      return { opacity: 0 };
  }
}
