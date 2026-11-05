import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ticTacToe } from "../../api/client";
import type { TttCollection, TttDifficulty, TttMatch } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useAuth } from "../../store/auth";
import { usePhoto } from "../../store/photo";
import AiGame, { DIFFICULTY_LABEL } from "./AiGame";
import Collection, { BoardSwatch } from "./Collection";
import { BOARDS, FACES, opponentFace } from "./items";
import LocalGame from "./LocalGame";
import PhotoCapture from "./PhotoCapture";
import Piece from "./Piece";

type Mode = "ai" | "local";
type Screen =
  | { kind: "menu" }
  | { kind: "ai"; match: TttMatch }
  | { kind: "local"; bestOf: 3 | 5; faces: [string, string]; board: string }
  | { kind: "collection" };

const DIFFS: { id: TttDifficulty; blurb: string }[] = [
  { id: "easy", blurb: "Warm-up. Mostly random." },
  { id: "medium", blurb: "Blocks you, but slips up." },
  { id: "hard", blurb: "Perfect play. Unbeatable. Survive it!" },
];

function FacePicker({
  label,
  value,
  owned,
  taken,
  hasPhoto,
  onChange,
  onAddPhoto,
}: {
  label: string;
  value: string;
  owned: Set<string>;
  taken?: string;
  hasPhoto: boolean;
  onChange: (id: string) => void;
  onAddPhoto: () => void;
}) {
  return (
    <fieldset className="c4-skins">
      <legend>{label}</legend>
      {FACES.map((f) => {
        const locked = !owned.has(f.id);
        const isTaken = f.id === taken;
        const needsPhoto = f.id === "photo" && !hasPhoto;
        return (
          <button
            key={f.id}
            type="button"
            className={`c4-skin${value === f.id ? " selected" : ""}`}
            disabled={locked || isTaken}
            aria-pressed={value === f.id}
            title={locked ? `${f.name} (locked)` : isTaken ? `${f.name} (taken)` : needsPhoto ? "Add your photo" : f.name}
            aria-label={`${f.name}${locked ? ", locked" : ""}`}
            onClick={() => {
              playSfx("click");
              if (needsPhoto) onAddPhoto();
              else onChange(f.id);
            }}
          >
            <Piece face={f.id} size={40} />
            {locked && (
              <span className="c4-lock" aria-hidden="true">
                🔒
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}

export default function Play() {
  const username = useAuth((s) => s.user?.username ?? "Player 1");
  const photoUrl = usePhoto((s) => s.url);
  const photoLoaded = usePhoto((s) => s.loaded);
  const loadPhoto = usePhoto((s) => s.load);
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [mode, setMode] = useState<Mode>("ai");
  const [difficulty, setDifficulty] = useState<TttDifficulty>("medium");
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const [face, setFace] = useState("x");
  const [face2, setFace2] = useState("o");
  const [board, setBoard] = useState("classic");
  const [collection, setCollection] = useState<TttCollection | null>(null);
  const [resume, setResume] = useState<TttMatch | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  function refresh() {
    ticTacToe.collection().then(setCollection).catch(() => setCollection(null));
    ticTacToe.activeMatch().then(setResume).catch(() => setResume(null));
  }

  useEffect(() => {
    refresh();
    if (!photoLoaded) void loadPhoto();
  }, [photoLoaded, loadPhoto]);

  const owned = new Set(
    collection ? collection.faces.filter((f) => f.owned).map((f) => f.id) : FACES.filter((f) => f.price === null).map((f) => f.id),
  );
  const ownedBoards = new Set(
    collection ? collection.boards.filter((b) => b.owned).map((b) => b.id) : BOARDS.filter((b) => b.price === null).map((b) => b.id),
  );
  const hasPhoto = !!photoUrl;

  async function startAi() {
    setStarting(true);
    setError(null);
    try {
      const m = await ticTacToe.createMatch(difficulty, bestOf, face, board);
      playSfx("click");
      setResume(null);
      setScreen({ kind: "ai", match: m });
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not start");
    } finally {
      setStarting(false);
    }
  }

  function back() {
    setScreen({ kind: "menu" });
    refresh();
  }

  const header = (
    <div className="page-head">
      <div>
        <Link to="/" className="back-link">
          ← Arcade
        </Link>
        <h1 style={{ marginTop: 12 }}>
          Tic-Tac-Toe{" "}
          {screen.kind === "ai" && <span className="tag tag-blue">vs AI · {DIFFICULTY_LABEL[screen.match.difficulty]}</span>}
          {screen.kind === "local" && <span className="tag">2 players</span>}
        </h1>
        <p>Three in a row. Simple to learn, hard to master.</p>
      </div>
      <Link to="/leaderboard/tic-tac-toe" className="btn btn-blue btn-sm">
        🏆 Leaderboard
      </Link>
    </div>
  );

  const photoDialog = <PhotoCapture open={photoOpen} onClose={() => setPhotoOpen(false)} />;

  if (screen.kind === "ai")
    return (
      <>
        {header}
        <AiGame
          key={screen.match.id}
          initial={screen.match}
          onExit={back}
          onSpin={() => {
            refresh();
            setScreen({ kind: "collection" });
          }}
          onRematch={(m) => setScreen({ kind: "ai", match: m })}
        />
      </>
    );
  if (screen.kind === "local")
    return (
      <>
        {header}
        <LocalGame bestOf={screen.bestOf} faces={screen.faces} board={screen.board} names={[username, "Player 2"]} onExit={back} />
      </>
    );
  if (screen.kind === "collection")
    return (
      <>
        {header}
        <Collection collection={collection} onCollection={setCollection} onBack={back} />
      </>
    );

  return (
    <>
      {header}
      {photoDialog}
      <div className="c4-menu">
        {resume && (
          <div className="panel c4-resume">
            <span>
              Unfinished series vs <strong>{DIFFICULTY_LABEL[resume.difficulty]}</strong> AI · {resume.user_wins}-{resume.ai_wins}
              {resume.draws ? ` (${resume.draws} draws)` : ""}
            </span>
            <button className="btn-green btn-sm" onClick={() => setScreen({ kind: "ai", match: resume })}>
              ▶ Resume
            </button>
          </div>
        )}

        <div className="panel c4-panel">
          <div className="segmented c4-modes" role="radiogroup" aria-label="Game mode">
            {(["ai", "local"] as Mode[]).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "" : "btn-ghost"} onClick={() => setMode(m)}>
                {m === "ai" ? "🤖 vs AI" : "👥 vs Friend"}
              </button>
            ))}
          </div>

          {mode === "ai" && (
            <fieldset className="c4-diffs">
              <legend>Difficulty</legend>
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`c4-diff diff-${d.id === "hard" ? "impossible" : d.id}${difficulty === d.id ? " selected" : ""}`}
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
            <span id="ttt-bestof">Series</span>
            <div className="segmented" role="radiogroup" aria-labelledby="ttt-bestof">
              {([3, 5] as const).map((n) => (
                <button key={n} role="radio" aria-checked={bestOf === n} className={`btn-sm${bestOf === n ? "" : " btn-ghost"}`} onClick={() => setBestOf(n)}>
                  Best of {n}
                </button>
              ))}
            </div>
          </div>

          <FacePicker
            label={mode === "ai" ? "Your face" : `${username}'s face`}
            value={face}
            owned={owned}
            taken={mode === "local" ? face2 : undefined}
            hasPhoto={hasPhoto}
            onChange={setFace}
            onAddPhoto={() => setPhotoOpen(true)}
          />
          {mode === "local" && (
            <FacePicker
              label="Player 2's face"
              value={face2}
              owned={owned}
              taken={face}
              hasPhoto={hasPhoto}
              onChange={setFace2}
              onAddPhoto={() => setPhotoOpen(true)}
            />
          )}
          <button className="btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => setPhotoOpen(true)}>
            📷 {hasPhoto ? "Change my photo" : "Add my photo as a face"}
          </button>

          <fieldset className="c4-skins">
            <legend>Board</legend>
            {BOARDS.map((b) => {
              const locked = !ownedBoards.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`c4-skin${board === b.id ? " selected" : ""}`}
                  disabled={locked}
                  aria-pressed={board === b.id}
                  title={locked ? `${b.name} (locked)` : b.name}
                  aria-label={`${b.name}${locked ? ", locked" : ""}`}
                  onClick={() => setBoard(b.id)}
                >
                  <BoardSwatch id={b.id} size={40} />
                  {locked && (
                    <span className="c4-lock" aria-hidden="true">
                      🔒
                    </span>
                  )}
                </button>
              );
            })}
          </fieldset>

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
                  setScreen({ kind: "local", bestOf, faces: [face, face2 === face ? opponentFace(face) : face2], board });
                }}
              >
                ▶ Start match
              </button>
            )}
            <button className="btn" onClick={() => setScreen({ kind: "collection" })}>
              🎡 Boards & faces {collection && collection.spins_available > 0 && <span className="tag">{collection.spins_available}</span>}
            </button>
          </div>
          {resume && mode === "ai" && <p className="hint">Starting a new AI match forfeits your unfinished series.</p>}
          {mode === "ai" && (
            <p className="hint">
              Win a series for coins, XP and a reward spin (no undo). Hard can't be beaten, so a drawn Hard series also pays.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
