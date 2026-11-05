import { useEffect, useRef, useState } from "react";
import { ticTacToe } from "../../api/client";
import type { TttDifficulty, TttMatch } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { TimerBadge, useTurnTimer } from "../../platform/turnTimer";
import { useAuth } from "../../store/auth";
import { useSettings } from "../../store/settings";
import { useWallet } from "../../store/wallet";
import Board from "./Board";
import { opponentFace } from "./items";
import { type Cells, emptyCells } from "./logic";
import Scoreboard from "./Scoreboard";

export const DIFFICULTY_LABEL: Record<TttDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

const AI_DELAY_MS = 350;

interface Props {
  initial: TttMatch;
  onExit: () => void;
  onSpin: () => void;
  onRematch: (m: TttMatch) => void;
}

export default function AiGame({ initial, onExit, onSpin, onRematch }: Props) {
  const username = useAuth((s) => s.user?.username ?? "You");
  const timer = useSettings((s) => s.turnTimer);
  const [match, setMatch] = useState(initial);
  const [cells, setCells] = useState<Cells>(initial.cells);
  const [last, setLast] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const faces: [string, string] = [match.face, opponentFace(match.face, "robot")];
  const names: [string, string] = [username, `AI · ${DIFFICULTY_LABEL[match.difficulty]}`];
  const active = match.status === "active";
  const playable = active && !match.game_over && !busy;

  function announce(m: TttMatch) {
    if (!m.game_over) return;
    if (m.outcome.kind === "draw") playSfx("draw");
    else if (m.outcome.kind === "win") playSfx(m.outcome.winner === "p1" ? "win" : "lose");
    useWallet.getState().celebrate(m.rewards);
  }

  async function drop(cell: number) {
    if (!playable || cells[cell] !== 0) return;
    setBusy(true);
    setError(null);
    const optimistic = [...cells] as Cells;
    optimistic[cell] = 1;
    setCells(optimistic);
    setLast(cell);
    playSfx("drop");
    try {
      const [m] = await Promise.all([ticTacToe.move(match.id, cell), new Promise((r) => window.setTimeout(r, AI_DELAY_MS))]);
      if (!mounted.current) return;
      setMatch(m);
      setCells(m.cells);
      if (m.ai_move !== null) {
        setLast(m.ai_move);
        playSfx("land");
      }
      announce(m);
    } catch (e) {
      setCells(match.cells);
      setLast(null);
      setError(e instanceof Error ? e.message : "move failed");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function run(action: () => Promise<TttMatch>) {
    setBusy(true);
    setError(null);
    try {
      const m = await action();
      if (!mounted.current) return;
      playSfx("click");
      setMatch(m);
      setCells(m.cells);
      setLast(null);
      return m;
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const left = useTurnTimer(timer, `${match.id}:${match.moves.length}:${match.user_wins + match.ai_wins + match.draws}`, playable, () => {
    const free = emptyCells(cells);
    if (free.length) void drop(free[Math.floor(Math.random() * free.length)]);
  });

  let status: string;
  if (match.status === "won") status = `🏆 You beat the ${DIFFICULTY_LABEL[match.difficulty]} AI! +${match.points} pts`;
  else if (match.status === "drawn")
    status = match.difficulty === "hard" ? `🛡 You survived Hard! Series drawn. +${match.points} pts` : "Series drawn.";
  else if (match.status === "lost") status = "💀 The AI wins the series. Try again!";
  else if (match.status === "forfeited") status = "Series forfeited.";
  else if (match.game_over && match.outcome.kind === "draw") status = "Draw!";
  else if (match.game_over && match.outcome.kind === "win")
    status = match.outcome.winner === "p1" ? "You win this game!" : "The AI wins this game.";
  else if (busy) status = "AI is thinking…";
  else status = "Your turn";

  const hard = match.difficulty === "hard";
  const canUndo = playable && match.undos_left > 0 && match.moves.length >= 2;

  return (
    <div className="c4-play">
      <Scoreboard
        names={names}
        faces={faces}
        wins={[match.user_wins, match.ai_wins]}
        draws={match.draws}
        bestOf={match.best_of}
        turn={!active || match.game_over ? null : busy ? 2 : 1}
      />
      <div className="c4-bar">
        <div className="status-bar" role="status" aria-live="polite">
          {status}
        </div>
        <TimerBadge left={left} total={timer} />
      </div>
      <Board
        cells={cells}
        board={match.board}
        faces={faces}
        interactive={playable}
        line={match.game_over ? match.winning_line : null}
        lastMove={last}
        names={names}
        onPlay={(c) => void drop(c)}
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {(match.status === "won" || match.status === "drawn") && match.points > 0 && (
        <div className="result-card">
          <h3>{match.status === "won" ? "Series won" : "Survived the unbeatable AI"}</h3>
          <div className="score-big">+{match.points} pts</div>
          {match.spin_granted ? (
            <p className="unlock">🎡 You earned a reward spin for a board or face!</p>
          ) : (
            match.used_undo && <p className="hint">No spin this time: undo was used in this series.</p>
          )}
        </div>
      )}
      <div className="game-controls">
        {active && !match.game_over && (
          <>
            <button
              className="btn-blue"
              disabled={!canUndo}
              title={hard ? "No undo on Hard" : undefined}
              onClick={() => {
                if (match.used_undo || window.confirm("Using undo means this series won't give a reward spin. Undo anyway?"))
                  void run(() => ticTacToe.undo(match.id));
              }}
            >
              ↶ Undo ({hard ? "off" : match.undos_left})
            </button>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (window.confirm("Give up this series?") && (await run(() => ticTacToe.forfeit(match.id)))) onExit();
              }}
            >
              🏳 Forfeit
            </button>
          </>
        )}
        {active && match.game_over && (
          <button className="btn-green" disabled={busy} onClick={() => void run(() => ticTacToe.nextGame(match.id))}>
            ▶ Next game
          </button>
        )}
        {match.spin_granted && (
          <button className="btn" onClick={onSpin}>
            🎡 Spin the wheel
          </button>
        )}
        {!active && (
          <button
            className="btn-green"
            disabled={busy}
            onClick={async () => {
              const m = await run(() => ticTacToe.createMatch(match.difficulty, match.best_of, match.face, match.board));
              if (m) onRematch(m);
            }}
          >
            ↻ Play again
          </button>
        )}
        <button className="btn-ghost" onClick={onExit} disabled={busy && active}>
          ← Menu
        </button>
      </div>
      {active && (
        <p className="hint">
          Every move is checked by the server.{" "}
          {hard ? "Hard plays perfectly and can't be beaten: a drawn series still pays!" : "Undo: max 3 per game, and it cancels the reward spin."}
        </p>
      )}
    </div>
  );
}
