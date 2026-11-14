import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AbProgress } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { LEVELS, WORLDS } from "./levels";

const fmt = (n: number) => n.toLocaleString();

export function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span className="ab-stars" aria-label={label ?? `${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "on" : ""} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

/** Pick a level: 12 levels in 3 worlds, each with your stars and best. */
export default function LevelSelect({ onPlay }: { onPlay: (levelId: number) => void }) {
  const [progress, setProgress] = useState<AbProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .angryBirdLevels()
      .then(setProgress)
      .catch((e) => setError(e instanceof Error ? e.message : "could not load your levels"));
  }, []);

  const view = (id: number) => progress?.levels.find((l) => l.id === id);
  const totalStars = progress?.levels.reduce((n, l) => n + l.stars, 0) ?? 0;

  return (
    <div className="ab-levels">
      <div className="ab-summary">
        <span>
          ⭐ <strong>{totalStars}</strong> / {LEVELS.length * 3} stars
        </span>
        <span>
          🏆 Campaign score <strong>{fmt(progress?.campaign_score ?? 0)}</strong>
          <small> (best of each level added up; unlocks new birds)</small>
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {WORLDS.map((w) => (
        <section key={w.id} className="ab-world" style={{ "--world-a": w.sky[0], "--world-b": w.ground } as React.CSSProperties}>
          <h2 className="section-title">
            {w.icon} World {w.id}: {w.name}
          </h2>
          <div className="ab-level-grid">
            {LEVELS.filter((l) => l.world === w.id).map((l) => {
              const v = view(l.id);
              const unlocked = v?.unlocked ?? l.id === 1;
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`ab-level${unlocked ? "" : " locked"}${v?.cleared ? " cleared" : ""}`}
                  disabled={!unlocked || !progress}
                  onClick={() => {
                    playSfx("click");
                    onPlay(l.id);
                  }}
                  aria-label={`Level ${l.id}, ${l.name}${unlocked ? "" : ", locked"}`}
                >
                  <span className="ab-level-num">{unlocked ? l.id : "🔒"}</span>
                  <strong>{l.name}</strong>
                  <Stars n={v?.stars ?? 0} />
                  <small>
                    {unlocked
                      ? v?.best
                        ? `Best ${fmt(v.best)}`
                        : `${l.pigs.length} pigs`
                      : `Clear level ${l.id - 1} first`}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="wam-hint">
        Destroy every pig to clear a level (1 ★) and unlock the next one. Smash more blocks for 2 ★ and 3 ★. The first clear of each
        level gives +50 XP.
      </p>
    </div>
  );
}
