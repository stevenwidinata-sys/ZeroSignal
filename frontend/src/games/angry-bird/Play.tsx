import { useEffect, useRef, useState } from "react";
import { useGuardWhile } from "../../platform/leaveGuard";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Bird, SubmitResponse } from "../../api/types";
import { useTheme } from "../../store/theme";
import { useWallet } from "../../store/wallet";
import { ABILITY_LABEL, FALLBACK_BIRDS } from "./birds";
import { GameEngine, MAX_SHOTS, type ShotRecord } from "./engine";
import { LEVELS, findLevel, findWorld, type Level } from "./levels";
import LevelSelect, { Stars } from "./LevelSelect";
import { SaveScorePrompt } from "../../components/Guest";
import BackButton from "../../components/BackButton";

const fmt = (n: number) => n.toLocaleString();

/** Pick a level, then play it. */
export default function Play() {
  const [levelId, setLevelId] = useState<number | null>(null);
  if (levelId === null) {
    return (
      <>
        <div className="page-head">
          <div>
            <BackButton />
            <h1 style={{ marginTop: 12 }}>Angry Bird</h1>
            <p>Smash the fort. Pop the pigs. Clear all 12 levels.</p>
          </div>
          <Link to="/leaderboard/angry-bird" className="btn btn-blue btn-sm">
            🏆 Leaderboard
          </Link>
        </div>
        <LevelSelect onPlay={setLevelId} />
      </>
    );
  }
  return <Game key={levelId} level={findLevel(levelId)} onLevels={() => setLevelId(null)} onPlay={setLevelId} />;
}

function Game({ level, onLevels, onPlay }: { level: Level; onLevels: () => void; onPlay: (id: number) => void }) {
  // The canvas has a dark and a light sky; every theme picks one.
  const theme = useTheme((s) => s.scheme);
  const themeRef = useRef(theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [birds, setBirds] = useState<Bird[]>(FALLBACK_BIRDS);
  const [selected, setSelected] = useState<Bird>(FALLBACK_BIRDS[0]);
  const selectedRef = useRef(selected);
  const [status, setStatus] = useState("Loading…");
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  const [shotFired, setShotFired] = useState(false);
  useGuardWhile("angry-bird", shotFired && !roundOver);
  const [error, setError] = useState<string | null>(null);

  // Load bird catalog (with unlock state) from the server.
  useEffect(() => {
    api
      .birds()
      .then((bs) => {
        setBirds(bs);
        setSelected(bs.find((b) => b.unlocked) ?? bs[0]);
      })
      .catch(() => setBirds(FALLBACK_BIRDS));
  }, []);

  function newEngine() {
    if (!canvasRef.current) return;
    engineRef.current?.destroy();
    const engine = new GameEngine(
      canvasRef.current,
      level,
      selectedRef.current,
      {
        onStatus: (s) => {
          setStatus(s);
          setShotFired((engineRef.current?.shotsTaken() ?? 0) > 0);
        },
        onShotComplete: handleShotComplete,
      },
      themeRef.current,
    );
    engineRef.current = engine;
    engine.start();
  }

  useEffect(() => {
    newEngine();
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    engineRef.current?.setBird(selected);
  }, [selected]);

  useEffect(() => {
    themeRef.current = theme;
    engineRef.current?.setTheme(theme);
  }, [theme]);

  async function handleShotComplete(shots: ShotRecord[]) {
    setRoundOver(true);
    setSubmitting(true);
    setError(null);
    setStatus("Round over! Server is verifying your shots…");
    try {
      const res = await api.submitScore(level.id, shots);
      setResult(res);
      setStatus(`Round over! Server scored ${fmt(res.score)} points.`);
      useWallet.getState().celebrate(res.rewards);
      setBirds(await api.birds());
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to submit score");
    } finally {
      setSubmitting(false);
    }
  }

  function finishNow() {
    if (!engineRef.current || engineRef.current.shotsTaken() === 0) {
      setStatus("Launch at least one bird before finishing.");
      return;
    }
    engineRef.current.finishRound();
  }

  function playAgain() {
    setResult(null);
    setError(null);
    setRoundOver(false);
    setShotFired(false);
    newEngine();
  }

  const isBest = result !== null && result.score > 0 && result.score >= result.best_score;

  return (
    <>
      <div className="page-head">
        <div>
          <BackButton />
          <h1 style={{ marginTop: 12 }}>
            Angry Bird{" "}
            <span className="tag tag-yellow">
              {findWorld(level.world).icon} Level {level.id}: {level.name}
            </span>
          </h1>
          <p>Destroy every pig to clear the level. Smash blocks for more stars.</p>
        </div>
        <Link to="/leaderboard/angry-bird" className="btn btn-blue btn-sm">
          🏆 Leaderboard
        </Link>
      </div>

      <div className="game-layout">
        <div className="game-main">
          <div className="status-bar" role="status" aria-live="polite">
            {status}
          </div>

          <div className="game-frame">
            <canvas
              ref={canvasRef}
              className="game-canvas"
              aria-label="Angry Bird game. Drag to pull the slingshot, release to launch."
            />
          </div>

          <div className="game-controls">
            {!roundOver && (
              <button className="btn-ghost" onClick={finishNow} disabled={submitting}>
                ■ Finish round
              </button>
            )}
            {roundOver && !submitting && (
              <button className={result?.cleared ? "btn-ghost" : "btn-green"} onClick={playAgain}>
                ↻ Retry level
              </button>
            )}
            {roundOver && !submitting && result && result.unlocked_up_to > level.id && level.id < LEVELS.length && (
              <button className="btn-green" onClick={() => onPlay(level.id + 1)}>
                ▶ Next level
              </button>
            )}
            <button className="btn-ghost" onClick={onLevels} disabled={submitting}>
              ☰ Levels
            </button>
            {submitting && <button disabled>Scoring…</button>}
          </div>
          {roundOver && !submitting && <SaveScorePrompt />}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          {result && (
            <div className="result-card">
              <h3>
                {result.cleared ? (result.first_clear ? "🎉 Level cleared!" : "Level cleared!") : "Some pigs survived"}
                {isBest && " · ★ New best"}
              </h3>
              <Stars n={result.stars} />
              <div className="score-big">{fmt(result.score)}</div>
              {!result.cleared && <p className="wam-hint">Destroy every pig to clear the level and unlock the next one.</p>}
              {result.first_clear && <p className="unlock">+50 XP for your first clear of this level.</p>}
              <div className="stat-row">
                <div className="stat">
                  <small>Pigs popped</small>
                  <strong>{result.pigs_destroyed}</strong>
                </div>
                <div className="stat">
                  <small>Blocks smashed</small>
                  <strong>{result.blocks_destroyed}</strong>
                </div>
                <div className="stat">
                  <small>Level best</small>
                  <strong>{fmt(result.best_score)}</strong>
                </div>
              </div>
              {result.newly_unlocked.length > 0 && (
                <p className="unlock">
                  🎉 New bird unlocked:{" "}
                  {result.newly_unlocked
                    .map((id) => birds.find((b) => b.id === id)?.name ?? id)
                    .join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="bird-picker" aria-label="Bird selection">
          <h3>Pick your bird</h3>
          <div className="bird-list">
            {birds.map((b) => (
              <button
                key={b.id}
                className={`bird-chip ${selected.id === b.id ? "selected" : ""} ${
                  b.unlocked ? "" : "locked"
                }`}
                onClick={() => b.unlocked && setSelected(b)}
                disabled={!b.unlocked}
                aria-pressed={selected.id === b.id}
                title={b.unlocked ? b.description : `Unlocks at a ${fmt(b.unlock_score)} campaign score`}
              >
                <span className="swatch" style={{ background: b.color }} />
                <span className="bird-info">
                  <strong>{b.name}</strong>
                  <small>{ABILITY_LABEL[b.ability]}</small>
                  {!b.unlocked && (
                    <small className="lock">🔒 {fmt(b.unlock_score)} campaign</small>
                  )}
                </span>
              </button>
            ))}
          </div>
          <p className="hint">
            <strong>How to play:</strong> drag anywhere on the game to pull the
            slingshot. The dotted path and power bar preview your shot. Release
            to fire, <kbd>Esc</kbd> to cancel, tap mid-flight for abilities.{" "}
            {MAX_SHOTS} birds per round.
          </p>
        </aside>
      </div>
    </>
  );
}
