import { useCallback, useEffect, useRef, useState } from "react";
import type { WamTap } from "../../api/types";
import Avatar from "../../character/Avatar";
import { useGuardWhile } from "../../platform/leaveGuard";
import { playSfx } from "../../platform/sound";
import { useCharacter } from "../../store/character";
import { useSettings, vibrate } from "../../store/settings";
import { BOSS_HP, SURVIVAL_LIVES, comboTenths, type Game, type Kind } from "./engine";
import { findHammer, findTheme, hammerCursor, hammerSfx, themeStyle } from "./items";
import { holeForKey, isPauseKey, keyLabel } from "./keys";
import Mole, { KIND_LABEL } from "./Mole";

interface Pop {
  id: number;
  hole: number;
  text: string;
  tone: "good" | "bad" | "gold" | "ice" | "power" | "boss" | "spark";
}

/** How your character feels right now. */
type Mood = "idle" | "happy" | "ouch" | "fever" | "wow";
const MOOD_BUBBLE: Record<Mood, string> = { idle: "", happy: "😄", ouch: "😵", fever: "🔥", wow: "🤩" };

interface Props {
  game: Game;
  showKeys: boolean;
  hammer: string;
  theme: string;
  /** Round over: hand back every tap that was fed to the engine. */
  onDone: (taps: WamTap[]) => void;
  onQuit: () => void;
}

const COUNTDOWN = ["3", "2", "1", "GO!"];

/** One live round: countdown, game clock, taps, HUD. */
export default function Round({ game, showKeys, hammer, theme, onDone, onQuit }: Props) {
  const keyOverrides = useSettings((s) => s.keys);
  const grid = game.grid as 3 | 4;
  const hammerArt = findHammer(hammer).art;
  const themeArt = findTheme(theme).art;
  const [count, setCount] = useState(0); // index into COUNTDOWN; >= length = playing
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const [shake, setShake] = useState(0);
  const [whacked, setWhacked] = useState<Record<number, Kind>>({});
  const [mood, setMood] = useState<Mood>("idle");
  // Game clock: real time, at half speed while Slow-mo is on, frozen while paused.
  const clock = useRef<{ game: number; real: number | null }>({ game: 0, real: null });
  const pausedRef = useRef(false);
  const taps = useRef<WamTap[]>([]);
  const lastT = useRef(0);
  const done = useRef(false);
  const popId = useRef(0);
  const moodTimer = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const playing = count >= COUNTDOWN.length && !paused;
  const shakeOn = useSettings((s) => s.screenShake);
  const loadout = useCharacter((s) => s.view?.loadout);
  const loadCharacter = useCharacter((s) => s.load);
  useGuardWhile("whack-a-mole", count >= COUNTDOWN.length && !game.over);

  useEffect(() => {
    if (!loadout) void loadCharacter();
  }, [loadout, loadCharacter]);

  const now = useCallback(() => {
    const c = clock.current;
    if (c.real === null || pausedRef.current) return Math.round(c.game);
    const r = performance.now();
    const rate = c.game < game.slowUntil ? 0.5 : 1;
    c.game += (r - c.real) * rate;
    c.real = r;
    return Math.round(c.game);
  }, [game]);

  const react = useCallback((m: Mood, ms = 700) => {
    window.clearTimeout(moodTimer.current);
    setMood(m);
    moodTimer.current = window.setTimeout(() => setMood("idle"), ms);
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
      if (count === COUNTDOWN.length - 1) clock.current.real = performance.now();
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
      if (game.mode === "survival" && game.lives < lives) {
        playSfx("lose");
        react("ouch");
      }
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
  }, [playing, game, now, react]);

  // Pause when the tab is hidden (pausing only makes the round take longer,
  // which the server allows).
  const pause = useCallback(() => {
    if (clock.current.real === null || pausedRef.current || done.current) return;
    now();
    pausedRef.current = true;
    setPaused(true);
  }, [now]);
  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    clock.current.real = performance.now();
    pausedRef.current = false;
    setPaused(false);
  }, []);
  useEffect(() => {
    const onVis = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  const addPop = useCallback((hole: number, text: string, tone: Pop["tone"], ms = 650) => {
    const id = ++popId.current;
    setPops((p) => [...p.slice(-10), { id, hole, text, tone }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), ms);
  }, []);

  const flashWhacked = useCallback((idx: number, kind: Kind) => {
    setWhacked((w) => ({ ...w, [idx]: kind }));
    window.setTimeout(
      () =>
        setWhacked((w) => {
          const { [idx]: _gone, ...rest } = w;
          return rest;
        }),
      220,
    );
  }, []);

  const whack = useCallback(
    (hole: number) => {
      if (!playing || game.over) return;
      const t = Math.max(now(), lastT.current);
      lastT.current = t;
      const prevStreak = game.streak;
      const prevShields = game.shields;
      const before = game.moleAt(hole, t);
      const out = game.tap({ t, hole });
      if (out.type === "ignored") return;
      taps.current.push({ t, hole });
      switch (out.type) {
        case "empty":
          playSfx("whiff");
          if (game.shields < prevShields) addPop(hole, "🛡️ saved", "power");
          else if (prevStreak >= 5) addPop(hole, "combo lost", "bad");
          break;
        case "cracked":
          playSfx("clank");
          addPop(hole, "CLANK!", "good");
          break;
        case "bomb":
          playSfx("boom");
          vibrate([40, 30, 60]);
          react("ouch", 900);
          addPop(hole, game.mode === "survival" ? "-1 ♥" : "-300", "bad");
          if (game.shields < prevShields) addPop(hole, "🛡️ combo kept", "power", 900);
          if (shakeOn) setShake((s) => s + 1);
          break;
        case "boss_hit":
          playSfx(hammerSfx(hammerArt));
          vibrate(10);
          addPop(hole, "✸", "spark", 250);
          addPop(hole, `+${out.points}`, "good");
          break;
        case "hit": {
          const k = out.kind;
          if (k === "boss") {
            playSfx("fever");
            vibrate([30, 20, 30, 20, 60]);
            react("wow", 1200);
            addPop(hole, `BOSS KO! +${out.points}`, "boss", 1100);
            if (shakeOn) setShake((s) => s + 1);
          } else {
            playSfx(k === "golden" ? "golden" : hammerSfx(hammerArt));
            vibrate(k === "golden" ? 30 : 12);
            addPop(hole, "✸", "spark", 250);
            const label: Partial<Record<Kind, string>> = {
              ice: game.mode === "survival" ? "+1 ♥" : "+3s",
              double: "×2 POINTS!",
              shield: "🛡️ SHIELD",
              slow_mo: "⏳ SLOW-MO",
            };
            const tone: Pop["tone"] = k === "golden" ? "gold" : k === "ice" ? "ice" : label[k] ? "power" : "good";
            addPop(hole, label[k] ?? `+${out.points}`, tone, label[k] ? 900 : 650);
            if (k === "golden" || label[k]) react("happy");
          }
          if (game.streak === 10) {
            playSfx("fever");
            react("fever", 1500);
          }
          if (before !== null) flashWhacked(before, k);
          break;
        }
      }
    },
    [playing, game, now, addPop, shakeOn, hammerArt, react, flashWhacked],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const keys = useSettings.getState().keys;
      if (isPauseKey(e.code, keys)) {
        e.preventDefault();
        if (paused) resume();
        else pause();
        return;
      }
      const hole = holeForKey(e.code, grid, keys);
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
  const doubleLeft = Math.max(0, game.doubleUntil - t);
  const slow = t < game.slowUntil;
  const shownMood: Mood = mood === "idle" && fever ? "fever" : mood;

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
        <div className="wam-powers" aria-label="Active power-ups">
          {doubleLeft > 0 && <span className="wam-power">×2 {(doubleLeft / 1000).toFixed(1)}s</span>}
          {slow && <span className="wam-power">⏳ Slow-mo</span>}
          {game.shields > 0 && <span className="wam-power">🛡️×{game.shields}</span>}
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

      <div className="wam-stage">
        {loadout && (
          <div className={`wam-buddy mood-${shownMood}`} aria-hidden="true">
            {MOOD_BUBBLE[shownMood] && <span className="wam-bubble">{MOOD_BUBBLE[shownMood]}</span>}
            <Avatar loadout={loadout} size={110} />
          </div>
        )}

        <div
          key={shake}
          ref={boardRef}
          className={`wam-board grid-${grid}${shake ? " shake" : ""}${slow ? " slow" : ""}`}
          style={{ ...themeStyle(themeArt), cursor: hammerCursor(hammerArt), ["--wam-fx" as string]: hammerArt.fx }}
          role="group"
          aria-label="Mole holes"
        >
          <span className="wam-deco d1" aria-hidden="true">
            {themeArt.deco}
          </span>
          <span className="wam-deco d2" aria-hidden="true">
            {themeArt.deco}
          </span>
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
                    <span key={i} className={`wam-mole up${sp.kind === "boss" ? " boss" : ""}`}>
                      <Mole kind={sp.kind} cracked={sp.kind === "helmet" && game.hitsLeft(i) === 1} />
                    </span>
                  )}
                  {!sp && hit && (
                    <span className={`wam-mole bonked${hit[1] === "boss" ? " boss" : ""}`}>
                      <Mole kind={hit[1]} />
                    </span>
                  )}
                </span>
                {sp?.kind === "boss" && i !== undefined && (
                  <span
                    className="wam-hp"
                    role="progressbar"
                    aria-label="Boss health"
                    aria-valuemin={0}
                    aria-valuemax={BOSS_HP}
                    aria-valuenow={game.hitsLeft(i)}
                  >
                    <span style={{ width: `${(game.hitsLeft(i) / BOSS_HP) * 100}%` }} />
                  </span>
                )}
                {showKeys && (
                  <kbd className="wam-key" aria-hidden="true">
                    {keyLabel(hole, grid, keyOverrides)}
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
    </div>
  );
}
