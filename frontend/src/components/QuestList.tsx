import { useEffect } from "react";
import { canReroll, useQuests } from "../store/quests";

const fmt = (n: number) => n.toLocaleString();

/** Today's 3 quests with progress bars, Claim and Reroll buttons. */
export default function QuestList() {
  const { view, busy, error, load, claim, reroll } = useQuests();

  useEffect(() => {
    void load();
  }, [load]);

  if (!view) return <p className="muted">Loading quests…</p>;
  const claimedAll = view.quests.every((q) => q.claimed);
  const resetAt = new Date(view.next_reset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="quest-list">
      <ul>
        {view.quests.map((q) => {
          const pct = Math.min(100, (q.progress / q.target) * 100);
          return (
            <li key={q.slot} className={`quest${q.done ? " done" : ""}${q.claimed ? " claimed" : ""}`}>
              <div className="quest-main">
                <strong>{q.title}</strong>
                <div
                  className="quest-bar"
                  role="progressbar"
                  aria-label={q.title}
                  aria-valuemin={0}
                  aria-valuemax={q.target}
                  aria-valuenow={q.progress}
                >
                  <span style={{ width: `${pct}%` }} />
                </div>
                <small>
                  {fmt(q.progress)} / {fmt(q.target)} · {q.coins} 🪙 + {q.xp} XP
                </small>
              </div>
              <div className="quest-actions">
                {q.claimed ? (
                  <span className="quest-check" aria-label="claimed">
                    ✓
                  </span>
                ) : q.done ? (
                  <button className="btn-green btn-sm" disabled={busy !== null} onClick={() => void claim(q.slot)}>
                    Claim
                  </button>
                ) : (
                  canReroll(view, q.slot) && (
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busy !== null}
                      onClick={() => void reroll(q.slot)}
                      title="Swap this quest for a new one (once per day)"
                    >
                      🎲 Reroll
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="quest-foot">
        {view.bonus_claimed || claimedAll
          ? `All done! New quests at ${resetAt}.`
          : `Claim all 3 for a bonus +${view.bonus_tokens} 🎟 · new quests at ${resetAt}`}
        {!view.reroll_available && " · reroll used"}
      </p>
    </div>
  );
}
