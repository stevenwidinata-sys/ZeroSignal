import { Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { findGame } from "../platform/registry";

export default function PlayGame() {
  const { gameId } = useParams();
  const game = findGame(gameId);

  if (!game) {
    return (
      <div className="panel notice">
        <h2>Game not found</h2>
        <p>That cartridge doesn't exist.</p>
        <Link to="/" className="btn">
          ← Back to arcade
        </Link>
      </div>
    );
  }

  const { Play } = game;
  if (game.meta.status !== "live" || !Play) {
    return (
      <div className="panel notice">
        <span className="notice-icon" aria-hidden="true">
          {game.meta.icon}
        </span>
        <h2>{game.meta.title} is coming soon</h2>
        <p>We're still building this one. Check back soon.</p>
        <Link to="/" className="btn">
          ← Back to arcade
        </Link>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="loading">Loading {game.meta.title}</div>}>
      <Play />
    </Suspense>
  );
}
