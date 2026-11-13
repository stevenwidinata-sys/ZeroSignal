import { useRef, type CSSProperties } from "react";
import { tileValue, type Dir } from "./engine";
import { digitsClass, swipeDir, tileClass, type Tile } from "./tiles";

interface Props {
  size: number;
  tiles: Tile[];
  onMove: (dir: Dir) => void;
  /** Shown on top of the board (game over, 2048 reached). */
  overlay?: React.ReactNode;
  light: boolean;
}

/** The board: empty cells underneath, sliding tiles on top. Swipe to move. */
export default function Board({ size, tiles, onMove, overlay, light }: Props) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const label = tiles
    .filter((t) => t.state !== "ghost")
    .sort((a, b) => a.pos - b.pos)
    .map((t) => `row ${Math.floor(t.pos / size) + 1} column ${(t.pos % size) + 1}: ${tileValue(t.exp)}`)
    .join(", ");

  return (
    <div
      className={`g2048-board${light ? " g2048-light" : ""}`}
      style={{ "--n": size } as CSSProperties}
      role="application"
      aria-label={`2048 board, ${size} by ${size}. Use the arrow keys or swipe. Tiles: ${label || "none"}`}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const dir = swipeDir(e.clientX - start.current.x, e.clientY - start.current.y);
        start.current = null;
        if (dir) onMove(dir);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <div className="g2048-grid" aria-hidden="true">
        {Array.from({ length: size * size }, (_, i) => (
          <div key={i} className="g2048-cell" />
        ))}
      </div>
      <div className="g2048-tiles" aria-hidden="true">
        {tiles.map((t) => {
          const value = tileValue(t.exp);
          return (
            <div
              key={t.id}
              className={`g2048-tile ${tileClass(t.exp)} ${digitsClass(value)} is-${t.state}`}
              style={{ "--c": t.pos % size, "--r": Math.floor(t.pos / size) } as CSSProperties}
            >
              <span>{value}</span>
            </div>
          );
        })}
      </div>
      {overlay && <div className="g2048-overlay">{overlay}</div>}
    </div>
  );
}
