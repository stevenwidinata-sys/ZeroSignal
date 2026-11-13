import type { G2048Finish } from "../../api/types";
import { TENTHS } from "./engine";
import { MODE_INFO } from "./modes";
import { digitsClass, formatPlayTime, tileClass } from "./tiles";

const fmt = (n: number) => n.toLocaleString();

interface Props {
  result: G2048Finish;
  /** Time played on this device, ms (null if unknown). */
  playMs: number | null;
  onAgain: (() => void) | null;
  onMenu: () => void;
}

export default function Results({ result, playMs, onAgain, onMenu }: Props) {
  const s = result.summary;
  const exp = s.max_tile > 0 ? Math.log2(s.max_tile) : 0;
  const mult = TENTHS[result.mode] / 10;

  return (
    <div className="panel wam-results">
      <div className="wam-results-head">
        <small>
          {MODE_INFO[result.mode].icon} {MODE_INFO[result.mode].name} · {s.game_over ? "No moves left" : "Ended early"}
        </small>
        <strong className="wam-final">{fmt(s.points)}</strong>
        {result.new_best ? (
          <span className="tag tag-yellow wam-best">★ New best!</span>
        ) : (
          result.previous_best > 0 && <span className="tag">Best: {fmt(result.previous_best)}</span>
        )}
        {s.max_tile >= 2048 && <span className="tag tag-blue">🏆 {fmt(s.max_tile)} reached</span>}
        {mult !== 1 && (
          <small>
            {fmt(s.score)} merge points × {mult} ({MODE_INFO[result.mode].name})
          </small>
        )}
      </div>

      <div className="g2048-best">
        <span className="wam-hint">Biggest tile</span>
        <div className={`g2048-tile g2048-tile-solo ${tileClass(exp)} ${digitsClass(s.max_tile)}`}>
          <span>{s.max_tile}</span>
        </div>
      </div>

      <dl className="wam-stats">
        <div>
          <dt>Moves</dt>
          <dd>{fmt(s.moves)}</dd>
        </div>
        <div>
          <dt>Undos used</dt>
          <dd>{s.undos_used}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{playMs !== null ? formatPlayTime(playMs) : "–"}</dd>
        </div>
      </dl>
      {s.moves < 20 && <p className="wam-hint">Games shorter than 20 moves don't pay rewards or count for quests.</p>}

      <div className="game-controls">
        {onAgain && (
          <button className="btn-green" onClick={onAgain} autoFocus>
            ↻ Play again
          </button>
        )}
        <button className={onAgain ? "btn-ghost" : "btn-green"} onClick={onMenu} autoFocus={!onAgain}>
          Change mode
        </button>
      </div>
    </div>
  );
}
