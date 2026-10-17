import { useEffect, useRef, useState } from "react";
import { connectFour } from "../../api/client";
import type { CfCollection, CfSpin } from "../../api/types";
import { playSfx } from "../../platform/sound";
import { useSettings } from "../../store/settings";
import Chip from "./Chip";
import { RARITY_COLOR, RARITY_LABEL, SKINS, findSkin } from "./skins";
import { SEGMENT_DEG, WHEEL_SKINS, rotationFor } from "./wheel";

const SPIN_MS = 2600;
const LIGHT_SPIN_MS = 500;

interface Props {
  collection: CfCollection | null;
  onCollection: (c: CfCollection) => void;
  onBack: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "spinning"; roll: number }
  | { kind: "respin"; skin: string }
  | { kind: "won"; skin: string }
  | { kind: "nothing" };

/** Wheel segments as a conic gradient (one color band per skin). */
const WHEEL_BG = `conic-gradient(${WHEEL_SKINS.map(
  (s, i) => `${s.color} ${i * SEGMENT_DEG}deg ${(i + 1) * SEGMENT_DEG}deg`,
).join(", ")})`;

export default function SpinWheel({ collection, onCollection, onBack }: Props) {
  const light = useSettings((s) => s.lightGraphics);
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const spinMs = light ? LIGHT_SPIN_MS : SPIN_MS;
  const spins = collection?.spins_available ?? 0;
  const busy = phase.kind === "spinning" || phase.kind === "respin";
  const owned = new Set(collection?.skins.filter((s) => s.owned).map((s) => s.id));

  const wait = (ms: number) =>
    new Promise<void>((r) => timers.current.push(window.setTimeout(r, ms)));

  /** Animate each server roll in order; earlier ones were owned (re-spins). */
  async function animate(res: CfSpin) {
    let rot = rotation;
    for (let i = 0; i < res.rolls.length; i++) {
      setPhase({ kind: "spinning", roll: i + 1 });
      rot = rotationFor(res.rolls[i], rot);
      setRotation(rot);
      // Clicky ticks while the wheel turns.
      const ticks = light ? 2 : 14;
      for (let t = 0; t < ticks; t++) timers.current.push(window.setTimeout(() => playSfx("spin"), (spinMs * t) / ticks));
      await wait(spinMs + 150);
      if (i < res.rolls.length - 1) {
        setPhase({ kind: "respin", skin: res.rolls[i] });
        playSfx("click");
        await wait(light ? 400 : 1100);
      }
    }
    if (res.won) {
      setPhase({ kind: "won", skin: res.won });
      playSfx("reward");
    } else {
      setPhase({ kind: "nothing" });
    }
    onCollection(res.collection);
  }

  async function spin() {
    setError(null);
    setPhase({ kind: "spinning", roll: 1 });
    try {
      await animate(await connectFour.spin());
    } catch (e) {
      setError(e instanceof Error ? e.message : "spin failed");
      setPhase({ kind: "idle" });
    }
  }

  return (
    <div className="c4-spin">
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>🎡 Skin wheel</h2>
          <p>Beat the AI in a series without undo to earn spins. Harder AI = better odds. Duplicates re-spin for free.</p>
        </div>
        <span className="tag tag-yellow">
          {spins} spin{spins === 1 ? "" : "s"}
        </span>
      </div>

      <div className="wheel-wrap">
        <div className="wheel-pointer" aria-hidden="true">
          ▼
        </div>
        <div
          className="wheel"
          style={{
            background: WHEEL_BG,
            transform: `rotate(${rotation}deg)`,
            transitionDuration: `${spinMs}ms`,
          }}
          aria-hidden="true"
        >
          {WHEEL_SKINS.map((s, i) => (
            <span
              key={s.id}
              className="wheel-label"
              style={{ transform: `rotate(${i * SEGMENT_DEG + SEGMENT_DEG / 2}deg)` }}
            >
              <Chip skin={s.id} size={40} />
            </span>
          ))}
        </div>
        <button
          className="wheel-hub"
          onClick={() => void spin()}
          disabled={busy || spins === 0}
          aria-label={spins ? "Spin the wheel" : "No spins available"}
        >
          SPIN
        </button>
      </div>

      <div className="status-bar" role="status" aria-live="polite">
        {phase.kind === "idle" && (spins ? "Press SPIN!" : "No spins yet. Win a series against the AI (no undo).")}
        {phase.kind === "spinning" && (phase.roll > 1 ? `Re-spin #${phase.roll - 1}…` : "Spinning…")}
        {phase.kind === "respin" && `${findSkin(phase.skin).name}: already yours! Free re-spin…`}
        {phase.kind === "won" && `🎉 New skin: ${findSkin(phase.skin).name}!`}
        {phase.kind === "nothing" && "You already own every skin this wheel can give. Legend!"}
      </div>

      {phase.kind === "won" && (
        <div className="result-card wheel-prize">
          <Chip skin={phase.skin} size={96} title={findSkin(phase.skin).name} />
          <div>
            <h3 style={{ color: RARITY_COLOR[findSkin(phase.skin).rarity] }}>
              {RARITY_LABEL[findSkin(phase.skin).rarity]}
            </h3>
            <div className="score-big">{findSkin(phase.skin).name}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section aria-labelledby="collection-title">
        <h3 id="collection-title">
          Collection · {owned.size}/{SKINS.length}
        </h3>
        <ul className="skin-grid">
          {SKINS.map((s) => {
            const have = owned.has(s.id) || s.free;
            return (
              <li key={s.id} className={`skin-card${have ? "" : " locked"}`} style={{ borderColor: RARITY_COLOR[s.rarity] }}>
                <Chip skin={s.id} size={56} />
                <strong>{s.name}</strong>
                <small style={{ color: RARITY_COLOR[s.rarity] }}>{RARITY_LABEL[s.rarity]}</small>
                <small>{have ? (s.free ? "Starter" : "Owned") : "🔒 Locked"}</small>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="game-controls">
        <button className="btn-ghost" onClick={onBack} disabled={busy}>
          ← Menu
        </button>
      </div>
    </div>
  );
}
