import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { game2048 } from "../../api/client";
import type { G2048Finish, G2048Mode, G2048Run } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useWallet } from "../../store/wallet";
import { Game, replay } from "./engine";
import { MODE_INFO, clearPlayTime, loadMode, loadPlayTime, saveMode } from "./modes";
import Results from "./Results";
import Round from "./Round";
import BackButton from "../../components/BackButton";

type Screen =
  | { kind: "setup" }
  | { kind: "round"; run: G2048Run; game: Game }
  | { kind: "submitting" }
  | { kind: "results"; result: G2048Finish; playMs: number | null };

const fmt = (n: number) => n.toLocaleString();

/** Rebuild a saved game; null if the saved moves don't replay. */
function rebuild(run: G2048Run): Game | null {
  try {
    return replay(run.seed, run.mode, run.moves);
  } catch {
    return null;
  }
}

export default function Play() {
  const [screen, setScreen] = useState<Screen>({ kind: "setup" });
  const [mode, setMode] = useState<G2048Mode>(loadMode);
  const [active, setActive] = useState<G2048Run | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Your unfinished game, if any (shown on the setup screen).
  useEffect(() => {
    if (screen.kind !== "setup") return;
    let cancelled = false;
    game2048
      .active()
      .then((r) => !cancelled && setActive(r))
      .catch(() => !cancelled && setActive(null));
    return () => {
      cancelled = true;
    };
  }, [screen.kind]);

  function play(run: G2048Run) {
    const game = rebuild(run);
    if (!game) {
      setError("Your saved game couldn't be rebuilt. End it to start a new one.");
      return;
    }
    playSfx("click");
    setScreen({ kind: "round", run, game });
  }

  async function start(m: G2048Mode) {
    setStarting(true);
    setError(null);
    try {
      play(await game2048.start(m));
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start a game");
    } finally {
      setStarting(false);
    }
  }

  function done(result: G2048Finish, runId: string, playMs: number | null) {
    clearPlayTime(runId);
    playSfx(result.new_best ? "reward" : "win");
    setScreen({ kind: "results", result, playMs });
    useWallet.getState().celebrate(result.rewards);
  }

  /** Score a saved game without opening it. */
  async function endSaved(run: G2048Run) {
    setScreen({ kind: "submitting" });
    setError(null);
    try {
      const result = await game2048.finish(run.run_id, run.moves);
      done(result, run.run_id, loadPlayTime(run.run_id) || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the server could not score this game");
      setScreen({ kind: "setup" });
    }
  }

  const header = (
    <div className="page-head">
      <div>
        <BackButton />
        <h1 style={{ marginTop: 12 }}>
          2048{" "}
          {screen.kind === "round" && (
            <span className="tag tag-blue">
              {MODE_INFO[screen.run.mode].name} · {screen.game.size}×{screen.game.size}
            </span>
          )}
        </h1>
        <p>Slide, merge, reach 2048. Then keep going.</p>
      </div>
      <Link to="/leaderboard/2048" className="btn btn-blue btn-sm">
        🏆 Leaderboard
      </Link>
    </div>
  );

  if (screen.kind === "round") {
    const { run } = screen;
    return (
      <>
        {header}
        <Round
          key={run.run_id}
          run={run}
          game={screen.game}
          onDone={(result, playMs) => done(result, run.run_id, playMs)}
          onMenu={() => setScreen({ kind: "setup" })}
        />
      </>
    );
  }
  if (screen.kind === "submitting") {
    return (
      <>
        {header}
        <div className="panel notice">
          <div className="loading">The server is replaying your moves</div>
        </div>
      </>
    );
  }
  if (screen.kind === "results") {
    const again = screen.result.mode === "daily" ? null : () => void start(screen.result.mode);
    return (
      <>
        {header}
        <Results result={screen.result} playMs={screen.playMs} onAgain={again} onMenu={() => setScreen({ kind: "setup" })} />
      </>
    );
  }

  const saved = active ? rebuild(active) : null;
  return (
    <>
      {header}
      <div className="c4-menu">
        <div className="panel c4-panel">
          {active && (
            <div className="g2048-resume" role="region" aria-label="Unfinished game">
              <div>
                <strong>
                  {MODE_INFO[active.mode].icon} Unfinished {MODE_INFO[active.mode].name} game
                </strong>
                <small>
                  {saved
                    ? `Score ${fmt(saved.points())} · best tile ${fmt(saved.maxTile())} · ${fmt(saved.moves)} moves`
                    : "Saved on the server"}
                  . Kept for 24 hours after your last move.
                </small>
              </div>
              <div className="game-controls">
                <button className="btn-green btn-sm" onClick={() => play(active)} disabled={!saved}>
                  ▶ Continue
                </button>
                <button className="btn-ghost btn-sm" onClick={() => void endSaved(active)}>
                  End and score it
                </button>
              </div>
            </div>
          )}

          <fieldset className="wam-modes">
            <legend>Mode</legend>
            {(Object.keys(MODE_INFO) as G2048Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`wam-mode${mode === m ? " selected" : ""}`}
                aria-pressed={mode === m}
                onClick={() => {
                  playSfx("click");
                  setMode(m);
                  saveMode(m);
                }}
              >
                <span className="wam-mode-icon" aria-hidden="true">
                  {MODE_INFO[m].icon}
                </span>
                <strong>{MODE_INFO[m].name}</strong>
                <small>{MODE_INFO[m].blurb}</small>
              </button>
            ))}
          </fieldset>

          <p className="wam-hint">
            Slide with the <strong>arrow keys</strong>, <strong>WASD</strong> or a <strong>swipe</strong>. Equal tiles merge into one. Make{" "}
            <strong>2048</strong> for +30 coins, and <strong>4096</strong> for +80 more and a 50% token chance. Up to 3 undos (Z), none in the
            Daily. Your game is saved as you play.
          </p>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <div className="game-controls">
            <button className="btn-green" onClick={() => void start(mode)} disabled={starting || active === undefined || (!!active && !(mode === "daily" && active.mode === "daily"))}>
              {starting ? "Starting…" : `▶ Play ${MODE_INFO[mode].name}`}
            </button>
          </div>
          {active && !(mode === "daily" && active.mode === "daily") && (
            <p className="wam-hint">Continue or end your unfinished game to start a new one.</p>
          )}
        </div>
      </div>
    </>
  );
}
