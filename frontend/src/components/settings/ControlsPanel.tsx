import { useEffect, useState } from "react";
import {
  KEYMAPS,
  MAX_KEYS,
  SHORTCUTS,
  canBind,
  conflicts,
  keyLabel,
  keysFor,
  resetGame,
  withKeys,
  type KeyAction,
} from "../../platform/keymap";
import { findGame } from "../../platform/registry";
import { useSettings } from "../../store/settings";

function Keys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k) => (
        <kbd key={k} className="key">
          {keyLabel(k)}
        </kbd>
      ))}
    </>
  );
}

/** Which action is waiting for a key press. */
interface Listening {
  gameId: string;
  actionId: string;
}

/** One action: its keys (click ✕ to remove) and "+ Key" to add one. */
function ActionRow({
  gameId,
  action,
  listening,
  onListen,
}: {
  gameId: string;
  action: KeyAction;
  listening: boolean;
  onListen: (on: boolean) => void;
}) {
  const overrides = useSettings((s) => s.keys);
  const update = useSettings((s) => s.update);
  const keys = keysFor(gameId, action.id, overrides);
  const remove = (k: string) => update({ keys: withKeys(gameId, action.id, keys.filter((x) => x !== k), overrides) });

  return (
    <div className={listening ? "listening" : ""}>
      <dt>{action.label}</dt>
      <dd>
        {keys.map((k) => (
          <span key={k} className="key-chip">
            <kbd className="key">{keyLabel(k)}</kbd>
            <button type="button" className="key-remove" aria-label={`Remove ${keyLabel(k)} from ${action.label}`} onClick={() => remove(k)}>
              ✕
            </button>
          </span>
        ))}
        {keys.length === 0 && <small className="key-none">no key</small>}
        {listening ? (
          <button type="button" className="btn-sm key-add listening" onClick={() => onListen(false)}>
            Press a key… (Esc cancels)
          </button>
        ) : (
          keys.length < MAX_KEYS && (
            <button type="button" className="btn-sm btn-ghost key-add" onClick={() => onListen(true)} aria-label={`Add a key for ${action.label}`}>
              + Key
            </button>
          )
        )}
      </dd>
    </div>
  );
}

/** Settings → Controls: shortcut keys and every game's (changeable) keys. */
export default function ControlsPanel() {
  const s = useSettings();
  const [listening, setListening] = useState<Listening | null>(null);

  // While choosing, the next key press becomes the new key.
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListening(null);
        return;
      }
      if (!canBind(e.code)) return;
      const { keys } = useSettings.getState();
      const current = keysFor(listening.gameId, listening.actionId, keys);
      if (!current.includes(e.code)) {
        useSettings.getState().update({
          keys: withKeys(listening.gameId, listening.actionId, [...current, e.code], keys),
        });
      }
      setListening(null);
    };
    // Capture phase: runs before games, shortcuts and the dialog's own Esc.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);

  return (
    <>
      <fieldset>
        <legend>Shortcut keys</legend>
        <label className="row-label">
          <span>
            Shortcut keys
            <small>Work on every page. A game that uses the same key keeps it (e.g. F flags in Minefield).</small>
          </span>
          <input type="checkbox" className="switch" checked={s.shortcuts} onChange={(e) => s.update({ shortcuts: e.target.checked })} />
        </label>
        <dl className="controls-list">
          {SHORTCUTS.map((a) => (
            <div key={a.id}>
              <dt>{a.label}</dt>
              <dd>
                <Keys keys={a.keys} />
              </dd>
            </div>
          ))}
        </dl>
      </fieldset>

      <fieldset>
        <legend>Game controls</legend>
        <p className="wam-hint">Click ✕ to remove a key, or + Key and then press the key you want.</p>
        {KEYMAPS.map((m) => {
          const g = findGame(m.gameId);
          const clashes = conflicts(m.gameId, s.keys);
          const changed = Object.keys(s.keys).some((k) => k.startsWith(`${m.gameId}.`));
          return (
            <section key={m.gameId} className="controls-game">
              <div className="controls-game-head">
                <h4>
                  {g?.meta.icon} {g?.meta.title ?? m.gameId}
                </h4>
                {changed && (
                  <button type="button" className="btn-sm btn-ghost" onClick={() => s.update({ keys: resetGame(m.gameId, s.keys) })}>
                    Reset keys
                  </button>
                )}
              </div>
              {clashes.map((c) => (
                <p key={c.key} className="key-clash" role="alert">
                  ⚠️ <kbd className="key">{keyLabel(c.key)}</kbd> is used for {c.actions.join(" and ")}. Only the first one will work.
                </p>
              ))}
              {m.groups.map((grp, i) => (
                <div key={i}>
                  {grp.title && <p className="wam-hint">{grp.title}</p>}
                  <dl className="controls-list">
                    {grp.actions.map((a) => (
                      <ActionRow
                        key={a.id}
                        gameId={m.gameId}
                        action={a}
                        listening={listening?.gameId === m.gameId && listening.actionId === a.id}
                        onListen={(on) => setListening(on ? { gameId: m.gameId, actionId: a.id } : null)}
                      />
                    ))}
                  </dl>
                </div>
              ))}
              {m.note && <p className="wam-hint">{m.note}</p>}
            </section>
          );
        })}
      </fieldset>
    </>
  );
}
