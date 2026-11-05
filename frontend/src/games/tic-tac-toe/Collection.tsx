import { useEffect, useRef, useState } from "react";
import { ticTacToe } from "../../api/client";
import type { TttCollection, TttItemView } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useCharacter } from "../../store/character";
import { useSettings } from "../../store/settings";
import { useWallet } from "../../store/wallet";
import { BOARDS, FACES, findBoard, findByKey } from "./items";
import Piece from "./Piece";

const RARITY_COLOR = { common: "#a9b1d6", rare: "#3a86ff", epic: "#9b5de5", legendary: "#ffd23f" } as const;
const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" } as const;
const fmt = (n: number) => n.toLocaleString();

function BoardSwatch({ id, size = 56 }: { id: string; size?: number }) {
  const a = findBoard(id).art;
  return (
    <span
      className="ttt-swatch"
      style={{ width: size, height: size, background: a.line, boxShadow: a.glow ? `0 0 10px ${a.glow}` : undefined }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} style={{ background: a.cell }} />
      ))}
    </span>
  );
}

interface Props {
  collection: TttCollection | null;
  onCollection: (c: TttCollection) => void;
  onBack: () => void;
}

/** Boards + faces: buy with coins, or spend a reward spin. */
export default function Collection({ collection, onCollection, onBack }: Props) {
  const light = useSettings((s) => s.lightGraphics);
  const coins = useWallet((s) => s.wallet?.coins ?? 0);
  const refreshWallet = useWallet((s) => s.refresh);
  const loadCharacter = useCharacter((s) => s.load);
  const [reel, setReel] = useState<{ key: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    void loadCharacter();
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, [loadCharacter]);

  const wait = (ms: number) => new Promise<void>((r) => timers.current.push(window.setTimeout(r, ms)));
  const spins = collection?.spins_available ?? 0;
  const paidKeys = [...BOARDS.filter((b) => b.price).map((b) => `board:${b.id}`), ...FACES.filter((f) => f.price).map((f) => `face:${f.id}`)];

  async function buy(kind: "board" | "face", it: TttItemView) {
    setBusy(true);
    setError(null);
    try {
      onCollection(await ticTacToe.buy(kind, it.id));
      void refreshWallet();
      playSfx("reward");
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not buy");
    } finally {
      setBusy(false);
    }
  }

  async function spin() {
    setBusy(true);
    setError(null);
    try {
      const res = await ticTacToe.spin();
      for (let i = 0; i < res.rolls.length; i++) {
        const steps = light ? 3 : 16;
        for (let s = 0; s < steps; s++) {
          setReel({ key: paidKeys[Math.floor(Math.random() * paidKeys.length)], note: "Spinning…" });
          playSfx("spin");
          await wait(40 + s * s * 1.4);
        }
        const name = findByKey(res.rolls[i])?.item.name ?? res.rolls[i];
        const isLast = i === res.rolls.length - 1;
        setReel({ key: res.rolls[i], note: isLast ? `🎉 ${name}!` : `${name}: already yours! Free re-spin…` });
        playSfx(isLast ? "reward" : "click");
        if (!isLast) await wait(light ? 300 : 1000);
      }
      if (!res.won) setReel(null);
      onCollection(res.collection);
      if (!res.won) setError("You already own every board and face. Legend!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "spin failed");
    } finally {
      setBusy(false);
    }
  }

  const reelItem = reel ? findByKey(reel.key) : null;

  const grid = (kind: "board" | "face", list: TttItemView[]) => (
    <ul className="shop-grid">
      {list.map((it) => (
        <li key={it.id} className={`shop-card${it.owned ? " owned" : ""}`} style={{ borderColor: RARITY_COLOR[it.rarity] }}>
          {kind === "board" ? <BoardSwatch id={it.id} /> : <Piece face={it.id} size={56} />}
          <strong>{it.name}</strong>
          <small style={{ color: RARITY_COLOR[it.rarity] }}>{RARITY_LABEL[it.rarity]}</small>
          {it.owned ? (
            <span className="tag">{it.price === null ? "Free" : "Owned"}</span>
          ) : (
            <button
              className="btn-sm"
              disabled={busy || coins < (it.price ?? 0)}
              onClick={() => void buy(kind, it)}
              title={coins < (it.price ?? 0) ? `You need ${fmt((it.price ?? 0) - coins)} more coins` : undefined}
            >
              {fmt(it.price ?? 0)} 🪙
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="c4-spin">
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>🎡 Boards & faces</h2>
          <p>Buy with coins, or win a series (no undo) for a free spin. Hard pays a spin even for a drawn series.</p>
        </div>
        <span className="shop-balance">
          <span>🪙 {fmt(coins)}</span>
          <span>🎡 {spins}</span>
        </span>
      </div>

      <section className="panel shop-feature">
        <div className="shop-reel" aria-live="polite">
          {reelItem ? (
            <>
              {reelItem.kind === "board" ? <BoardSwatch id={reelItem.item.id} size={72} /> : <Piece face={reelItem.item.id} size={72} />}
              <small>{reel!.note}</small>
            </>
          ) : (
            <span className="shop-reel-idle">?</span>
          )}
        </div>
        <button className="btn-blue" onClick={() => void spin()} disabled={busy || spins === 0}>
          {spins ? `Spin (${spins} left)` : "No spins yet"}
        </button>
      </section>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section>
        <h3>Boards</h3>
        {collection ? grid("board", collection.boards) : <p className="loading">Loading</p>}
      </section>
      <section>
        <h3>Faces</h3>
        {collection ? grid("face", collection.faces) : <p className="loading">Loading</p>}
      </section>

      <div className="game-controls">
        <button className="btn-ghost" onClick={onBack} disabled={busy}>
          ← Menu
        </button>
      </div>
    </div>
  );
}

export { BoardSwatch };
