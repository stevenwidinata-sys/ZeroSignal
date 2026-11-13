import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";

/** Slim reminder at the top while playing as a guest. */
export function GuestBanner() {
  const user = useAuth((s) => s.user);
  const { pathname } = useLocation();
  if (!user?.is_guest || pathname === "/register" || pathname === "/login") return null;
  return (
    <div className="guest-banner" role="note">
      <span>
        👤 <strong>Playing as a guest.</strong> Register to save your scores to the leaderboards. Everything you play now is kept.
      </span>
      <span className="guest-banner-actions">
        <Link to="/register" className="btn btn-green btn-sm">
          Register
        </Link>
        <Link to="/login" className="btn btn-ghost btn-sm">
          Log in
        </Link>
      </span>
    </div>
  );
}

/** One-time message after register/login (guest progress kept or moved). */
export function AuthNotice() {
  const notice = useAuth((s) => s.notice);
  const clear = useAuth((s) => s.clearNotice);
  if (!notice) return null;
  return (
    <div className="guest-notice" role="status">
      <span>✅ {notice}</span>
      <button className="btn-ghost btn-sm" onClick={clear} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

/** Shown instead of an account-only page (shop, wardrobe, quests...) for guests. */
export function GuestGate({ feature }: { feature: string }) {
  const location = useLocation();
  return (
    <div className="panel notice guest-gate">
      <span className="notice-icon" aria-hidden="true">
        🔒
      </span>
      <h2>{feature} needs an account</h2>
      <p>
        You're playing as a guest. Register (free) to use {feature.toLowerCase()}. Everything you've played so far is kept, and your
        scores go on the leaderboards.
      </p>
      <div className="game-controls">
        <Link to="/register" className="btn btn-green">
          Register
        </Link>
        <Link to="/login" state={{ from: location }} className="btn btn-ghost">
          Log in
        </Link>
      </div>
    </div>
  );
}

/** "Register to save this score" on results screens (guests only). */
export function SaveScorePrompt() {
  const user = useAuth((s) => s.user);
  if (!user?.is_guest) return null;
  return (
    <div className="save-score" role="note">
      <span>🏆 This score isn't on the leaderboard yet. Register to save it (and everything else you've played).</span>
      <span className="guest-banner-actions">
        <Link to="/register" className="btn btn-green btn-sm">
          Register to save
        </Link>
        <Link to="/login" className="btn btn-ghost btn-sm">
          Log in
        </Link>
      </span>
    </div>
  );
}
