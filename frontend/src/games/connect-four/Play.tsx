import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { connectFour } from "../../api/client";
import type { CfCollection, CfMatch, Difficulty } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useAuth } from "../../store/auth";
import AiGame, { DIFFICULTY_LABEL } from "./AiGame";
import Chip from "./Chip";
import LocalGame from "./LocalGame";
import { RARITY_COLOR, SKINS } from "./skins";
import SpinWheel from "./SpinWheel";

type Mode = "ai" | "local";
type Screen =
  | { kind: "menu" }
  | { kind: "ai"; match: CfMatch }
  | { kind: "local"; bestOf: 3 | 5; skins: [string, string] }
  | { kind: "wheel" };

const DIFFICULTIES: { id: Difficulty; blurb: string }[] = [
  { id: "easy", blurb: "Warm-up. Mostly random." },
  { id: "medium", blurb: "Thinks a few moves ahead." },
  { id: "hard", blurb: "Sharp and patient." },
  { id: "impossible", blurb: "Perfect play. No undo. Good luck." },
];

function SkinPicker({
  label,
  value,
  owned,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  owned: Set<string>;
  disabled?: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="c4-skins">
      <legend>{label}</legend>
      {SKINS.map((s) => {
        const locked = !owned.has(s.id);
        const taken = s.id === disabled;
        return (
          <button
            key={s.id}
            type="button"
            className={`c4-skin${value === s.id ? " selected" : ""}`}
            style={{ borderColor: RARITY_COLOR[s.rarity] }}
            disabled={locked || taken}
            aria-pressed={value === s.id}
            onClick={() => {
              playSfx("click");
              onChange(s.id);
            }}
            title={locked ? `${s.name} (locked: win it on the wheel)` : taken ? `${s.name} (taken by the other player)` : s.name}
            aria-label={`${s.name}${locked ? ", locked" : ""}${taken ? ", taken" : ""}`}
          >
            <Chip skin={s.id} size={40} />
            {locked && <span className="c4-lock" aria-hidden="true">🔒</span>}
          </button>
        );
      })}
    </fieldset>
  );
}

export default function Play() {
  const username = useAuth((s) => s.user?.username ?? "Player 1");
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [mode, setMode] = useState<Mode>("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const [skin, setSkin] = useState("red");
  const [skin2, setSkin2] = useState("blue");
  const [collection, setCollection] = useState<CfCollection | null>(null);
  const [resume, setResume] = useState<CfMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    connectFour.skins().then(setCollection).catch(() => setCollection(null));
    connectFour.activeMatch().then(setResume).catch(() => setResume(null));
  }, []);

  const owned = new Set(
    collection ? collection.skins.filter((s) => s.owned).map((s) => s.id) : SKINS.filter((s) => s.free).map((s) => s.id),
  );
  const spins = collection?.spins_available ?? 0;

  async function startAi() {
    setStarting(true);
    setError(null);
    try {
      const m = await connectFour.createMatch(difficulty, bestOf, skin);
      playSfx("click");
      setResume(null);
      setScreen({ kind: "ai", match: m });
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start match");
    } finally {
      setStarting(false);
    }
  }

  function backToMenu() {
    setScreen({ kind: "menu" });
    connectFour.skins().then(setCollection).catch(() => {});
    connectFour.activeMatch().then(setResume).catch(() => setResume(null));
  }

  const header = (
    <div className="page-head">
      <div>
        <Link to="/" className="back-link">
          ← Arcade
        </Link>
        <h1 style={{ marginTop: 12 }}>
          Connect Four{" "}
          {screen.kind === "ai" && <span className="tag tag-blue">vs AI · {DIFFICULTY_LABEL[screen.match.difficulty]}</span>}
          {screen.kind === "local" && <span className="tag">2 players</span>}
        </h1>
        <p>Drop chips, line up four, outsmart your rival.</p>
      </div>
      <Link to="/leaderboard/connect-four" className="btn btn-blue btn-sm">
        🏆 Leaderboard
      </Link>
    </div>
  );

  if (screen.kind === "ai") {
    return (
      <>
        {header}
        <AiGame
          key={screen.match.id}
          initial={screen.match}
          onExit={backToMenu}
          onSpin={() => {
            connectFour.skins().then(setCollection).catch(() => {});
            setScreen({ kind: "wheel" });
          }}
          onRematch={(m) => setScreen({ kind: "ai", match: m })}
        />
      </>
    );
  }
  if (screen.kind === "local") {
    return (
      <>
        {header}
        <LocalGame bestOf={screen.bestOf} skins={screen.skins} names={[username, "Player 2"]} onExit={backToMenu} />
      </>
    );
  }
  if (screen.kind === "wheel") {
    return (
      <>
        {header}
        <SpinWheel collection={collection} onCollection={setCollection} onBack={backToMenu} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="c4-menu">
        {resume && (
          <div className="panel c4-resume">
            <span>
              Unfinished series vs <strong>{DIFFICULTY_LABEL[resume.difficulty]}</strong> AI ·{" "}
              {resume.user_wins}-{resume.ai_wins}
            </span>
            <button className="btn-green btn-sm" onClick={() => setScreen({ kind: "ai", match: resume })}>
              ▶ Resume
            </button>
          </div>
        )}

        <div className="panel c4-panel">
          <div className="segmented c4-modes" role="radiogroup" aria-label="Game mode">
            {(["ai", "local"] as Mode[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? "" : "btn-ghost"}
                onClick={() => setMode(m)}
              >
                {m === "ai" ? "🤖 vs AI" : "👥 vs Friend"}
              </button>
            ))}
          </div>

          {mode === "ai" && (
            <fieldset className="c4-diffs">
              <legend>Difficulty</legend>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`c4-diff diff-${d.id}${difficulty === d.id ? " selected" : ""}`}
                  aria-pressed={difficulty === d.id}
                  onClick={() => setDifficulty(d.id)}
                >
                  <strong>{DIFFICULTY_LABEL[d.id]}</strong>
                  <small>{d.blurb}</small>
                </button>
              ))}
            </fieldset>
          )}

          <div className="row-label">
            <span id="bestof-label">Series</span>
            <div className="segmented" role="radiogroup" aria-labelledby="bestof-label">
              {([3, 5] as const).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={bestOf === n}
                  className={`btn-sm${bestOf === n ? "" : " btn-ghost"}`}
                  onClick={() => setBestOf(n)}
                >
                  Best of {n}
                </button>
              ))}
            </div>
          </div>

          <SkinPicker
            label={mode === "ai" ? "Your chip" : `${username}'s chip`}
            value={skin}
            owned={owned}
            disabled={mode === "local" ? skin2 : undefined}
            onChange={setSkin}
          />
          {mode === "local" && (
            <SkinPicker label="Player 2's chip" value={skin2} owned={owned} disabled={skin} onChange={setSkin2} />
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <div className="game-controls">
            {mode === "ai" ? (
              <button className="btn-green" onClick={() => void startAi()} disabled={starting}>
                {starting ? "Starting…" : "▶ Start match"}
              </button>
            ) : (
              <button
                className="btn-green"
                onClick={() => {
                  playSfx("click");
                  setScreen({ kind: "local", bestOf, skins: [skin, skin2] });
                }}
              >
                ▶ Start match
              </button>
            )}
            <button className="btn" onClick={() => setScreen({ kind: "wheel" })}>
              🎡 Skins & spins {spins > 0 && <span className="tag">{spins}</span>}
            </button>
          </div>
          {resume && mode === "ai" && <p className="hint">Starting a new AI match forfeits your unfinished series.</p>}
          {mode === "ai" && (
            <p className="hint">
              Win a series to earn leaderboard points. Win without undo to earn a skin spin. Harder AI = more points and
              better spin odds.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
