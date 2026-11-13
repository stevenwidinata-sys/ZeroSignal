import { useCallback, useEffect, useRef, useState } from "react";
import { game2048 } from "../../api/client";
import type { G2048Finish, G2048Run } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useSettings, vibrate } from "../../store/settings";
import Board from "./Board";
import type { Dir, Game } from "./engine";
import { MODE_INFO, loadPlayTime, savePlayTime } from "./modes";
import { freshTiles, keyToMove, tilesAfter, type Tile } from "./tiles";

/** Save the moves to the server after this many new ones. */
const SAVE_EVERY = 10;
const fmt = (n: number) => n.toLocaleString();

interface Props {
  run: G2048Run;
  game: Game;
  onDone: (result: G2048Finish, playMs: number) => void;
  onMenu: () => void;
}

/** One game in progress: board, score, undo, saving and finishing. */
export default function Round({ run, game, onDone, onMenu }: Props) {
  const light = useSettings((s) => s.lightGraphics);
  const [tiles, setTiles] = useState<Tile[]>(() => freshTiles(game.cells));
  const [, setVersion] = useState(0);
  const [over, setOver] = useState(() => !game.canMove());
  const [cheer, setCheer] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moves = useRef(run.moves);
  const saved = useRef(run.moves.length);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const busyRef = useRef(false);

  // Play time: counted only while the tab is visible.
  const timeBase = useRef(loadPlayTime(run.run_id));
  const timeStart = useRef<number | null>(document.hidden ? null : performance.now());
  const playMs = () => timeBase.current + (timeStart.current === null ? 0 : performance.now() - timeStart.current);

  const save = useCallback(() => {
    const m = moves.current;
    if (m.length <= saved.current) return chain.current;
    chain.current = chain.current
      .then(() => game2048.save(run.run_id, m))
      .then(() => {
        saved.current = Math.max(saved.current, m.length);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? `Couldn't save: ${e.message}` : "Couldn't save your game"));
    savePlayTime(run.run_id, playMs());
    return chain.current;
  }, [run.run_id]);

  // Save when the tab is hidden or closed, and when leaving this screen.
  useEffect(() => {
    const leave = () => {
      savePlayTime(run.run_id, playMs());
      if (moves.current.length > saved.current) game2048.saveOnLeave(run.run_id, moves.current);
    };
    const onVisibility = () => {
      if (document.hidden) {
        timeBase.current = playMs();
        timeStart.current = null;
        leave();
      } else {
        timeStart.current = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [run.run_id]);

  const act = useCallback(
    (c: Dir | "Z") => {
      if (busyRef.current) return;
      if (c === "Z") {
        if (!game.canUndo()) return;
        game.step("Z");
        moves.current += "Z";
        setTiles(freshTiles(game.cells));
        setOver(false);
        playSfx("whiff");
      } else {
        if (!game.canSlide(c)) return;
        const best = game.bestExp;
        const res = game.step(c);
        const cells = game.cells.slice();
        moves.current += c;
        setTiles((prev) => tilesAfter(prev, res, cells));
        playSfx(res.plan && res.plan.merged.length > 0 ? "merge" : "slide");
        if (best < 11 && game.bestExp >= 11) {
          playSfx("reward");
          vibrate(60);
          setCheer("🎉 2048! Keep going for 4096.");
        } else if (best < 12 && game.bestExp >= 12) {
          playSfx("reward");
          setCheer("👑 4096! You're a Tile Tycoon.");
        }
        if (!game.canMove()) {
          setOver(true);
          playSfx("lose");
          void save();
        }
      }
      if (moves.current.length - saved.current >= SAVE_EVERY) void save();
      setVersion((v) => v + 1);
    },
    [game, save],
  );

  useEffect(() => {
    if (!cheer) return;
    const t = window.setTimeout(() => setCheer(null), 3500);
    return () => window.clearTimeout(t);
  }, [cheer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const m = keyToMove(e.key);
      if (!m) return;
      e.preventDefault();
      act(m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  async function finish() {
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await chain.current;
      const result = await game2048.finish(run.run_id, moves.current);
      saved.current = moves.current.length;
      onDone(result, playMs());
    } catch (e) {
      setError(e instanceof Error ? e.message : "the server could not score this game");
      busyRef.current = false;
      setBusy(false);
    }
  }

  const undosLeft = game.undosLeft();
  const info = MODE_INFO[run.mode];
  const overlay = over ? (
    <div className="g2048-over" role="status">
      <strong>No moves left!</strong>
      <div className="game-controls">
        <button className="btn-green btn-sm" onClick={() => void finish()} disabled={busy} autoFocus>
          {busy ? "Scoring…" : "See results"}
        </button>
        {game.canUndo() && (
          <button className="btn-ghost btn-sm" onClick={() => act("Z")} disabled={busy}>
            ↶ Undo ({undosLeft})
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="g2048-round">
      <div className="g2048-hud">
        <div className="g2048-stat">
          <small>Score</small>
          <strong>{fmt(game.points())}</strong>
        </div>
        <div className="g2048-stat">
          <small>Best tile</small>
          <strong>{fmt(game.maxTile())}</strong>
        </div>
        <div className="g2048-stat">
          <small>Moves</small>
          <strong>{fmt(game.moves)}</strong>
        </div>
      </div>

      <div className="g2048-cheer" role="status" aria-live="polite">
        {cheer}
      </div>

      <Board size={game.size} tiles={tiles} onMove={act} overlay={overlay} light={light} />

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="game-controls g2048-controls">
        {run.undos > 0 && (
          <button className="btn-blue btn-sm" onClick={() => act("Z")} disabled={busy || !game.canUndo()} title="Undo (Z)">
            ↶ Undo · {undosLeft} left
          </button>
        )}
        {!over &&
          (confirmEnd ? (
            <span className="g2048-confirm">
              End and score this game?
              <button className="btn-green btn-sm" onClick={() => void finish()} disabled={busy}>
                {busy ? "Scoring…" : "Yes, end it"}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setConfirmEnd(false)} disabled={busy}>
                Keep playing
              </button>
            </span>
          ) : (
            <button className="btn-ghost btn-sm" onClick={() => setConfirmEnd(true)} disabled={busy}>
              ⏹ End game
            </button>
          ))}
        <button
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={() => {
            void save();
            onMenu();
          }}
        >
          ← Menu (game is saved)
        </button>
      </div>
      <p className="wam-hint g2048-help">
        Arrow keys or WASD to slide, Z to undo. On a phone, swipe on the board. {info.icon} {info.name}
        {run.mode === "daily" ? ": no undo in the Daily." : `: up to ${run.undos} undos.`}
      </p>
    </div>
  );
}
