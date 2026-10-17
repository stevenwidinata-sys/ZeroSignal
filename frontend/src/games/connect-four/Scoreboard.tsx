import Chip from "./Chip";

interface Props {
  names: [string, string];
  skins: [string, string];
  wins: [number, number];
  draws: number;
  bestOf: number;
  /** Highlight whose turn it is (null when no game is running). */
  turn: 1 | 2 | null;
}

/** Series score: chips, names, wins as pips out of the needed majority. */
export default function Scoreboard({ names, skins, wins, draws, bestOf, turn }: Props) {
  const need = Math.floor(bestOf / 2) + 1;
  return (
    <div className="c4-score" aria-label="Series score">
      {[0, 1].map((i) => (
        <div key={i} className={`c4-player${turn === i + 1 ? " active" : ""}`}>
          <Chip skin={skins[i]} size={36} />
          <div>
            <strong>{names[i]}</strong>
            <span className="c4-pips" aria-label={`${wins[i]} of ${need} wins`}>
              {Array.from({ length: need }, (_, k) => (
                <span key={k} className={k < wins[i] ? "on" : ""} />
              ))}
            </span>
          </div>
          {turn === i + 1 && <span className="tag tag-yellow">Turn</span>}
        </div>
      ))}
      <div className="c4-meta">
        Best of {bestOf}
        {draws > 0 && <> · {draws} draw{draws > 1 ? "s" : ""}</>}
      </div>
    </div>
  );
}
