import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { StatsSeries, StatsView } from "../api/types";
import { formatTime } from "../games/minefield/logic";
import { findGame } from "../platform/registry";
import { DIFFICULTY_NAME, MF_LEVEL, boardLabel, sumBoards, winRate } from "./statsLogic";

const fmt = (n: number) => n.toLocaleString();

function RateBar({ won, played, label }: { won: number; played: number; label: string }) {
  const pct = winRate(won, played);
  return (
    <div className="stats-rate">
      <div className="quest-bar" role="progressbar" aria-label={`${label} win rate`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <strong>{pct}%</strong>
    </div>
  );
}

function GameCard({ id, children, played }: { id: string; children: React.ReactNode; played: boolean }) {
  const game = findGame(id);
  if (!game) return null;
  return (
    <section className="panel stats-card">
      <div className="stats-card-head">
        <h2>
          <span aria-hidden="true">{game.meta.icon}</span> {game.meta.title}
        </h2>
        <div className="stats-card-links">
          <Link to={`/leaderboard/${id}`} className="btn btn-ghost btn-sm">
            🏆 Board
          </Link>
          <Link to={`/play/${id}`} className="btn btn-green btn-sm">
            ▶ Play
          </Link>
        </div>
      </div>
      {played ? children : <p className="stats-empty">Not played yet. Your records show up here after your first game.</p>}
    </section>
  );
}

function SeriesTable({ rows, withDraws }: { rows: StatsSeries[]; withDraws: boolean }) {
  return (
    <div className="board-table-wrap">
      <table className="board-table stats-table">
        <thead>
          <tr>
            <th scope="col">AI level</th>
            <th scope="col">Series</th>
            <th scope="col">Won</th>
            <th scope="col">Lost</th>
            {withDraws && <th scope="col">Drawn</th>}
            <th scope="col">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.difficulty}>
              <th scope="row">{DIFFICULTY_NAME[r.difficulty] ?? r.difficulty}</th>
              <td className="num">{r.played}</td>
              <td className="num">{r.won}</td>
              <td className="num">{r.lost}</td>
              {withDraws && <td className="num">{r.drawn}</td>}
              <td>
                <RateBar won={r.won} played={r.played} label={DIFFICULTY_NAME[r.difficulty] ?? r.difficulty} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Your own records across every game. */
export default function Stats() {
  const [stats, setStats] = useState<StatsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "could not load your stats"));
  }, []);

  const head = (
    <div className="page-head">
      <div>
        <Link to="/" className="back-link">
          ← Arcade
        </Link>
        <h1 style={{ marginTop: 12 }}>📊 Your stats</h1>
        <p>Every number comes from results the server checked itself.</p>
      </div>
    </div>
  );

  if (error)
    return (
      <>
        {head}
        <div className="error" role="alert">
          {error}
        </div>
      </>
    );
  if (!stats)
    return (
      <>
        {head}
        <div className="loading">Loading your stats</div>
      </>
    );

  const s = stats;
  const cf = s.series.filter((r) => r.game === "connect-four");
  const ttt = s.series.filter((r) => r.game === "tic-tac-toe");
  const ab = sumBoards(s.boards, "angry-bird");
  const wamBoards = s.boards.filter((b) => b.game_id === "whack-a-mole");
  const mfBoards = s.boards.filter((b) => b.game_id === "minefield");
  const totalGames =
    s.series.reduce((n, r) => n + r.played, 0) +
    ab.rounds +
    s.whack.rounds +
    s.minefield.reduce((n, r) => n + r.played, 0);

  return (
    <div className="stats-page">
      {head}

      <dl className="wam-stats stats-overview">
        <div>
          <dt>Level</dt>
          <dd>
            {s.level} <small>({fmt(s.xp)} XP)</small>
          </dd>
        </div>
        <div>
          <dt>Games finished</dt>
          <dd>{fmt(totalGames)}</dd>
        </div>
        <div>
          <dt>Coins earned</dt>
          <dd>{fmt(s.coins_earned)} 🪙</dd>
        </div>
        <div>
          <dt>Coins spent</dt>
          <dd>{fmt(s.coins_spent)} 🪙</dd>
        </div>
        <div>
          <dt>Tokens earned</dt>
          <dd>{fmt(s.tokens_earned)}</dd>
        </div>
        <div>
          <dt>Best login streak</dt>
          <dd>{s.best_login_streak} days</dd>
        </div>
        <div>
          <dt>Quests claimed</dt>
          <dd>{fmt(s.quests_claimed)}</dd>
        </div>
        <div>
          <dt>Achievements</dt>
          <dd>{s.achievements_claimed}</dd>
        </div>
        <div>
          <dt>Playing since</dt>
          <dd>{new Date(s.joined).toLocaleDateString()}</dd>
        </div>
      </dl>

      <div className="stats-grid">
        <GameCard id="connect-four" played={cf.length > 0}>
          <SeriesTable rows={cf} withDraws={false} />
        </GameCard>

        <GameCard id="tic-tac-toe" played={ttt.length > 0}>
          <SeriesTable rows={ttt} withDraws />
        </GameCard>

        <GameCard id="angry-bird" played={ab.rounds > 0}>
          <dl className="wam-stats">
            <div>
              <dt>Rounds</dt>
              <dd>{fmt(ab.rounds)}</dd>
            </div>
            <div>
              <dt>Best score</dt>
              <dd>{fmt(ab.best)}</dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd>{fmt(ab.average)}</dd>
            </div>
          </dl>
        </GameCard>

        <GameCard id="whack-a-mole" played={s.whack.rounds > 0}>
          <dl className="wam-stats">
            <div>
              <dt>Rounds</dt>
              <dd>{fmt(s.whack.rounds)}</dd>
            </div>
            <div>
              <dt>Best combo</dt>
              <dd>{s.whack.best_streak ?? 0}</dd>
            </div>
            <div>
              <dt>FEVER rounds</dt>
              <dd>{fmt(s.whack.fever_rounds)}</dd>
            </div>
            <div>
              <dt>Golden moles</dt>
              <dd>{fmt(s.whack.golden_hits ?? 0)}</dd>
            </div>
            <div>
              <dt>Longest Survival</dt>
              <dd>{s.whack.longest_survival_ms ? formatTime(s.whack.longest_survival_ms) : "–"}</dd>
            </div>
          </dl>
          <div className="board-table-wrap">
            <table className="board-table stats-table">
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Rounds</th>
                  <th scope="col">Best</th>
                  <th scope="col">Average</th>
                </tr>
              </thead>
              <tbody>
                {wamBoards.map((b) => (
                  <tr key={b.level}>
                    <th scope="row">{boardLabel("whack-a-mole", b.level)}</th>
                    <td className="num">{b.rounds}</td>
                    <td className="num">{fmt(b.best)}</td>
                    <td className="num">{fmt(b.average)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GameCard>

        <GameCard id="minefield" played={s.minefield.length > 0}>
          <div className="board-table-wrap">
            <table className="board-table stats-table">
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">Games</th>
                  <th scope="col">Cleared</th>
                  <th scope="col">Best time</th>
                  <th scope="col">Best pts</th>
                  <th scope="col">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {s.minefield.map((r) => {
                  const best = mfBoards.find((b) => b.level === MF_LEVEL[r.difficulty])?.best;
                  return (
                    <tr key={r.difficulty}>
                      <th scope="row">{DIFFICULTY_NAME[r.difficulty] ?? r.difficulty}</th>
                      <td className="num">{r.played}</td>
                      <td className="num">{r.won}</td>
                      <td className="num">{r.best_time_ms ? formatTime(r.best_time_ms) : "–"}</td>
                      <td className="num">{best ? fmt(best) : "–"}</td>
                      <td>
                        <RateBar won={r.won} played={r.played} label={DIFFICULTY_NAME[r.difficulty] ?? r.difficulty} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GameCard>
      </div>
    </div>
  );
}
