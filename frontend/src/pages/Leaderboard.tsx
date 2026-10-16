import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { LeaderboardEntry, MyScoresResponse } from "../api/types";
import { GAMES, findGame } from "../platform/registry";
import { useAuth } from "../store/auth";

const fmt = (n: number) => n.toLocaleString();

export default function Leaderboard() {
  const { gameId } = useParams();
  const game = findGame(gameId);
  const user = useAuth((s) => s.user);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [mine, setMine] = useState<MyScoresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!game) return;
    let cancelled = false; // ignore stale responses when switching tabs
    setEntries(null);
    setError(null);
    api
      .leaderboard(game.meta.id)
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => {
        if (cancelled) return;
        setEntries([]);
        setError(e instanceof Error ? e.message : "failed to load leaderboard");
      });
    return () => {
      cancelled = true;
    };
  }, [game]);

  useEffect(() => {
    if (!game || !user) {
      setMine(null);
      return;
    }
    let cancelled = false;
    api
      .myScores(game.meta.id)
      .then((m) => !cancelled && setMine(m))
      .catch(() => !cancelled && setMine(null));
    return () => {
      cancelled = true;
    };
  }, [game, user]);

  if (!game) return <Navigate to={`/leaderboard/${GAMES[0].meta.id}`} replace />;

  const { meta } = game;
  const live = meta.status === "live";
  const showBird = mine?.scores.some((s) => s.bird_variant) ?? false;

  return (
    <div className="board-page">
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">
            ← Arcade
          </Link>
          <h1 style={{ marginTop: 12 }}>🏆 High scores</h1>
          <p>Top 20 per game. Every score is verified by the server.</p>
        </div>
        {live && (
          <Link to={`/play/${meta.id}`} className="btn btn-green">
            ▶ Play {meta.title}
          </Link>
        )}
      </div>

      <nav className="tabs" aria-label="Choose game leaderboard">
        {GAMES.map((g) => (
          <NavLink
            key={g.meta.id}
            to={`/leaderboard/${g.meta.id}`}
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            <span aria-hidden="true">{g.meta.icon}</span> {g.meta.title}
            {g.meta.status !== "live" && <span className="tag tag-yellow">Soon</span>}
          </NavLink>
        ))}
      </nav>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="board-table-wrap">
        <table className="board-table">
          <caption className="sr-only">{meta.title} leaderboard</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">{meta.scoreLabel}</th>
            </tr>
          </thead>
          <tbody>
            {entries === null && (
              <tr>
                <td colSpan={3} className="empty">
                  Loading…
                </td>
              </tr>
            )}
            {entries?.map((e) => (
              <tr key={e.rank} className={user?.username === e.username ? "me" : ""}>
                <td>
                  <span className={`rank rank-${e.rank}`}>{e.rank}</span>
                </td>
                <td>
                  <strong>{e.username}</strong>
                  {user?.username === e.username && (
                    <>
                      {" "}
                      <span className="tag">You</span>
                    </>
                  )}
                </td>
                <td className="num">{fmt(e.best_score)}</td>
              </tr>
            ))}
            {entries?.length === 0 && !error && (
              <tr>
                <td colSpan={3} className="empty">
                  {live
                    ? "No scores yet. Be the first legend."
                    : `${meta.title} is coming soon. Its board opens on launch day.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {live && mine && (
        <section>
          <h2>Your runs · best {fmt(mine.best_score)}</h2>
          <div className="board-table-wrap">
            <table className="board-table">
              <thead>
                <tr>
                  <th scope="col">Score</th>
                  {showBird && <th scope="col">Bird</th>}
                  <th scope="col">Level</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {mine.scores.map((s, i) => (
                  <tr key={i}>
                    <td className="num">{fmt(s.score)}</td>
                    {showBird && (
                      <td style={{ textTransform: "capitalize" }}>{s.bird_variant ?? "-"}</td>
                    )}
                    <td>{s.level}</td>
                    <td>{new Date(s.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {mine.scores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No runs yet. Go play!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
