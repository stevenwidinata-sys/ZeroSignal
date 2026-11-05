import type { CSSProperties } from "react";
import { findBoard } from "./items";
import type { Cells } from "./logic";
import Piece from "./Piece";

interface Props {
  cells: Cells;
  board: string;
  /** Face per player: [player 1, player 2]. */
  faces: [string, string];
  interactive: boolean;
  line: [number, number, number] | null;
  lastMove: number | null;
  names: [string, string];
  onPlay: (cell: number) => void;
}

const POS = ["top left", "top middle", "top right", "middle left", "center", "middle right", "bottom left", "bottom middle", "bottom right"];

export default function Board({ cells, board, faces, interactive, line, lastMove, names, onPlay }: Props) {
  const art = findBoard(board).art;
  const style = {
    "--ttt-bg": art.bg,
    "--ttt-cell": art.cell,
    "--ttt-line": art.line,
    "--ttt-glow": art.glow ?? "transparent",
  } as CSSProperties;

  return (
    <div className={`ttt-board${line ? " has-win" : ""}${art.glow ? " glow" : ""}`} style={style}>
      <div className="ttt-grid" role="grid" aria-label="Tic-Tac-Toe board">
        {cells.map((v, i) => {
          const playable = interactive && v === 0;
          const win = line?.includes(i);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`ttt-cell${win ? " win" : ""}${lastMove === i ? " last" : ""}`}
              disabled={!playable}
              onClick={() => onPlay(i)}
              aria-label={`${POS[i]}: ${v === 0 ? "empty" : names[v - 1]}`}
            >
              {v !== 0 && <Piece face={faces[v - 1]} size={72} className={lastMove === i ? "pop" : ""} />}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {lastMove !== null && cells[lastMove] ? `${names[cells[lastMove] - 1]} played ${POS[lastMove]}.` : ""}
      </p>
    </div>
  );
}
