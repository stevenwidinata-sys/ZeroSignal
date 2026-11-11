import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { minefield } from "../../api/client";
import type { MfDifficulty, MfGame } from "../../api/types";
import { playSfx } from "../../platform/sound";
import Field, { DIFF_NAME } from "./Field";

const SIZES: { id: MfDifficulty; size: string; blurb: string }[] = [
  { id: "beginner", size: "9×9 · 10 mines", blurb: "Learn the ropes. Pays 5 coins." },
  { id: "intermediate", size: "16×16 · 40 mines", blurb: "The real thing. Pays 20 coins." },
  { id: "expert", size: "16×30 · 99 mines", blurb: "For sweepers with nerves of steel. Pays 60 coins." },
  { id: "daily", size: "16×16 · 40 mines", blurb: "Same board for everyone today. One try. Clock starts on open." },
];

export default function Play() {
  const [game, setGame] = useState<MfGame | null>(null);
  const [resume, setResume] = useState<MfGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<MfDifficulty | null>(null);

  useEffect(() => {
    minefield
      .active()
      .then(setResume)
      .catch(() => setResume(null));
  }, []);

  async function start(d: MfDifficulty) {
    setStarting(d);
    setError(null);
    try {
      const g = await minefield.create(d);
      playSfx("click");
      setResume(null);
      setGame(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start a game");
    } finally {
      setStarting(null);
    }
  }

  function menu() {
    setGame(null);
    minefield
      .active()
      .then(setResume)
      .catch(() => setResume(null));
  }

  const header = (
    <div className="page-head">
      <div>
        <Link to="/" className="back-link">
          ← Arcade
        </Link>
        <h1 style={{ marginTop: 12 }}>
          Minefield {game && <span className="tag">{DIFF_NAME[game.difficulty]}</span>}
        </h1>
        <p>Clear the field. Every board is solvable without guessing.</p>
      </div>
      <Link to="/leaderboard/minefield" className="btn btn-blue btn-sm">
        🏆 Leaderboard
      </Link>
    </div>
  );

  if (game) {
    return (
      <>
        {header}
        <Field key={game.id} initial={game} onNew={() => void start(game.difficulty === "daily" ? "intermediate" : game.difficulty)} onMenu={menu} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="c4-menu">
        {resume && (
          <div className="panel c4-resume">
            <span>
              Unfinished <strong>{DIFF_NAME[resume.difficulty]}</strong> board
            </span>
            <button className="btn-green btn-sm" onClick={() => setGame(resume)}>
              ▶ Resume
            </button>
          </div>
        )}
        <div className="panel c4-panel">
          <fieldset className="wam-modes">
            <legend>Pick a board</legend>
            {SIZES.map((s) => (
              <button key={s.id} type="button" className="wam-mode" onClick={() => void start(s.id)} disabled={starting !== null}>
                <span className="wam-mode-icon" aria-hidden="true">
                  {s.id === "daily" ? "📅" : s.id === "expert" ? "💀" : s.id === "intermediate" ? "💣" : "🌱"}
                </span>
                <strong>{starting === s.id ? "Starting…" : DIFF_NAME[s.id]}</strong>
                <small>{s.size}</small>
                <small>{s.blurb}</small>
              </button>
            ))}
          </fieldset>
          <p className="wam-hint">
            <strong>No guessing, ever:</strong> the server only deals boards its logic solver can clear from your first click,
            and it keeps the mines hidden until the game ends. Faster clears score more. Hints open a safe cell but add 20 s.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
