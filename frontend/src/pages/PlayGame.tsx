import { Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TutorialDialog from "../components/TutorialDialog";
import { findGame } from "../platform/registry";
import { recordPlayed } from "../platform/recent";
import { hasSeen, markSeen } from "../platform/tutorial";
import { useAuth } from "../store/auth";

export default function PlayGame() {
  const { gameId } = useParams();
  const game = findGame(gameId);
  const steps = game?.meta.status === "live" ? game.meta.tutorial : undefined;
  const [helpOpen, setHelpOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const initialized = useAuth((s) => s.initialized);
  const ensureGuest = useAuth((s) => s.ensureGuest);
  const [guestError, setGuestError] = useState<string | null>(null);
  const live = game?.meta.status === "live" && !!game.Play;

  // No account? Start a guest session so the game can talk to the server.
  useEffect(() => {
    if (!live || !initialized || user) return;
    setGuestError(null);
    ensureGuest().catch((e: unknown) => setGuestError(e instanceof Error ? e.message : "could not start a guest session"));
  }, [live, initialized, user, ensureGuest]);

  // Remember it for the Hub's "Continue" and "Recently played".
  useEffect(() => {
    if (game?.meta.status === "live" && game.Play) recordPlayed(game.meta.id);
  }, [game]);

  // First visit to each game: show its tutorial once.
  useEffect(() => {
    setHelpOpen(!!steps?.length && !!game && !hasSeen(game.meta.id));
  }, [game, steps]);

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

  if (!user) {
    return guestError ? (
      <div className="panel notice">
        <h2>Couldn't start a guest session</h2>
        <p>{guestError}</p>
        <div className="game-controls">
          <Link to="/register" className="btn btn-green">
            Register
          </Link>
          <Link to="/login" className="btn btn-ghost">
            Log in
          </Link>
        </div>
      </div>
    ) : (
      <div className="loading">Loading {game.meta.title}</div>
    );
  }

  function closeHelp() {
    markSeen(game!.meta.id);
    setHelpOpen(false);
  }

  return (
    <>
      {steps?.length ? (
        <>
          <button
            type="button"
            className="icon-btn help-btn"
            onClick={() => setHelpOpen(true)}
            aria-label={`How to play ${game.meta.title}`}
            title="How to play"
          >
            ?
          </button>
          <TutorialDialog title={game.meta.title} steps={steps} open={helpOpen} onClose={closeHelp} />
        </>
      ) : null}
      <Suspense fallback={<div className="loading">Loading {game.meta.title}</div>}>
        <Play />
      </Suspense>
    </>
  );
}
