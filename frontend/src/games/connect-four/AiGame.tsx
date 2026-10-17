import { useEffect, useRef, useState } from "react";
import { connectFour } from "../../api/client";
import type { CfMatch, Difficulty } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useAuth } from "../../store/auth";
import { useSettings } from "../../store/settings";
import Board from "./Board";
import { type Cells, canPlay, landingRow } from "./logic";
import Scoreboard from "./Scoreboard";
import { opponentSkin } from "./skins";
import { TimerBadge, useTurnTimer } from "./timer";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  impossible: "Impossible",
};

/** Pause so the player's chip lands before the AI's reply drops. */
const AI_DELAY_MS = 380;

interface Props {
  initial: CfMatch;
  onExit: () => void;
  /** Called when the server grants a reward spin for this series. */
  onSpin: () => void;
  /** Start a fresh series with the same settings. */
  onRematch: (m: CfMatch) => void;
}

export default function AiGame({ initial, onExit, onSpin, onRematch }: Props) {
  const username = useAuth((s) => s.user?.username ?? "You");
  const timerSeconds = useSettings((s) => s.turnTimer);
  const [match, setMatch] = useState<CfMatch>(initial);
  const [cells, setCells] = useState<Cells>(initial.cells);
  const [lastMove, setLastMove] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const skins: [string, string] = [match.skin, opponentSkin(match.skin, "pig")];
  const names: [string, string] = [username, `AI · ${DIFFICULTY_LABEL[match.difficulty]}`];
  const active = match.status === "active";
  const playable = active && !match.game_over && !busy;
  const moveCount = match.moves.length;

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "something went wrong");
    setBusy(false);
  }

  function announce(m: CfMatch) {
    if (!m.game_over) return;
    if (m.outcome.kind === "draw") playSfx("draw");
    else if (m.outcome.kind === "win") playSfx(m.outcome.winner === "p1" ? "win" : "lose");
    if (m.spin_granted) window.setTimeout(() => playSfx("reward"), 700);
  }

  async function drop(col: number) {
    if (!playable || !canPlay(cells, col)) return;
    setBusy(true);
    setError(null);
    // Show our chip immediately; the server is still the source of truth.
    const row = landingRow(cells, col);
    const optimistic = cells.map((c) => [...c]) as Cells;
    optimistic[col][row] = 1;
    setCells(optimistic);
    setLastMove([col, row]);
    playSfx("drop");

    try {
      const [m] = await Promise.all([
        connectFour.move(match.id, col),
        new Promise((r) => window.setTimeout(r, AI_DELAY_MS)),
      ]);
      if (!mounted.current) return;
      setMatch(m);
      setCells(m.cells);
      if (m.ai_move !== null) {
        setLastMove([m.ai_move, landingRow(optimistic, m.ai_move)]);
        playSfx("land");
      }
      announce(m);
      setBusy(false);
    } catch (e) {
      setCells(match.cells); // roll back the optimistic chip
      setLastMove(null);
      fail(e);
    }
  }

  async function run(action: () => Promise<CfMatch>, sfx: "click" | null = "click") {
    setBusy(true);
    setError(null);
    try {
      const m = await action();
      if (!mounted.current) return;
      if (sfx) playSfx(sfx);
      setMatch(m);
      setCells(m.cells);
      setLastMove(null);
      setBusy(false);
      return m;
    } catch (e) {
      fail(e);
    }
  }

  async function undo() {
    if (!match.used_undo && !window.confirm("Using undo means this series won't give a reward spin. Undo anyway?")) {
      return;
    }
    await run(() => connectFour.undo(match.id));
  }

  async function forfeit() {
    if (!window.confirm("Give up this series?")) return;
    const m = await run(() => connectFour.forfeit(match.id));
    if (m) onExit();
  }

  async function rematch() {
    const m = await run(() => connectFour.createMatch(match.difficulty, match.best_of, match.skin));
    if (m) onRematch(m);
  }

  const timeLeft = useTurnTimer(timerSeconds, `${match.id}:${moveCount}`, playable, () => {
    const legal = [...Array(7).keys()].filter((c) => canPlay(cells, c));
    if (legal.length) void drop(legal[Math.floor(Math.random() * legal.length)]);
  });

  let status: string;
  if (match.status === "won") status = `🏆 You beat the ${DIFFICULTY_LABEL[match.difficulty]} AI! +${match.points} pts`;
  else if (match.status === "lost") status = "💀 The AI wins the series. Try again!";
  else if (match.status === "forfeited") status = "Series forfeited.";
  else if (match.game_over && match.outcome.kind === "draw") status = "Draw! Draws don't count, play the next game.";
  else if (match.game_over && match.outcome.kind === "win")
    status = match.outcome.winner === "p1" ? "You win this game!" : "The AI wins this game.";
  else if (busy) status = "AI is thinking…";
  else status = "Your turn: drop a chip";

  const canUndo = playable && match.undos_left > 0 && moveCount >= 2;

  return (
    <div className="c4-play">
      <Scoreboard
        names={names}
        skins={skins}
        wins={[match.user_wins, match.ai_wins]}
        draws={match.draws}
        bestOf={match.best_of}
        turn={!active || match.game_over ? null : busy ? 2 : 1}
      />
      <div className="c4-bar">
        <div className="status-bar" role="status" aria-live="polite">
          {status}
        </div>
        <TimerBadge left={timeLeft} total={timerSeconds} />
      </div>

      <Board
        cells={cells}
        skins={skins}
        turn={1}
        interactive={playable}
        winningCells={match.game_over ? match.winning_cells : []}
        lastMove={lastMove}
        playerNames={names}
        onPlay={(c) => void drop(c)}
      />

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {match.status === "won" && (
        <div className="result-card">
          <h3>Series won</h3>
          <div className="score-big">+{match.points} pts</div>
          {match.spin_granted ? (
            <p className="unlock">🎡 You earned a reward spin!</p>
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
              onClick={() => void undo()}
              disabled={!canUndo}
              title={match.difficulty === "impossible" ? "No undo on Impossible" : undefined}
            >
              ↶ Undo ({match.difficulty === "impossible" ? "off" : match.undos_left})
            </button>
            <button className="btn-ghost" onClick={() => void forfeit()} disabled={busy}>
              🏳 Forfeit
            </button>
          </>
        )}
        {active && match.game_over && (
          <button className="btn-green" onClick={() => void run(() => connectFour.nextGame(match.id))} disabled={busy}>
            ▶ Next game
          </button>
        )}
        {match.status === "won" && match.spin_granted && (
          <button className="btn" onClick={onSpin}>
            🎡 Spin the wheel
          </button>
        )}
        {!active && (
          <button className="btn-green" onClick={() => void rematch()} disabled={busy}>
            ↻ Play again
          </button>
        )}
        <button className="btn-ghost" onClick={onExit} disabled={busy && active}>
          ← Menu
        </button>
      </div>
      {active && (
        <p className="hint">
          Every move is checked by the server. Undo: {match.difficulty === "impossible" ? "disabled on Impossible" : "max 3 per game"}
          {" "}· using undo forfeits this series' reward spin.
        </p>
      )}
    </div>
  );
}
