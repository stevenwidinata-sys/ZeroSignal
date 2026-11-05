import { useState } from "react";
import { playSfx } from "../../platform/sound";
import { TimerBadge, useTurnTimer } from "../../platform/turnTimer";
import { useSettings } from "../../store/settings";
import Board from "./Board";
import { type Game, emptyCells, newGame, play, seriesState, toMove } from "./logic";
import Scoreboard from "./Scoreboard";

interface Props {
  bestOf: 3 | 5;
  faces: [string, string];
  board: string;
  names: [string, string];
  onExit: () => void;
}

/** Two players on one device. Just for fun: no coins or spins. */
export default function LocalGame({ bestOf, faces, board, names, onExit }: Props) {
  const timer = useSettings((s) => s.turnTimer);
  const [game, setGame] = useState<Game>(newGame);
  const [wins, setWins] = useState<[number, number]>([0, 0]);
  const [draws, setDraws] = useState(0);
  const [last, setLast] = useState<number | null>(null);

  const over = game.outcome.kind !== "ongoing";
  const series = seriesState(bestOf, wins[0], wins[1], draws);
  const turn = toMove(game);

  function drop(cell: number) {
    const next = play(game, cell);
    if (!next) return;
    playSfx("drop");
    setLast(cell);
    setGame(next);
    if (next.outcome.kind === "win") {
      const w = next.outcome.winner;
      setWins((x) => (w === 1 ? [x[0] + 1, x[1]] : [x[0], x[1] + 1]));
      playSfx("win");
    } else if (next.outcome.kind === "draw") {
      setDraws((d) => d + 1);
      playSfx("draw");
    }
  }

  const left = useTurnTimer(timer, `${game.moves.length}:${wins.join()}:${draws}`, !over, () => {
    const free = emptyCells(game.cells);
    if (free.length) drop(free[Math.floor(Math.random() * free.length)]);
  });

  function nextGame() {
    playSfx("click");
    setGame(newGame());
    setLast(null);
  }

  let status: string;
  if (series === "p1" || series === "p2") status = `🏆 ${names[series === "p1" ? 0 : 1]} wins the series!`;
  else if (series === "drawn") status = "The series is a draw!";
  else if (game.outcome.kind === "win") status = `${names[game.outcome.winner - 1]} wins this game!`;
  else if (game.outcome.kind === "draw") status = "It's a draw!";
  else status = `${names[turn - 1]}'s turn`;

  return (
    <div className="c4-play">
      <Scoreboard names={names} faces={faces} wins={wins} draws={draws} bestOf={bestOf} turn={over ? null : turn} />
      <div className="c4-bar">
        <div className="status-bar" role="status" aria-live="polite">
          {status}
        </div>
        <TimerBadge left={left} total={timer} />
      </div>
      <Board
        cells={game.cells}
        board={board}
        faces={faces}
        interactive={!over}
        line={game.line}
        lastMove={last}
        names={names}
        onPlay={drop}
      />
      <div className="game-controls">
        {over && series === "ongoing" && (
          <button className="btn-green" onClick={nextGame}>
            ▶ Next game
          </button>
        )}
        {series !== "ongoing" && (
          <button
            className="btn-green"
            onClick={() => {
              setWins([0, 0]);
              setDraws(0);
              nextGame();
            }}
          >
            ↻ Rematch
          </button>
        )}
        <button className="btn-ghost" onClick={onExit}>
          ← Menu
        </button>
      </div>
      <p className="hint">Friend games are just for fun: coins, XP and spins come from playing the AI.</p>
    </div>
  );
}
