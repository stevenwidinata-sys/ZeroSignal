import { useCallback, useEffect, useRef, useState } from "react";
import type { WamTap } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { SURVIVAL_LIVES, comboTenths, type Game, type Kind } from "./engine";
import { holeForKey, keyLabel } from "./keys";
import Mole, { KIND_LABEL } from "./Mole";

interface Pop {
  id: number;
  hole: number;
  text: string;
  tone: "good" | "bad" | "gold" | "ice";
}

interface Props {
  game: Game;
  showKeys: boolean;
  /** Round over: hand back every tap that was fed to the engine. */
  onDone: (taps: WamTap[]) => void;
  onQuit: () => void;
}

const COUNTDOWN = ["3", "2", "1", "GO!"];

/** One live round: countdown, game clock, taps, HUD. */
export default function Round({ game, showKeys, onDone, onQuit }: Props) {
  const grid = game.grid as 3 | 4;
  const [count, setCount] = useState(0); // index into COUNTDOWN; >= length = playing
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const [shake, setShake] = useState(0);
  const [whacked, setWhacked] = useState<Record<number, Kind>>({});
  const t0 = useRef<number | null>(null);
  const pausedAt = useRef<number | null>(null);
  const taps = useRef<WamTap[]>([]);
  const lastT = useRef(0);
  const done = useRef(false);
  const popId = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const playing = count >= COUNTDOWN.length && !paused;

  const now = useCallback(() => {
    if (t0.current === null) return 0;
    const at = pausedAt.current ?? performance.now();
    return Math.max(0, Math.round(at - t0.current));
  }, []);

  // Bring the whole board on screen for the countdown.
  useEffect(() => {
    boardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  // Countdown, then start the clock.
  useEffect(() => {
    if (count >= COUNTDOWN.length) return;
    playSfx(count === COUNTDOWN.length - 1 ? "win" : "tick");
    const id = window.setTimeout(() => {
      if (count === COUNTDOWN.length - 1) t0.current = performance.now();
      setCount((c) => c + 1);
    }, count === COUNTDOWN.length - 1 ? 450 : 700);
    return () => window.clearTimeout(id);
  }, [count]);

  // Game loop: let moles escape, redraw, notice the end.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const lives = game.lives;
      game.advance(now());
      if (game.mode === "survival" && game.lives < lives) playSfx("lose");
      setFrame((f) => (f + 1) % 1_000_000);
      if (game.over) {
        if (!done.current) {
          done.current = true;
          onDoneRef.current(taps.current);
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, game, now]);

  // Pause when the tab is hidden (pausing only makes the round take longer,
  // which the server allows).
  const pause = useCallback(() => {
    if (t0.current === null || pausedAt.current !== null || done.current) return;
    pausedAt.current = performance.now();
    setPaused(true);
  }, []);
  const resume = useCallback(() => {
    if (pausedAt.current === null || t0.current === null) return;
    t0.current += performance.now() - pausedAt.current;
    pausedAt.current = null;
    setPaused(false);
  }, []);
  useEffect(() => {
    const onVis = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  const addPop = useCallback((hole: number, text: string, tone: Pop["tone"]) => {
    const id = ++popId.current;
    setPops((p) => [...p.slice(-8), { id, hole, text, tone }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 650);
  }, []);

  const whack = useCallback(
    (hole: number) => {
      if (!playing || game.over) return;
      const t = Math.max(now(), lastT.current);
      lastT.current = t;
      const prevStreak = game.streak;
      const before = game.moleAt(hole, t);
      const out = game.tap({ t, hole });
      if (out.type === "ignored") return;
      taps.current.push({ t, hole });
      switch (out.type) {
        case "empty":
          playSfx("whiff");
          if (prevStreak >= 5) addPop(hole, "combo lost", "bad");
          break;
        case "cracked":
          playSfx("clank");
          addPop(hole, "CLANK!", "good");
          break;
        case "bomb":
          playSfx("boom");
          addPop(hole, game.mode === "survival" ? "-1 ♥" : "-300", "bad");
          setShake((s) => s + 1);
          break;
        case "hit":
          playSfx(out.kind === "golden" ? "golden" : "bonk");
          if (game.streak === 10) playSfx("fever");
          addPop(
            hole,
            out.kind === "ice" ? (game.mode === "survival" ? "+1 ♥" : "+3s") : `+${out.points}`,
            out.kind === "golden" ? "gold" : out.kind === "ice" ? "ice" : "good",
          );
          if (before !== null) {
            const idx = before;
            setWhacked((w) => ({ ...w, [idx]: out.kind }));
            window.setTimeout(
              () =>
                setWhacked((w) => {
                  const { [idx]: _gone, ...rest } = w;
                  return rest;
                }),
              220,
            );
          }
          break;
      }
    },
    [playing, game, now, addPop],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape" || e.code === "KeyP") {
        if (paused) resume();
        else pause();
        return;
      }
      const hole = holeForKey(e.code, grid);
      if (hole === null) return;
      e.preventDefault();
      whack(hole);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grid, whack, pause, resume, paused]);

  const t = now();
  const visible = playing || paused ? game.visible(t) : [];
  const byHole = new Map(visible.map((i) => [game.spawns[i].hole, i]));
  const fever = game.streak >= 10;
  const mult = comboTenths(game.streak) / 10;
  const timeLeft = Math.max(0, game.endMs - t);

  return (
    <div className={`wam-round${fever ? " fever" : ""}`}>
      <div className="wam-hud panel" aria-live="off">
        <div className="wam-stat">
          <small>Score</small>
          <strong>{Math.max(0, game.s.score).toLocaleString()}</strong>
        </div>
        {game.mode === "survival" ? (
          <div className="wam-stat">
            <small>Lives · {(t / 1000).toFixed(1)}s</small>
            <strong className="wam-lives" aria-label={`${game.lives} lives left`}>
              {Array.from({ length: SURVIVAL_LIVES }, (_, i) => (
                <span key={i} className={i < game.lives ? "full" : "empty"}>
                  {i < game.lives ? "♥" : "♡"}
                </span>
              ))}
            </strong>
          </div>
        ) : (
          <div className={`wam-stat${timeLeft < 5_000 && playing ? " urgent" : ""}`}>
            <small>Time</small>
            <strong>{(timeLeft / 1000).toFixed(1)}</strong>
          </div>
        )}
        <div className={`wam-stat wam-combo${mult > 1 ? " hot" : ""}`}>
          <small>Combo {game.streak}</small>
          <strong>{fever ? "FEVER ×3" : `×${mult}`}</strong>
        </div>
        <div className="wam-hud-btns">
          <button className="btn-ghost btn-sm" onClick={paused ? resume : pause} disabled={!(count >= COUNTDOWN.length)}>
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button className="btn-ghost btn-sm" onClick={onQuit}>
            ✕ Quit
          </button>
        </div>
      </div>

      <div
        key={shake}
        ref={boardRef}
        className={`wam-board grid-${grid}${shake ? " shake" : ""}`}
        role="group"
        aria-label="Mole holes"
      >
        {Array.from({ length: grid * grid }, (_, hole) => {
          const i = byHole.get(hole);
          const sp = i !== undefined ? game.spawns[i] : null;
          const hit = Object.entries(whacked).find(([idx]) => game.spawns[Number(idx)].hole === hole);
          const label = sp ? `${KIND_LABEL[sp.kind]} in hole ${hole + 1}` : `Hole ${hole + 1}, empty`;
          return (
            <button
              key={hole}
              type="button"
              className="wam-hole"
              aria-label={label}
              onPointerDown={(e) => {
                e.preventDefault();
                whack(hole);
              }}
            >
              <span className="wam-dirt" aria-hidden="true" />
              {/* Clips the mole at the hole's opening so it pops out of the ground. */}
              <span className="wam-slot" aria-hidden="true">
                {sp && i !== undefined && (
                  <span key={i} className="wam-mole up">
                    <Mole kind={sp.kind} cracked={sp.kind === "helmet" && game.hitsLeft(i) === 1} />
                  </span>
                )}
                {!sp && hit && (
                  <span className="wam-mole bonked">
                    <Mole kind={hit[1]} />
                  </span>
                )}
              </span>
              {showKeys && (
                <kbd className="wam-key" aria-hidden="true">
                  {keyLabel(hole, grid)}
                </kbd>
              )}
              {pops
                .filter((p) => p.hole === hole)
                .map((p) => (
                  <span key={p.id} className={`wam-pop ${p.tone}`} aria-hidden="true">
                    {p.text}
                  </span>
                ))}
            </button>
          );
        })}

        {count < COUNTDOWN.length && (
          <div className="wam-overlay" aria-live="assertive">
            <span key={count} className="wam-count">
              {COUNTDOWN[count]}
            </span>
          </div>
        )}
        {paused && (
          <div className="wam-overlay">
            <div className="wam-paused">
              <strong>Paused</strong>
              <button className="btn-green" onClick={resume}>
                ▶ Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
