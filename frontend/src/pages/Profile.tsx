import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { OutfitPreset } from "../api/types";
import Avatar from "../character/Avatar";
import {
  GROUPS,
  ITEMS,
  RARITY_COLOR,
  RARITY_LABEL,
  SLOTS,
  type Item,
  type Loadout,
  type SlotGroup,
  itemsForSlot,
  normalizeLoadout,
  unlockLabel,
} from "../character/catalog";
import TitleBadge from "../components/TitleBadge";
import { playSfx } from "../platform/sound";
import { useAuth } from "../store/auth";
import { useCharacter } from "../store/character";

/** Body and head items are easier to see as a face close-up. */
const HEAD_GROUPS: SlotGroup[] = ["body", "head"];

function sameLoadout(a: Loadout, b: Loadout) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

function ItemTile({
  item,
  draft,
  owned,
  selected,
  head,
  onPick,
}: {
  item: Item | null;
  draft: Loadout;
  owned: boolean;
  selected: boolean;
  head: boolean;
  onPick: () => void;
}) {
  const preview = item ? { ...draft, [item.slot]: item.id } : draft;
  const label = item ? item.name : "None";
  return (
    <li>
      <button
        type="button"
        className={`ward-item${selected ? " selected" : ""}${owned ? "" : " locked"}`}
        style={item ? { borderColor: RARITY_COLOR[item.rarity] } : undefined}
        onClick={onPick}
        disabled={!owned}
        aria-pressed={selected}
        title={item && !owned ? `${item.name}: ${unlockLabel(item.unlock)}` : label}
      >
        {item?.slot === "title" ? (
          <span className="ward-title">
            <TitleBadge id={item.id} />
          </span>
        ) : item ? (
          <Avatar loadout={preview} size={head ? 64 : 56} crop={head ? "head" : "full"} />
        ) : (
          <span className="ward-none" aria-hidden="true">
            ∅
          </span>
        )}
        <strong>{label}</strong>
        {item && <small style={{ color: RARITY_COLOR[item.rarity] }}>{RARITY_LABEL[item.rarity]}</small>}
        {item && !owned && <small className="ward-lock">🔒 {unlockLabel(item.unlock)}</small>}
      </button>
    </li>
  );
}

export default function Profile() {
  const user = useAuth((s) => s.user);
  const view = useCharacter((s) => s.view);
  const load = useCharacter((s) => s.load);
  const setView = useCharacter((s) => s.set);
  const [draft, setDraft] = useState<Loadout | null>(null);
  const [group, setGroup] = useState<SlotGroup>("body");
  const [slot, setSlot] = useState("skin_tone");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Start editing from the saved outfit once it arrives.
  useEffect(() => {
    if (view && !draft) setDraft(normalizeLoadout(view.loadout));
  }, [view, draft]);

  const owned = useMemo(() => new Set(view?.owned ?? []), [view]);
  if (!view || !draft) return <div className="loading">Loading your character</div>;

  const saved = normalizeLoadout(view.loadout);
  const dirty = !sameLoadout(draft, saved);
  const slotMeta = SLOTS.find((s) => s.id === slot)!;
  const items = itemsForSlot(slot);
  const ownedHere = items.filter((i) => owned.has(i.id)).length;
  const w = view.wallet;

  function pickGroup(g: SlotGroup) {
    setGroup(g);
    setSlot(SLOTS.find((s) => s.group === g)!.id);
  }

  function pick(id: string | null) {
    playSfx("click");
    setMsg(null);
    setDraft((d) => {
      const next = { ...d! };
      if (id) next[slot] = id;
      else delete next[slot];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      setView(await api.saveLoadout(draft!));
      playSfx("reward");
      setMsg("Outfit saved!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setSaving(false);
    }
  }

  async function savePreset(n: 1 | 2 | 3, current?: OutfitPreset) {
    const name = window.prompt("Name this outfit (max 24 characters):", current?.name ?? `Outfit ${n}`);
    if (!name?.trim()) return;
    setError(null);
    try {
      setView(await api.savePreset(n, name.trim().slice(0, 24), draft!));
      playSfx("click");
      setMsg(`Saved to preset ${n}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save preset");
    }
  }

  function loadPreset(p: OutfitPreset) {
    playSfx("click");
    setDraft(normalizeLoadout(p.loadout));
    setMsg(`Loaded "${p.name}". Press Save outfit to wear it.`);
  }

  return (
    <div className="ward">
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">
            ← Arcade
          </Link>
          <h1 style={{ marginTop: 12 }}>🧍 My character</h1>
          <p>
            Unlock items by leveling up, buy them with coins, or win exclusives on the token wheel.
          </p>
        </div>
        <div className="ward-head-actions">
          <Link to="/shop" className="btn btn-sm">
            🛒 Shop
          </Link>
          {user && (
            <Link to={`/u/${encodeURIComponent(user.username)}`} className="btn btn-ghost btn-sm">
              👁 Public profile
            </Link>
          )}
        </div>
      </div>

      <div className="ward-layout">
        <aside className="panel ward-preview">
          <Avatar loadout={draft} size={220} label="Your character preview" />
          <div className="ward-name">
            <strong>{user?.username}</strong>
            <TitleBadge id={draft.title} />
          </div>
          <div className="ward-stats">
            <span>Lv {w.level}</span>
            <span>🪙 {w.coins.toLocaleString()}</span>
            <span>🎟 {w.tokens}</span>
            <span>
              {view.owned.length}/{ITEMS.length} items
            </span>
          </div>
          <div className="game-controls">
            <button className="btn-green" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Saving…" : dirty ? "💾 Save outfit" : "✓ Saved"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setDraft(saved);
                setMsg(null);
              }}
              disabled={!dirty}
            >
              ↺ Undo changes
            </button>
          </div>
          {msg && <p className="unlock">{msg}</p>}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <h3>Outfit presets</h3>
          <ul className="ward-presets">
            {([1, 2, 3] as const).map((n) => {
              const p = view.presets.find((x) => x.slot_no === n);
              return (
                <li key={n}>
                  {p ? (
                    <button className="btn-ghost btn-sm" onClick={() => loadPreset(p)} title={`Load "${p.name}"`}>
                      <Avatar loadout={p.loadout} size={28} crop="head" /> {p.name}
                    </button>
                  ) : (
                    <span className="ward-empty">Empty slot {n}</span>
                  )}
                  <button className="btn-sm" onClick={() => void savePreset(n, p)} title="Save the current outfit here">
                    Save here
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="ward-picker" aria-label="Choose items">
          <div className="tabs" role="tablist">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={group === g.id}
                className={`tab${group === g.id ? " active" : ""}`}
                onClick={() => pickGroup(g.id)}
              >
                <span aria-hidden="true">{g.icon}</span> {g.label}
              </button>
            ))}
          </div>
          <div className="ward-slots" role="tablist" aria-label="Slots">
            {SLOTS.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={slot === s.id}
                className={`btn-sm${slot === s.id ? "" : " btn-ghost"}`}
                onClick={() => setSlot(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="ward-count">
            {slotMeta.label}: {ownedHere}/{items.length} unlocked
          </p>
          <ul className="ward-grid">
            {!slotMeta.required && (
              <ItemTile
                item={null}
                draft={draft}
                owned
                selected={!draft[slot]}
                head={HEAD_GROUPS.includes(group)}
                onPick={() => pick(null)}
              />
            )}
            {items.map((it) => (
              <ItemTile
                key={it.id}
                item={it}
                draft={draft}
                owned={owned.has(it.id)}
                selected={draft[slot] === it.id}
                head={HEAD_GROUPS.includes(group)}
                onPick={() => pick(it.id)}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
