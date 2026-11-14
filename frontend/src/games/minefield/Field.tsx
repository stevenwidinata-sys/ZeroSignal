import { useCallback, useEffect, useRef, useState } from "react";
import { minefield } from "../../api/client";
import type { MfGame } from "../../api/types";
import { useGuardWhile } from "../../platform/leaveGuard";
import { currentAction } from "../../platform/keymap";
import { playSfx } from "../../platform/sound";
import { vibrate } from "../../store/settings";
import { SaveScorePrompt } from "../../components/Guest";
import { useWallet } from "../../store/wallet";
import {
  EXPLODED,
  HIDDEN,
  MINE,
  bvPerSecond,
  canChord,
  efficiency,
  flagsAround,
  formatTime,
  minesLeft,
  moveCursor,
  nextMark,
  pruneMarks,
  type Mark,
} from "./logic";

const LONG_PRESS_MS = 420;
/** Keymap move actions → the cursor directions `moveCursor` understands. */
const ARROW: Record<string, string> = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
export const DIFF_NAME: Record<MfGame["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  expert: "Expert",
  daily: "Daily",
};

interface Props {
  initial: MfGame;
  onNew: () => void;
  onMenu: () => void;
}

/** One Minefield game. Every open goes to the server; flags stay here. */
export default function Field({ initial, onNew, onMenu }: Props) {
  const [game, setGame] = useState(initial);
  const [marks, setMarks] = useState<Map<number, Mark>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagMode, setFlagMode] = useState(false);
  const [cursor, setCursor] = useState(() => Math.floor((initial.rows * initial.cols) / 2));
  const [pressing, setPressing] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const syncedAt = useRef({ elapsed: initial.elapsed_ms, at: performance.now() });
  const longPress = useRef<{ timer: number; fired: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const { rows, cols, cells, status } = game;
  const over = status === "won" || status === "lost";
  // The board waits on the server, but the clock keeps running while you're away.
  useGuardWhile("minefield", status === "playing");

  // Clock: the server's elapsed time, ticking locally between moves.
  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [status]);
  const shownMs =
    game.result?.time_ms ??
    (status === "playing" ? syncedAt.current.elapsed + (now - syncedAt.current.at) : game.elapsed_ms);

  const apply = useCallback((g: MfGame) => {
    syncedAt.current = { elapsed: g.elapsed_ms, at: performance.now() };
    setNow(performance.now());
    setGame(g);
    setMarks((m) => pruneMarks(m, g.cells));
    if (g.status === "won") {
      playSfx("win");
      useWallet.getState().celebrate(g.result?.rewards);
    } else if (g.status === "lost") {
      playSfx("boom");
      vibrate([60, 40, 90]);
      useWallet.getState().celebrate(g.result?.rewards);
    }
  }, []);

  const send = useCallback(
    async (call: () => Promise<MfGame | null>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const g = await call();
        if (g) apply(g);
        else onMenu();
      } catch (e) {
        setError(e instanceof Error ? e.message : "move failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, apply, onMenu],
  );

  const toggleMark = useCallback(
    (i: number) => {
      if (over || cells[i] !== HIDDEN) return;
      playSfx("tick");
      setMarks((m) => {
        const next = new Map(m);
        const mark = nextMark(m.get(i));
        if (mark) next.set(i, mark);
        else next.delete(i);
        return next;
      });
    },
    [over, cells],
  );

  /** Main action on a cell: open it, or chord a satisfied number. */
  const open = useCallback(
    (i: number) => {
      if (over || busy) return;
      const v = cells[i];
      if (v === HIDDEN) {
        if (marks.get(i) === "flag") return; // flags protect cells
        playSfx("click");
        void send(() => minefield.reveal(game.id, i));
      } else if (canChord(i, cells, rows, cols, marks)) {
        playSfx("click");
        void send(() => minefield.chord(game.id, i, flagsAround(i, rows, cols, marks)));
      }
    },
    [over, busy, cells, marks, rows, cols, game.id, send],
  );

  const primary = (i: number) => (flagMode && cells[i] === HIDDEN ? toggleMark(i) : open(i));

  // Keyboard (Settings → Controls): arrows move, Space/Enter open or chord, F flag, D chord.
  function onKeyDown(e: React.KeyboardEvent) {
    const action = currentAction("minefield", e.code);
    const arrow = action && ARROW[action];
    if (arrow) {
      e.preventDefault();
      const next = moveCursor(cursor, arrow, rows, cols);
      setCursor(next);
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus();
    } else if (action === "open") {
      e.preventDefault();
      open(cursor);
    } else if (action === "flag") {
      e.preventDefault();
      toggleMark(cursor);
    } else if (action === "chord") {
      e.preventDefault();
      if (cells[cursor] !== HIDDEN) open(cursor);
    }
  }

  const face = status === "won" ? "😎" : status === "lost" ? "😵" : pressing || busy ? "😮" : "🙂";
  const res = game.result;

  function label(i: number): string {
    const v = cells[i];
    const r = Math.floor(i / cols) + 1;
    const c = (i % cols) + 1;
    const where = `row ${r}, column ${c}`;
    if (v === HIDDEN) {
      const m = marks.get(i);
      return `${where}: hidden${m === "flag" ? ", flagged" : m === "question" ? ", question mark" : ""}`;
    }
    if (v === MINE) return `${where}: mine`;
    if (v === EXPLODED) return `${where}: the mine you hit`;
    return `${where}: ${v === 0 ? "empty" : v}`;
  }

  return (
    <div className="mf-wrap">
      <div className="mf-bar panel">
        <div className="mf-counter" title="Mines left (by your flags)">
          <span aria-hidden="true">💣</span> <strong>{minesLeft(game.mines, marks)}</strong>
        </div>
        <button className="mf-face" onClick={onNew} title="New game" aria-label="New game">
          {face}
        </button>
        <div className="mf-counter" title="Time (hints add 20 s)">
          <span aria-hidden="true">⏱️</span> <strong>{formatTime(shownMs)}</strong>
        </div>
      </div>

      <div className="mf-tools">
        <button
          className={`btn-sm${flagMode ? "" : " btn-ghost"}`}
          aria-pressed={flagMode}
          onClick={() => setFlagMode((f) => !f)}
          disabled={over}
          title="When on, a tap places a flag instead of opening"
        >
          🚩 Flag mode {flagMode ? "on" : "off"}
        </button>
        <button
          className="btn-sm btn-ghost"
          onClick={() => void send(() => minefield.hint(game.id))}
          disabled={over || status !== "playing" || game.hints_left <= 0 || busy}
          title="Opens a safe cell. Adds 20 s."
        >
          💡 Hint ({game.hints_left})
        </button>
        {!over && (
          <button className="btn-sm btn-ghost" onClick={() => void send(() => minefield.forfeit(game.id))} disabled={busy}>
            🏳️ Give up
          </button>
        )}
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="mf-scroll">
        <div
          ref={gridRef}
          className={`mf-grid${over ? " over" : ""}${busy ? " busy" : ""}`}
          style={{ gridTemplateColumns: `repeat(${cols}, var(--mf-cell))`, ["--mf-cols" as string]: cols }}
          role="grid"
          aria-label={`Minefield, ${rows} by ${cols}`}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          {cells.map((v, i) => {
            const mark = marks.get(i);
            const hidden = v === HIDDEN;
            const wrongFlag = status === "lost" && hidden && mark === "flag";
            const winFlag = status === "won" && hidden;
            let cls = "mf-cell";
            let content: string = "";
            if (hidden) {
              cls += " hidden";
              if (winFlag || mark === "flag") content = "🚩";
              else if (mark === "question") content = "?";
              if (wrongFlag) {
                cls += " wrong";
                content = "❌";
              }
            } else if (v === MINE || v === EXPLODED) {
              // After a win every mine shows as a flag; after a loss, unflagged mines show as bombs.
              const asFlag = v === MINE && (mark === "flag" || status === "won");
              cls += v === EXPLODED ? " mine exploded" : asFlag ? " mine flagged" : " mine";
              content = asFlag ? "🚩" : "💣";
            } else {
              cls += ` open n${v}`;
              content = v === 0 ? "" : String(v);
            }
            return (
              <button
                key={i}
                type="button"
                data-cell={i}
                className={cls}
                tabIndex={i === cursor ? 0 : -1}
                aria-label={label(i)}
                onFocus={() => setCursor(i)}
                onMouseDown={(e) => e.button === 0 && hidden && setPressing(true)}
                onMouseUp={() => setPressing(false)}
                onMouseLeave={() => setPressing(false)}
                onClick={() => {
                  if (longPress.current?.fired) return;
                  primary(i);
                }}
                onAuxClick={(e) => e.button === 1 && open(i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (hidden) toggleMark(i);
                  else open(i);
                }}
                onTouchStart={() => {
                  const timer = window.setTimeout(() => {
                    if (longPress.current) longPress.current.fired = true;
                    if (hidden) toggleMark(i);
                    vibrate(20);
                  }, LONG_PRESS_MS);
                  longPress.current = { timer, fired: false };
                }}
                onTouchEnd={() => {
                  if (longPress.current) window.clearTimeout(longPress.current.timer);
                  // Keep `fired` for the click that follows, then reset.
                  window.setTimeout(() => (longPress.current = null), 0);
                }}
                onTouchMove={() => longPress.current && window.clearTimeout(longPress.current.timer)}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mf-help">
        Click opens · right-click or long-press flags · click a number with its flags placed to open around it · keys: arrows, Space, F
      </p>

      {over && res && (
        <div className="panel mf-result" role="status">
          <h2>{res.won ? "Cleared! 🎉" : "Boom! 💥"}</h2>
          {res.won && (
            <p className="mf-score">
              <strong>{(res.score ?? 0).toLocaleString()}</strong> points
              {res.new_best && <span className="tag tag-yellow">★ New best!</span>}
              {!res.new_best && (res.previous_best ?? 0) > 0 && (
                <span className="tag">Best: {(res.previous_best ?? 0).toLocaleString()}</span>
              )}
            </p>
          )}
          <dl className="wam-stats">
            {res.won && (
              <div>
                <dt>Time</dt>
                <dd>{formatTime(res.time_ms ?? 0)}</dd>
              </div>
            )}
            <div>
              <dt>3BV (min. clicks)</dt>
              <dd>{res.three_bv ?? "–"}</dd>
            </div>
            {res.won && (
              <div>
                <dt>3BV / second</dt>
                <dd>{bvPerSecond(res.three_bv ?? 0, res.time_ms ?? 0)}</dd>
              </div>
            )}
            <div>
              <dt>Efficiency</dt>
              <dd>{efficiency(res.three_bv ?? 0, res.clicks)}%</dd>
            </div>
            <div>
              <dt>Hints</dt>
              <dd>{game.hints_used}</dd>
            </div>
          </dl>
          {!res.won && <p className="wam-hint">Mines are shown now. ❌ marks a flag that was wrong.</p>}
          {res.won && <SaveScorePrompt />}
          <div className="game-controls">
            {game.difficulty !== "daily" && (
              <button className="btn-green" onClick={onNew} autoFocus>
                ↻ New {DIFF_NAME[game.difficulty]} board
              </button>
            )}
            <button className="btn-ghost" onClick={onMenu}>
              Change size
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
