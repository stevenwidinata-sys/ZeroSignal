import { useCallback, useState } from "react";
import { playSfx } from "../../platform/sound";
import { useSettings } from "../../store/settings";
import Board from "./Board";
import {
  type Game,
  type Series,
  landingRow,
  newGame,
  play,
  randomColumn,
  recordResult,
  seriesWinner,
  toMove,
} from "./logic";
import Scoreboard from "./Scoreboard";
import { TimerBadge, useTurnTimer } from "./timer";

interface Props {
  bestOf: 3 | 5;
  skins: [string, string];
  names: [string, string];
  onExit: () => void;
}

/** Local 2-player on one device. Just for fun: no points or spins. */
export default function LocalGame({ bestOf, skins, names, onExit }: Props) {
  const timerSeconds = useSettings((s) => s.turnTimer);
  const [game, setGame] = useState<Game>(newGame);
  const [series, setSeries] = useState<Series>({ bestOf, wins: [0, 0], draws: 0 });
  const [lastMove, setLastMove] = useState<[number, number] | null>(null);

  const over = game.outcome.kind !== "ongoing";
  const champion = seriesWinner(series);
  const turn = toMove(game);

  const drop = useCallback(
    (col: number) => {
      const next = play(game, col);
      if (!next) return;
      playSfx("drop");
      setLastMove([col, landingRow(game.cells, col)]);
      setGame(next);
      if (next.outcome.kind !== "ongoing") {
        const s = recordResult(series, next.outcome);
        setSeries(s);
        playSfx(next.outcome.kind === "draw" ? "draw" : "win");
      }
    },
    [game, series],
  );

  const timeLeft = useTurnTimer(timerSeconds, `${game.moves.length}`, !over, () => {
    const c = randomColumn(game);
    if (c !== null) drop(c);
  });

  function nextGame() {
    playSfx("click");
    setGame(newGame());
    setLastMove(null);
  }

  function rematch() {
    setSeries({ bestOf, wins: [0, 0], draws: 0 });
    nextGame();
  }

  let status: string;
  if (champion) status = `🏆 ${names[champion - 1]} wins the series!`;
  else if (game.outcome.kind === "win") status = `${names[game.outcome.winner - 1]} wins this game!`;
  else if (game.outcome.kind === "draw") status = "It's a draw!";
  else status = `${names[turn - 1]}'s turn`;

  return (
    <div className="c4-play">
      <Scoreboard
        names={names}
        skins={skins}
        wins={series.wins}
        draws={series.draws}
        bestOf={bestOf}
        turn={over ? null : turn}
      />
      <div className="c4-bar">
        <div className="status-bar" role="status" aria-live="polite">
          {status}
        </div>
        <TimerBadge left={timeLeft} total={timerSeconds} />
      </div>
      <Board
        cells={game.cells}
        skins={skins}
        turn={turn}
        interactive={!over}
        winningCells={game.winningCells}
        lastMove={lastMove}
        playerNames={names}
        onPlay={drop}
      />
      <div className="game-controls">
        {over && !champion && (
          <button className="btn-green" onClick={nextGame}>
            ▶ Next game
          </button>
        )}
        {champion && (
          <button className="btn-green" onClick={rematch}>
            ↻ Rematch
          </button>
        )}
        <button className="btn-ghost" onClick={onExit}>
          ← Menu
        </button>
      </div>
      <p className="hint">Local games are just for fun: points and spins come from beating the AI.</p>
    </div>
  );
}
