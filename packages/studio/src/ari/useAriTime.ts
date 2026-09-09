import { useEffect, useState } from "react";
import { liveTime, usePlayerStore } from "../player/store/playerStore";
/** Subscribe to the player's real playback clock; currentTime stores paused seeks. */
export function useAriTime() {
  const paused = usePlayerStore((s) => s.currentTime);
  const [time, setTime] = useState(paused);
  useEffect(() => setTime(paused), [paused]);
  useEffect(() => {
    const unsubscribe = liveTime.subscribe(setTime);
    return () => {
      unsubscribe();
    };
  }, []);
  return time;
}
