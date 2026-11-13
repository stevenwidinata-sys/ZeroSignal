import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { WeeklyPrize } from "../api/types";
import { findGame } from "../platform/registry";
import { playSfx } from "../platform/sound";
import { useAuth } from "../store/auth";
import { useWallet } from "../store/wallet";

const MEDAL = ["", "🥇", "🥈", "🥉"];

/** "Angry Bird" or "Whack-a-Mole · ⚡ Frenzy". */
export function prizeBoardName(p: Pick<WeeklyPrize, "game_id" | "level">): string {
  const g = findGame(p.game_id);
  const title = g?.meta.title ?? p.game_id;
  const board = p.level === null ? undefined : g?.meta.boards?.find((b) => b.level === p.level)?.label;
  return board ? `${title} · ${board}` : title;
}

/** Banner for last week's top-3 places that haven't been claimed yet. */
export default function WeeklyPrizes() {
  const user = useAuth((s) => s.user);
  const [prizes, setPrizes] = useState<WeeklyPrize[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.is_guest) {
      setPrizes([]);
      return;
    }
    let cancelled = false;
    api
      .weeklyPrizes()
      .then((v) => !cancelled && setPrizes(v.prizes.filter((p) => !p.claimed)))
      .catch(() => !cancelled && setPrizes([]));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (prizes.length === 0) return null;
  const coins = prizes.reduce((n, p) => n + p.coins, 0);
  const tokens = prizes.reduce((n, p) => n + p.tokens, 0);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.claimWeeklyPrizes();
      playSfx("reward");
      useWallet.getState().celebrate(res.rewards);
      setPrizes([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not claim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel weekly-prizes" aria-label="Weekly prizes">
      <div>
        <h2>🏆 Last week you made the podium!</h2>
        <ul>
          {prizes.map((p) => (
            <li key={`${p.game_id}:${p.level ?? 0}`}>
              <span aria-hidden="true">{MEDAL[p.rank]}</span> #{p.rank} in <strong>{prizeBoardName(p)}</strong>
            </li>
          ))}
        </ul>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      <button className="btn-green" onClick={() => void claim()} disabled={busy}>
        {busy ? "Claiming…" : `Claim ${coins} 🪙${tokens ? ` + ${tokens} token${tokens > 1 ? "s" : ""}` : ""}`}
      </button>
    </section>
  );
}
