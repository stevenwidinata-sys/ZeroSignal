import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import Avatar from "../character/Avatar";
import {
  GROUPS,
  ITEMS,
  MYSTERY_BOX_PRICE,
  RARITY_COLOR,
  RARITY_LABEL,
  SLOTS,
  WHEEL_TOKEN_COST,
  type Item,
  type Loadout,
  type SlotGroup,
  findItem,
  normalizeLoadout,
  priceOf,
} from "../character/catalog";
import { playSfx } from "../platform/sound";
import { useCharacter } from "../store/character";
import { useSettings } from "../store/settings";

const fmt = (n: number) => n.toLocaleString();
const HEAD_GROUPS: SlotGroup[] = ["body", "head"];
const groupOf = (it: Item) => SLOTS.find((s) => s.id === it.slot)?.group ?? "extras";
const WHEEL_ITEMS = ITEMS.filter((i) => i.unlock.kind === "wheel");

/** Item preview drawn on the player's own character. */
function Preview({ item, base, size = 72 }: { item: Item; base: Loadout; size?: number }) {
  const head = HEAD_GROUPS.includes(groupOf(item));
  return <Avatar loadout={{ ...base, [item.slot]: item.id }} size={size} crop={head ? "head" : "full"} />;
}

type Reveal = { kind: "box"; item: Item; duplicate: boolean; refund: number } | { kind: "wheel"; item: Item };

export default function Shop() {
  const view = useCharacter((s) => s.view);
  const load = useCharacter((s) => s.load);
  const setView = useCharacter((s) => s.set);
  const light = useSettings((s) => s.lightGraphics);
  const [group, setGroup] = useState<SlotGroup | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [reel, setReel] = useState<{ item: Item; note: string } | null>(null);
  const [boxShake, setBoxShake] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    void load();
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, [load]);

  if (!view) return <div className="loading">Loading the shop</div>;

  const owned = new Set(view.owned);
  const base = normalizeLoadout(view.loadout);
  const w = view.wallet;
  const shopItems = ITEMS.filter((i) => priceOf(i) !== null && (group === "all" || groupOf(i) === group));
  const wheelLeft = WHEEL_ITEMS.filter((i) => !owned.has(i.id)).length;
  const wait = (ms: number) => new Promise<void>((r) => timers.current.push(window.setTimeout(r, ms)));

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    setReveal(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function buy(it: Item) {
    const res = await run(() => api.buyItem(it.id));
    if (!res) return;
    setView(res);
    playSfx("reward");
    setReveal({ kind: "box", item: it, duplicate: false, refund: 0 });
  }

  async function openBox() {
    setBoxShake(true);
    playSfx("drop");
    const res = await run(async () => {
      const [r] = await Promise.all([api.openMysteryBox(), wait(light ? 150 : 900)]);
      return r;
    });
    setBoxShake(false);
    if (!res) return;
    setView(res.character);
    playSfx(res.duplicate ? "click" : "reward");
    setReveal({ kind: "box", item: findItem(res.item_id)!, duplicate: res.duplicate, refund: res.refund });
  }

  /** Slot-machine reel: flicker through wheel items, landing on each roll. */
  async function spinReel(target: Item) {
    const steps = light ? 3 : 18;
    for (let i = 0; i < steps; i++) {
      const it = WHEEL_ITEMS[Math.floor(Math.random() * WHEEL_ITEMS.length)];
      setReel({ item: it, note: "Spinning…" });
      playSfx("spin");
      await wait(40 + i * i * 1.2);
    }
    setReel({ item: target, note: "" });
  }

  async function spinWheel() {
    const res = await run(() => api.spinItemWheel());
    if (!res) return;
    setBusy(true);
    for (let i = 0; i < res.rolls.length; i++) {
      const it = findItem(res.rolls[i])!;
      await spinReel(it);
      if (i < res.rolls.length - 1) {
        setReel({ item: it, note: "Already yours! Free re-spin…" });
        playSfx("click");
        await wait(light ? 300 : 1000);
      }
    }
    const won = findItem(res.won)!;
    setReel({ item: won, note: `🎉 ${won.name}!` });
    playSfx("reward");
    setView(res.character);
    setReveal({ kind: "wheel", item: won });
    setBusy(false);
  }

  return (
    <div className="shop">
      <div className="page-head">
        <div>
          <Link to="/profile" className="back-link">
            ← My character
          </Link>
          <h1 style={{ marginTop: 12 }}>🛒 Shop</h1>
          <p>Spend coins on gear, gamble on a mystery box, or use lucky tokens for exclusives.</p>
        </div>
        <div className="shop-balance" aria-label="Your balance">
          <span>🪙 {fmt(w.coins)}</span>
          <span>🎟 {fmt(w.tokens)}</span>
        </div>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {reveal && (
        <div className="result-card shop-reveal" role="status">
          <Preview item={reveal.item} base={base} size={96} />
          <div>
            <h3 style={{ color: RARITY_COLOR[reveal.item.rarity] }}>{RARITY_LABEL[reveal.item.rarity]}</h3>
            <div className="score-big">{reveal.item.name}</div>
            {reveal.kind === "box" && reveal.duplicate ? (
              <p className="hint">Duplicate! You got {fmt(reveal.refund)} 🪙 back.</p>
            ) : (
              <p className="unlock">
                New item! <Link to="/profile">Wear it now →</Link>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="shop-features">
        <section className="panel shop-feature">
          <h2>🎁 Mystery box</h2>
          <div className={`shop-box${boxShake ? " shake" : ""}`} aria-hidden="true">
            🎁
          </div>
          <p>A random shop item. Mostly common, sometimes rare or epic. Duplicates give half the price back.</p>
          <button className="btn" onClick={() => void openBox()} disabled={busy || w.coins < MYSTERY_BOX_PRICE}>
            Open for {MYSTERY_BOX_PRICE} 🪙
          </button>
        </section>

        <section className="panel shop-feature">
          <h2>🎰 Token wheel</h2>
          <div className="shop-reel" aria-live="polite">
            {reel ? (
              <>
                <Preview item={reel.item} base={base} size={80} />
                <small>{reel.note || reel.item.name}</small>
              </>
            ) : (
              <span className="shop-reel-idle">?</span>
            )}
          </div>
          <p>
            Wheel-only exclusives: Rare 50%, Epic 38%, Legendary 12%. You never get a duplicate.{" "}
            <strong>
              {wheelLeft}/{WHEEL_ITEMS.length}
            </strong>{" "}
            left to win.
          </p>
          <button
            className="btn-blue"
            onClick={() => void spinWheel()}
            disabled={busy || w.tokens < WHEEL_TOKEN_COST || wheelLeft === 0}
          >
            Spin for {WHEEL_TOKEN_COST} 🎟
          </button>
          {w.tokens === 0 && <p className="hint">Tokens drop by luck when you win games. Harder AI = better odds.</p>}
        </section>
      </div>

      <section aria-labelledby="coin-shop">
        <h2 id="coin-shop">Coin shop</h2>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={group === "all"} className={`tab${group === "all" ? " active" : ""}`} onClick={() => setGroup("all")}>
            All
          </button>
          {GROUPS.filter((g) => ITEMS.some((i) => priceOf(i) !== null && groupOf(i) === g.id)).map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={group === g.id}
              className={`tab${group === g.id ? " active" : ""}`}
              onClick={() => setGroup(g.id)}
            >
              <span aria-hidden="true">{g.icon}</span> {g.label}
            </button>
          ))}
        </div>
        <ul className="shop-grid">
          {shopItems.map((it) => {
            const price = priceOf(it)!;
            const have = owned.has(it.id);
            const short = price - w.coins;
            return (
              <li key={it.id} className={`shop-card${have ? " owned" : ""}`} style={{ borderColor: RARITY_COLOR[it.rarity] }}>
                <Preview item={it} base={base} />
                <strong>{it.name}</strong>
                <small style={{ color: RARITY_COLOR[it.rarity] }}>
                  {RARITY_LABEL[it.rarity]} · {SLOTS.find((s) => s.id === it.slot)?.label}
                </small>
                {have ? (
                  <span className="tag">Owned</span>
                ) : (
                  <button
                    className="btn-sm"
                    onClick={() => void buy(it)}
                    disabled={busy || short > 0}
                    title={short > 0 ? `You need ${fmt(short)} more coins` : undefined}
                  >
                    {fmt(price)} 🪙
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="wheel-items">
        <h2 id="wheel-items">Wheel exclusives</h2>
        <ul className="shop-grid">
          {WHEEL_ITEMS.map((it) => {
            const have = owned.has(it.id);
            return (
              <li key={it.id} className={`shop-card${have ? " owned" : " mystery"}`} style={{ borderColor: RARITY_COLOR[it.rarity] }}>
                <Preview item={it} base={base} />
                <strong>{it.name}</strong>
                <small style={{ color: RARITY_COLOR[it.rarity] }}>{RARITY_LABEL[it.rarity]}</small>
                {have ? <span className="tag">Owned</span> : <small>🎰 Wheel only</small>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
