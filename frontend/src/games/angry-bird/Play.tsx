import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Bird, SubmitResponse } from "../../api/types";
import { useTheme } from "../../store/theme";
import { ABILITY_LABEL, FALLBACK_BIRDS } from "./birds";
import { GameEngine, MAX_SHOTS, type ShotRecord } from "./engine";
import { LEVEL_ONE } from "./levels";

const fmt = (n: number) => n.toLocaleString();

export default function Game() {
  const theme = useTheme((s) => s.theme);
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
      LEVEL_ONE,
      selectedRef.current,
      { onStatus: setStatus, onShotComplete: handleShotComplete },
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
      const res = await api.submitScore(LEVEL_ONE.id, shots);
      setResult(res);
      setStatus(`Round over! Server scored ${fmt(res.score)} points.`);
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
    newEngine();
  }

  const isBest = result !== null && result.score > 0 && result.score >= result.best_score;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">
            ← Arcade
          </Link>
          <h1 style={{ marginTop: 12 }}>
            Angry Bird <span className="tag tag-yellow">Level 1</span>
          </h1>
          <p>Smash the fort. Pop the pigs. Climb the board.</p>
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
              <button className="btn-green" onClick={playAgain}>
                ↻ Play again
              </button>
            )}
            {submitting && <button disabled>Scoring…</button>}
          </div>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          {result && (
            <div className="result-card">
              <h3>{isBest ? "★ New personal best!" : "Round complete"}</h3>
              <div className="score-big">{fmt(result.score)}</div>
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
                  <small>Your best</small>
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
                title={b.unlocked ? b.description : `Unlock at ${fmt(b.unlock_score)} pts`}
              >
                <span className="swatch" style={{ background: b.color }} />
                <span className="bird-info">
                  <strong>{b.name}</strong>
                  <small>{ABILITY_LABEL[b.ability]}</small>
                  {!b.unlocked && (
                    <small className="lock">🔒 {fmt(b.unlock_score)} pts</small>
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
