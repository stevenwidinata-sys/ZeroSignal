import { useWallet } from "../store/wallet";

const fmt = (n: number) => n.toLocaleString();

/** Coins, tokens and level shown in the nav for signed-in players. */
export default function WalletChip() {
  const w = useWallet((s) => s.wallet);
  if (!w) return null;
  const pct = w.xp_for_next ? Math.min(100, (w.xp_into_level / w.xp_for_next) * 100) : 0;
  return (
    <div
      className="wallet-chip"
      aria-label={`Level ${w.level}, ${w.coins} coins, ${w.tokens} tokens`}
      title={`${fmt(w.xp_into_level)} / ${fmt(w.xp_for_next)} XP to level ${w.level + 1} · ${fmt(w.coins_today)} / ${fmt(w.daily_cap)} coins earned today`}
    >
      <span className="wallet-level">
        Lv {w.level}
        <span className="wallet-xp" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span>🪙 {fmt(w.coins)}</span>
      <span>🎟 {fmt(w.tokens)}</span>
    </div>
  );
}
