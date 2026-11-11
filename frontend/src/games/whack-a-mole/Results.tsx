import type { WamFinish } from "../../api/types";
import { KINDS } from "./engine";
import { itemName } from "./items";
import Mole, { KIND_LABEL } from "./Mole";

const fmt = (n: number) => n.toLocaleString();

/** Accuracy in %: hits out of every counted tap. */
export function accuracy(hits: number, misses: number): number {
  const total = hits + misses;
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}

/** 0..4 heat level for the hole map (relative to the busiest hole). */
export function heat(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((value / max) * 4));
}

interface Props {
  result: WamFinish;
  grid: 3 | 4;
  onAgain: () => void;
  onMenu: () => void;
}

export default function Results({ result, grid, onAgain, onMenu }: Props) {
  const s = result.summary;
  const acc = accuracy(s.hits, s.misses);
  const avgReaction = s.reactions ? Math.round(s.reaction_total_ms / s.reactions) : 0;
  const maxHits = Math.max(...s.hole_hits, 0);
  const survival = result.mode === "survival";

  return (
    <div className="panel wam-results">
      <div className="wam-results-head">
        <small>{survival ? `Survived ${(s.ended_ms / 1000).toFixed(1)}s` : "Final score"}</small>
        <strong className="wam-final">{fmt(s.score)}</strong>
        {result.new_best ? (
          <span className="tag tag-yellow wam-best">★ New best!</span>
        ) : (
          result.previous_best > 0 && <span className="tag">Best: {fmt(result.previous_best)}</span>
        )}
        {s.fever && <span className="tag tag-blue">🔥 FEVER reached</span>}
        {s.bosses_beaten > 0 && <span className="tag">👑 {s.bosses_beaten} boss{s.bosses_beaten > 1 ? "es" : ""} knocked out</span>}
      </div>

      {result.drop && (
        <div className="wam-drop" role="status">
          🎁 <strong>Lucky drop!</strong> You got the <strong>{itemName(result.drop)}</strong>. Pick it on the setup screen.
        </div>
      )}

      <dl className="wam-stats">
        <div>
          <dt>Accuracy</dt>
          <dd>{acc}%</dd>
        </div>
        <div>
          <dt>Avg. reaction</dt>
          <dd>{avgReaction ? `${avgReaction} ms` : "–"}</dd>
        </div>
        <div>
          <dt>Best combo</dt>
          <dd>{s.best_streak}</dd>
        </div>
        <div>
          <dt>Hits / misses</dt>
          <dd>
            {s.hits} / {s.misses}
          </dd>
        </div>
        <div>
          <dt>Escaped</dt>
          <dd>{s.escapes}</dd>
        </div>
        <div>
          <dt>Bombs hit</dt>
          <dd>{s.bombs_hit}</dd>
        </div>
      </dl>

      <div className="wam-results-cols">
        <section>
          <h3>Moles whacked</h3>
          <ul className="wam-kinds">
            {KINDS.filter((k) => k !== "bomb" && (s.by_kind[KINDS.indexOf(k)] ?? 0) + (k === "normal" ? 1 : 0) > 0).map((k) => (
              <li key={k}>
                <Mole kind={k} size={34} />
                <span>{KIND_LABEL[k]}</span>
                <strong>{s.by_kind[KINDS.indexOf(k)]}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Hole map</h3>
          <p className="wam-hint">Hits per hole (✕ = misses). Darker = more hits.</p>
          <div className={`wam-heat grid-${grid}`}>
            {s.hole_hits.map((h, i) => (
              <div key={i} className={`heat-${heat(h, maxHits)}`} title={`Hole ${i + 1}: ${h} hits, ${s.hole_misses[i]} misses`}>
                <strong>{h}</strong>
                {s.hole_misses[i] > 0 && <small>✕{s.hole_misses[i]}</small>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="game-controls">
        <button className="btn-green" onClick={onAgain} autoFocus>
          ↻ Play again
        </button>
        <button className="btn-ghost" onClick={onMenu}>
          Change mode
        </button>
      </div>
    </div>
  );
}
