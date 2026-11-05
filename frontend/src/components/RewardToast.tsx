import { useEffect } from "react";
import { useWallet } from "../store/wallet";

const SHOW_MS = 4500;

/** Pop-up after a verified game: coins, tokens, XP and level-ups. */
export default function RewardToast() {
  const g = useWallet((s) => s.toast);
  const dismiss = useWallet((s) => s.dismiss);

  useEffect(() => {
    if (!g) return;
    const id = window.setTimeout(dismiss, SHOW_MS);
    return () => window.clearTimeout(id);
  }, [g, dismiss]);

  if (!g) return null;
  const leveled = g.level_after > g.level_before;

  return (
    <div className={`reward-toast${leveled ? " level-up" : ""}`} role="status" aria-live="polite">
      {leveled && <strong className="reward-level">⭐ LEVEL UP! Lv {g.level_after}</strong>}
      <div className="reward-items">
        {g.coins > 0 && <span>+{g.coins} 🪙</span>}
        {g.tokens > 0 && <span className="reward-token">+{g.tokens} 🎟 Lucky token!</span>}
        {g.xp > 0 && <span>+{g.xp} XP</span>}
      </div>
      {g.coins_capped > 0 && <small>Daily coin limit reached: {g.coins_capped} 🪙 held back. Come back tomorrow!</small>}
      <button className="icon-btn" onClick={dismiss} aria-label="Close">
        ✕
      </button>
    </div>
  );
}
