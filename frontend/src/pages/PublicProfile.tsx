import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { PublicProfile as Profile } from "../api/types";
import Avatar from "../character/Avatar";
import { ITEMS, normalizeLoadout } from "../character/catalog";
import TitleBadge from "../components/TitleBadge";
import { findGame } from "../platform/registry";
import { useAuth } from "../store/auth";

const fmt = (n: number) => n.toLocaleString();
/** Achievement titles are the catalog items only achievements can unlock. */
const ACHIEVEMENT_COUNT = ITEMS.filter((i) => i.unlock.kind === "achievement").length;

/** Anyone's profile: character, level and game stats. Nothing private. */
export default function PublicProfile() {
  const { username = "" } = useParams();
  const me = useAuth((s) => s.user);
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setP(null);
    setError(null);
    api
      .profile(username)
      .then((x) => !cancelled && setP(x))
      .catch((e) => !cancelled && setError(e instanceof Error && e.message === "not found" ? "No player with that name." : "Could not load profile."));
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (error)
    return (
      <div className="panel notice">
        <span className="notice-icon" aria-hidden="true">
          👻
        </span>
        <h2>{error}</h2>
        <Link to="/" className="btn">
          ← Back to arcade
        </Link>
      </div>
    );
  if (!p) return <div className="loading">Loading profile</div>;

  const loadout = normalizeLoadout(p.loadout);
  const isMe = me?.username.toLowerCase() === p.username.toLowerCase();

  return (
    <div className="pub">
      <Link to="/leaderboard" className="back-link">
        ← Leaderboards
      </Link>
      <div className="panel pub-card">
        <Avatar loadout={loadout} size={200} label={`${p.username}'s character`} />
        <div className="pub-info">
          <h1>{p.username}</h1>
          <TitleBadge id={loadout.title} />
          <dl className="hero-stats">
            <div>
              <dt>Level</dt>
              <dd>{p.level}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>
                {p.items_owned}/{ITEMS.length}
              </dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{new Date(p.joined).toLocaleDateString()}</dd>
            </div>
          </dl>
          {isMe && (
            <Link to="/profile" className="btn btn-sm">
              ✏️ Edit my character
            </Link>
          )}
        </div>
      </div>

      <section>
        <h2>🏅 Achievements · {p.achievements.length}/{ACHIEVEMENT_COUNT}</h2>
        {p.achievements.length === 0 ? (
          <p className="muted">No achievements claimed yet.</p>
        ) : (
          <ul className="pub-achievements">
            {p.achievements.map((a) => (
              <li key={a.id} className="panel">
                <strong>{a.name}</strong>
                <small>{a.description}</small>
                <TitleBadge id={a.title} small />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Game stats</h2>
        <div className="board-table-wrap">
          <table className="board-table">
            <thead>
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Best</th>
                <th scope="col">Results</th>
              </tr>
            </thead>
            <tbody>
              {p.stats.map((s) => {
                const g = findGame(s.game_id);
                return (
                  <tr key={s.game_id}>
                    <td>
                      <Link to={`/leaderboard/${s.game_id}`}>
                        {g?.meta.icon} {g?.meta.title ?? s.game_id}
                      </Link>
                    </td>
                    <td className="num">
                      {fmt(s.best_score)} {g?.meta.scoreLabel.toLowerCase()}
                    </td>
                    <td>{fmt(s.plays)}</td>
                  </tr>
                );
              })}
              {p.stats.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    No verified results yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
