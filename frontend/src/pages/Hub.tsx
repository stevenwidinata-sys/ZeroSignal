import { Link } from "react-router-dom";
import { GAMES } from "../platform/registry";
import type { GameModule } from "../platform/types";
import { useAuth } from "../store/auth";

function GameCard({ game }: { game: GameModule }) {
  const { meta } = game;
  const live = meta.status === "live" && !!game.Play;
  return (
    <article
      className={`game-card accent-${meta.accent}${live ? "" : " is-soon"}`}
      aria-labelledby={`game-${meta.id}-title`}
    >
      <div className="game-card-art" aria-hidden="true">
        <span className="game-card-icon">{meta.icon}</span>
        {!live && <span className="ribbon">Coming soon</span>}
      </div>
      <div className="game-card-body">
        <h2 id={`game-${meta.id}-title`}>{meta.title}</h2>
        <p>{meta.tagline}</p>
        <ul className="tag-list" aria-label="Tags">
          {meta.tags.map((t) => (
            <li key={t} className="tag tag-outline">
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="game-card-actions">
        {live ? (
          <>
            <Link to={`/play/${meta.id}`} className="btn">
              ▶ Play
            </Link>
            <Link to={`/leaderboard/${meta.id}`} className="btn btn-ghost btn-sm">
              🏆 Scores
            </Link>
          </>
        ) : (
          <button disabled aria-disabled="true">
            Locked
          </button>
        )}
      </div>
    </article>
  );
}

export default function Hub() {
  const user = useAuth((s) => s.user);
  const live = GAMES.filter((g) => g.meta.status === "live").length;

  return (
    <div className="hub">
      <section className="hero">
        <p className="eyebrow">▶ INSERT COIN</p>
        <h1 className="hero-title">
          ZERO<span>SIGNAL</span>
        </h1>
        <p className="hero-sub">
          Retro games. Real leaderboards. Zero cheats. Every score is verified by
          the server, so the top spot actually means something.
        </p>
        <div className="hero-actions">
          <Link to="/play/angry-bird" className="btn btn-green">
            ▶ Quick play
          </Link>
          {!user && (
            <Link to="/register" className="btn btn-ghost">
              Create account
            </Link>
          )}
        </div>
        <dl className="hero-stats">
          <div>
            <dt>Games live</dt>
            <dd>{live}</dd>
          </div>
          <div>
            <dt>Coming soon</dt>
            <dd>{GAMES.length - live}</dd>
          </div>
          <div>
            <dt>Cheats allowed</dt>
            <dd>0</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="games-heading">
        <h2 id="games-heading" className="section-title">
          Choose your game
        </h2>
        <div className="game-grid">
          {GAMES.map((g) => (
            <GameCard key={g.meta.id} game={g} />
          ))}
        </div>
      </section>
    </div>
  );
}
