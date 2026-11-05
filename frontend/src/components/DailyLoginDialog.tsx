import { useEffect, useRef } from "react";
import { shouldPrompt, useDailyLogin } from "../store/dailyLogin";

/** Pop-up with the 7-day login streak and a Claim button. */
export default function DailyLoginDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const { status, dismissed, claiming, error, claim, dismiss } = useDailyLogin();
  const open = shouldPrompt(status, dismissed);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="settings-dialog daily-dialog"
      aria-labelledby="daily-title"
      onClose={dismiss}
      onClick={(e) => e.target === ref.current && dismiss()}
    >
      {status && (
        <div className="settings-body">
          <div className="settings-head">
            <h2 id="daily-title">🎁 Daily reward</h2>
            <button className="icon-btn" onClick={dismiss} aria-label="Close daily reward">
              ✕
            </button>
          </div>
          <p className="muted">Log in every day to grow your streak. Miss a day and it starts over.</p>
          <ol className="daily-days">
            {status.rewards.map((r) => {
              const state =
                r.day < status.streak_day ? "done" : r.day === status.streak_day ? "today" : "later";
              return (
                <li key={r.day} className={`daily-day ${state}`} aria-current={state === "today" ? "date" : undefined}>
                  <small>Day {r.day}</small>
                  <strong>{r.coins} 🪙</strong>
                  {r.tokens > 0 && <span>+{r.tokens} 🎟</span>}
                  {state === "done" && <span aria-label="claimed">✓</span>}
                </li>
              );
            })}
          </ol>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="settings-foot">
            <button className="btn-ghost btn-sm" onClick={dismiss}>
              Later
            </button>
            <button className="btn-green" onClick={() => void claim()} disabled={claiming}>
              {claiming ? "Claiming…" : `Claim day ${status.streak_day}`}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
