import { useState } from "react";
import Chip from "./Chip";
import { COLS, ROWS, canPlay, type Cells } from "./logic";

interface Props {
  cells: Cells;
  /** Skin per player: [player 1, player 2]. */
  skins: [string, string];
  /** Player whose turn it is (used for the hover preview). */
  turn: 1 | 2;
  /** False while waiting (AI thinking, game over, ...). */
  interactive: boolean;
  winningCells: [number, number][];
  /** The most recent move, animated as a falling chip. */
  lastMove: [number, number] | null;
  playerNames: [string, string];
  onPlay: (col: number) => void;
}

export default function Board({
  cells,
  skins,
  turn,
  interactive,
  winningCells,
  lastMove,
  playerNames,
  onPlay,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const isWin = (c: number, r: number) => winningCells.some(([x, y]) => x === c && y === r);

  return (
    <div className={`c4-board${winningCells.length ? " has-win" : ""}`}>
      <div className="c4-columns" role="group" aria-label="Connect Four board">
        {Array.from({ length: COLS }, (_, c) => {
          const playable = interactive && canPlay(cells, c);
          const filled = cells[c].filter(Boolean).length;
          return (
            <button
              key={c}
              type="button"
              className="c4-col"
              disabled={!playable}
              onClick={() => onPlay(c)}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover((h) => (h === c ? null : h))}
              onFocus={() => setHover(c)}
              onBlur={() => setHover((h) => (h === c ? null : h))}
              aria-label={`Column ${c + 1}${playable ? "" : ", unavailable"}. ${filled} of ${ROWS} filled.`}
            >
              <span className="c4-preview" aria-hidden="true">
                {playable && hover === c && <Chip skin={skins[turn - 1]} className="c4-chip" />}
              </span>
              {/* Rows rendered top to bottom. */}
              {Array.from({ length: ROWS }, (_, i) => {
                const r = ROWS - 1 - i;
                const v = cells[c][r];
                const dropping = lastMove && lastMove[0] === c && lastMove[1] === r;
                return (
                  <span key={r} className="c4-slot" aria-hidden="true">
                    {v !== 0 && (
                      <span
                        className={`c4-piece${dropping ? " drop" : ""}${isWin(c, r) ? " win" : ""}`}
                        style={dropping ? ({ "--fall": ROWS - r } as React.CSSProperties) : undefined}
                      >
                        <Chip skin={skins[v - 1]} className="c4-chip" />
                      </span>
                    )}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {lastMove
          ? `${playerNames[cells[lastMove[0]][lastMove[1]] - 1] ?? "Someone"} played column ${lastMove[0] + 1}.`
          : ""}
      </p>
    </div>
  );
}
