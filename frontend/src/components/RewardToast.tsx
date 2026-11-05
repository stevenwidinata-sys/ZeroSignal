import { useEffect } from "react";
import { Link } from "react-router-dom";
import Avatar from "../character/Avatar";
import { SLOTS, normalizeLoadout, unlockedBetween } from "../character/catalog";
import { useCharacter } from "../store/character";
import { useWallet } from "../store/wallet";

const SHOW_MS = 4500;
const LEVEL_UP_MS = 9000;
const HEAD_SLOTS = new Set(SLOTS.filter((s) => s.group === "body" || s.group === "head").map((s) => s.id));

/** Pop-up after a verified game: coins, tokens, XP and level-ups. */
export default function RewardToast() {
  const g = useWallet((s) => s.toast);
  const dismiss = useWallet((s) => s.dismiss);
  const view = useCharacter((s) => s.view);
  const reloadCharacter = useCharacter((s) => s.load);
  const base = normalizeLoadout(view?.loadout);

  useEffect(() => {
    if (!g) return;
    const leveled = g.level_after > g.level_before;
    // Level items become owned server-side; refresh the wardrobe's copy.
    if (leveled) void reloadCharacter();
    const id = window.setTimeout(dismiss, leveled ? LEVEL_UP_MS : SHOW_MS);
    return () => window.clearTimeout(id);
  }, [g, dismiss, reloadCharacter]);

  if (!g) return null;
  const leveled = g.level_after > g.level_before;
  const unlocked = leveled ? unlockedBetween(g.level_before, g.level_after) : [];

  return (
    <div className={`reward-toast${leveled ? " level-up" : ""}`} role="status" aria-live="polite">
      {leveled && <strong className="reward-level">⭐ LEVEL UP! Lv {g.level_after}</strong>}
      <div className="reward-items">
        {g.coins > 0 && <span>+{g.coins} 🪙</span>}
        {g.tokens > 0 && <span className="reward-token">+{g.tokens} 🎟 Lucky token!</span>}
        {g.xp > 0 && <span>+{g.xp} XP</span>}
      </div>
      {unlocked.length > 0 && (
        <div className="reward-unlocks">
          <small>New items unlocked:</small>
          <ul>
            {unlocked.map((it) => (
              <li key={it.id} title={it.name}>
                <Avatar loadout={{ ...base, [it.slot]: it.id }} size={40} crop={HEAD_SLOTS.has(it.slot) ? "head" : "full"} />
                <span>{it.name}</span>
              </li>
            ))}
          </ul>
          <Link to="/profile" onClick={dismiss}>
            Try them on →
          </Link>
        </div>
      )}
      {g.coins_capped > 0 && <small>Daily coin limit reached: {g.coins_capped} 🪙 held back. Come back tomorrow!</small>}
      <button className="icon-btn" onClick={dismiss} aria-label="Close">
        ✕
      </button>
    </div>
  );
}
