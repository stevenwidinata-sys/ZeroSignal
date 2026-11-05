import Piece from "./Piece";

interface Props {
  names: [string, string];
  faces: [string, string];
  wins: [number, number];
  draws: number;
  bestOf: number;
  turn: 1 | 2 | null;
}

export default function Scoreboard({ names, faces, wins, draws, bestOf, turn }: Props) {
  const played = wins[0] + wins[1] + draws;
  return (
    <div className="c4-score" aria-label="Series score">
      {[0, 1].map((i) => (
        <div key={i} className={`c4-player${turn === i + 1 ? " active" : ""}`}>
          <Piece face={faces[i]} size={36} mark={(i + 1) as 1 | 2} />
          <div>
            <strong>{names[i]}</strong>
            <span>
              {wins[i]} win{wins[i] === 1 ? "" : "s"}
            </span>
          </div>
          {turn === i + 1 && <span className="tag tag-yellow">Turn</span>}
        </div>
      ))}
      <div className="c4-meta">
        Game {Math.min(played + 1, bestOf)} of {bestOf}
        {draws > 0 && <> · {draws} draw{draws > 1 ? "s" : ""}</>}
      </div>
    </div>
  );
}
