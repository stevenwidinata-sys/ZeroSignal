import { useEffect, useRef, useState } from "react";
import { playSfx } from "../../platform/sound";

/**
 * Countdown for the current turn. Restarts whenever `turnKey` changes and
 * calls `onExpire` once when it hits zero. `seconds = 0` disables it.
 * Returns the seconds left (null when disabled or paused).
 */
export function useTurnTimer(
  seconds: number,
  turnKey: string,
  running: boolean,
  onExpire: () => void,
): number | null {
  const [left, setLeft] = useState(seconds);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    setLeft(seconds);
    if (!seconds || !running) return;
    const deadline = Date.now() + seconds * 1000;
    let fired = false;
    const id = window.setInterval(() => {
      const ms = deadline - Date.now();
      const s = Math.max(0, Math.ceil(ms / 1000));
      setLeft((prev) => {
        if (s !== prev && s > 0 && s <= 3) playSfx("tick");
        return s;
      });
      if (ms <= 0 && !fired) {
        fired = true;
        window.clearInterval(id);
        expire.current();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [seconds, turnKey, running]);

  return seconds && running ? left : null;
}

export function TimerBadge({ left, total }: { left: number | null; total: number }) {
  if (left === null) return null;
  const pct = total ? (left / total) * 100 : 0;
  return (
    <div
      className={`c4-timer${left <= 3 ? " urgent" : ""}`}
      role="timer"
      aria-label={`${left} seconds left this turn`}
    >
      <span className="c4-timer-bar" style={{ width: `${pct}%` }} />
      <span className="c4-timer-text">⏱ {left}s</span>
    </div>
  );
}
