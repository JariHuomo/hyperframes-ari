/**
 * Ari: play exactly one motion's span, once or twice, then stop.
 *
 * The panel's "Toista liike" and "Vertaa edelliseen" both need the same thing:
 * seek to the tween's start, play, and stop ON its end instead of running to
 * the end of the composition. The player has no "play a range" primitive, so
 * the end is watched through `liveTime` — the same subscription the timeline
 * readout uses — and playback is stopped from there.
 *
 * Returns a stop function. Calling it (unmount, a second click) cancels the
 * subscription and leaves the playhead where it is, so a replay can never keep
 * a runaway listener alive after its panel is gone.
 */

import { liveTime, usePlayerStore } from "../player/store/playerStore";

export function replayMotion({
  position,
  duration,
  passes = 1,
}: {
  position: number;
  duration: number;
  passes?: number;
}): () => void {
  const end = position + duration;
  let remaining = Math.max(1, passes);
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribe?.();
    unsubscribe = null;
  };
  unsubscribe = liveTime.subscribe((time) => {
    if (stopped || time < end) return;
    remaining -= 1;
    const player = usePlayerStore.getState();
    if (remaining > 0) {
      // Straight back to the start of the same span: the second pass exists so
      // the two runs can be compared without an export.
      player.requestSeek(position);
      return;
    }
    stop();
    player.requestPlayback(false);
    player.requestSeek(Math.min(end, Math.max(0, player.duration - 1 / 30)));
  });
  const player = usePlayerStore.getState();
  player.requestSeek(position);
  player.requestPlayback(true);
  return stop;
}
