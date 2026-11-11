import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { whackAMole } from "../../api/client";
import type { WamFinish, WamMode, WamStart, WamTap } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useWallet } from "../../store/wallet";
import { Game } from "./engine";
import Mole from "./Mole";
import Results from "./Results";
import Round from "./Round";

type Screen =
  | { kind: "setup" }
  | { kind: "round"; run: WamStart; game: Game }
  | { kind: "submitting" }
  | { kind: "results"; result: WamFinish; grid: 3 | 4 };

export const MODE_INFO: Record<WamMode, { icon: string; name: string; blurb: string }> = {
  classic: { icon: "⏱️", name: "Classic", blurb: "60 seconds. Moles speed up as the clock runs down." },
  frenzy: { icon: "⚡", name: "Frenzy", blurb: "30 seconds of chaos. Faster moles, more at once." },
  survival: { icon: "♥", name: "Survival", blurb: "No clock. 3 lives: every mole that escapes costs one." },
  daily: { icon: "📅", name: "Daily Challenge", blurb: "Same moles for everyone today. One leaderboard, one day." },
};

const PREFS_KEY = "zerosignal_wam_prefs";

interface Prefs {
  mode: WamMode;
  grid: 3 | 4;
  showKeys: boolean;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { mode: "classic", grid: 3, showKeys: false };
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!v) return fallback;
    return {
      mode: v.mode && v.mode in MODE_INFO ? v.mode : fallback.mode,
      grid: v.grid === 4 ? 4 : 3,
      showKeys: v.showKeys === true,
    };
  } catch {
    return fallback;
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage may be blocked */
  }
}

const LEGEND: { kind: "normal" | "ninja" | "helmet" | "golden" | "bomb" | "ice"; text: string }[] = [
  { kind: "normal", text: "100" },
  { kind: "ninja", text: "150 · quick!" },
  { kind: "helmet", text: "250 · 2 hits" },
  { kind: "golden", text: "500 · rare" },
  { kind: "ice", text: "+3s / +1 ♥" },
  { kind: "bomb", text: "Don't hit!" },
];

export default function Play() {
  const [screen, setScreen] = useState<Screen>({ kind: "setup" });
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const run = await whackAMole.start(prefs.mode, prefs.grid);
      playSfx("click");
      setScreen({ kind: "round", run, game: new Game(run.seed, run.mode, run.grid) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start a round");
    } finally {
      setStarting(false);
    }
  }

  const finish = useCallback(async (runId: string, grid: 3 | 4, taps: WamTap[]) => {
    setScreen({ kind: "submitting" });
    try {
      const result = await whackAMole.finish(runId, taps);
      playSfx(result.new_best ? "reward" : "win");
      setScreen({ kind: "results", result, grid });
      useWallet.getState().celebrate(result.rewards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "the server could not score this round");
      setScreen({ kind: "setup" });
    }
  }, []);

  const header = (
    <div className="page-head">
      <div>
        <Link to="/" className="back-link">
          ← Arcade
        </Link>
        <h1 style={{ marginTop: 12 }}>
          Whack-a-Mole{" "}
          {screen.kind === "round" && (
            <span className="tag tag-yellow">
              {MODE_INFO[screen.run.mode].name} · {screen.run.grid}×{screen.run.grid}
            </span>
          )}
        </h1>
        <p>Fast hands win. Bonk every mole before it hides.</p>
      </div>
      <Link to="/leaderboard/whack-a-mole" className="btn btn-blue btn-sm">
        🏆 Leaderboard
      </Link>
    </div>
  );

  if (screen.kind === "round") {
    const { run, game } = screen;
    return (
      <>
        {header}
        <Round
          key={run.run_id}
          game={game}
          showKeys={prefs.showKeys}
          onDone={(taps) => void finish(run.run_id, run.grid, taps)}
          onQuit={() => setScreen({ kind: "setup" })}
        />
      </>
    );
  }
  if (screen.kind === "submitting") {
    return (
      <>
        {header}
        <div className="panel notice">
          <div className="loading">The server is replaying your taps</div>
        </div>
      </>
    );
  }
  if (screen.kind === "results") {
    return (
      <>
        {header}
        <Results result={screen.result} grid={screen.grid} onAgain={() => void start()} onMenu={() => setScreen({ kind: "setup" })} />
      </>
    );
  }

  const daily = prefs.mode === "daily";
  return (
    <>
      {header}
      <div className="c4-menu">
        <div className="panel c4-panel">
          <fieldset className="wam-modes">
            <legend>Mode</legend>
            {(Object.keys(MODE_INFO) as WamMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`wam-mode${prefs.mode === m ? " selected" : ""}`}
                aria-pressed={prefs.mode === m}
                onClick={() => {
                  playSfx("click");
                  update({ mode: m });
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

          <div className="row-label">
            <span id="wam-grid">
              Board size
              <small>{daily ? "The Daily Challenge is always 3×3." : "4×4 is harder and pays ×1.2 points."}</small>
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="wam-grid">
              {([3, 4] as const).map((g) => (
                <button
                  key={g}
                  role="radio"
                  aria-checked={(daily ? 3 : prefs.grid) === g}
                  disabled={daily}
                  className={`btn-sm${(daily ? 3 : prefs.grid) === g ? "" : " btn-ghost"}`}
                  onClick={() => update({ grid: g })}
                >
                  {g}×{g}
                </button>
              ))}
            </div>
          </div>

          <label className="row-label">
            <span>
              Show keyboard keys
              <small>{prefs.grid === 4 && !daily ? "1234 / QWER / ASDF / ZXCV" : "Numpad 7–9 / 4–6 / 1–3, or QWE / ASD / ZXC"}</small>
            </span>
            <input type="checkbox" className="switch" checked={prefs.showKeys} onChange={(e) => update({ showKeys: e.target.checked })} />
          </label>

          <fieldset className="wam-legend">
            <legend>Who's who</legend>
            {LEGEND.map((l) => (
              <div key={l.kind}>
                <Mole kind={l.kind} size={40} />
                <small>{l.text}</small>
              </div>
            ))}
          </fieldset>
          <p className="wam-hint">
            5 hits in a row = ×1.5. <strong>10 in a row = FEVER ×3.</strong> A missed tap, a bomb or an escaped mole ends the combo.
          </p>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <div className="game-controls">
            <button className="btn-green" onClick={() => void start()} disabled={starting}>
              {starting ? "Starting…" : `▶ Play ${MODE_INFO[prefs.mode].name}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
