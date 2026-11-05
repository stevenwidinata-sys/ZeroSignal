import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TitleBadge from "../components/TitleBadge";
import {
  type AchievementFilter,
  filterAchievements,
  sortAchievements,
  useAchievements,
} from "../store/achievements";

const fmt = (n: number) => n.toLocaleString();
const FILTERS: { id: AchievementFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "locked", label: "Locked" },
  { id: "claimed", label: "Claimed" },
];

export default function Achievements() {
  const { view, busy, error, load, claim } = useAchievements();
  const [filter, setFilter] = useState<AchievementFilter>("all");

  useEffect(() => {
    void load();
  }, [load]);

  if (!view) return <div className="loading">Loading achievements</div>;
  const list = filterAchievements(sortAchievements(view.achievements), filter);

  return (
    <div className="ach-page">
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">
            ← Arcade
          </Link>
          <h1 style={{ marginTop: 12 }}>🏅 Achievements</h1>
          <p>
            {view.claimed}/{view.achievements.length} claimed. Each one pays coins + XP once and unlocks a title
            you can wear in your <Link to="/profile">wardrobe</Link>.
          </p>
        </div>
      </div>

      <div className="segmented" role="radiogroup" aria-label="Filter achievements">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={filter === f.id}
            className={`btn-sm ${filter === f.id ? "" : "btn-ghost"}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === "ready" && view.ready > 0 && ` (${view.ready})`}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="ach-grid">
        {list.map((a) => {
          const pct = Math.min(100, (a.progress / a.target) * 100);
          const state = a.claimed_at ? "claimed" : a.unlocked ? "ready" : "locked";
          return (
            <li key={a.id} className={`ach ach-${state}`}>
              <div className="ach-head">
                <strong>{a.name}</strong>
                <span className="ach-reward">
                  {a.coins} 🪙 + {a.xp} XP
                </span>
              </div>
              <p>{a.description}</p>
              <TitleBadge id={a.title} />
              {state === "locked" && (
                <>
                  <div
                    className="quest-bar"
                    role="progressbar"
                    aria-label={a.name}
                    aria-valuemin={0}
                    aria-valuemax={a.target}
                    aria-valuenow={a.progress}
                  >
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <small>
                    {fmt(a.progress)} / {fmt(a.target)}
                  </small>
                </>
              )}
              {state === "ready" && (
                <button className="btn-green btn-sm" disabled={busy !== null} onClick={() => void claim(a.id)}>
                  Claim
                </button>
              )}
              {state === "claimed" && (
                <small className="ach-done">✓ Claimed {new Date(a.claimed_at!).toLocaleDateString()}</small>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="muted">Nothing here yet.</li>}
      </ul>
    </div>
  );
}
