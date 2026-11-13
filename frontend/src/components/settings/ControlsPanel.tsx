import { KEYMAPS, SHORTCUTS, keyLabel, type KeyAction } from "../../platform/keymap";
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

function ActionList({ actions }: { actions: KeyAction[] }) {
  return (
    <dl className="controls-list">
      {actions.map((a) => (
        <div key={a.id}>
          <dt>{a.label}</dt>
          <dd>
            <Keys keys={a.keys} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Settings → Controls: shortcut keys and every game's controls. */
export default function ControlsPanel() {
  const s = useSettings();
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
        <ActionList actions={SHORTCUTS} />
      </fieldset>

      <fieldset>
        <legend>Game controls</legend>
        {KEYMAPS.map((m) => {
          const g = findGame(m.gameId);
          return (
            <section key={m.gameId} className="controls-game">
              <h4>
                {g?.meta.icon} {g?.meta.title ?? m.gameId}
              </h4>
              {m.groups.map((grp, i) => (
                <div key={i}>
                  {grp.title && <p className="wam-hint">{grp.title}</p>}
                  <ActionList actions={grp.actions} />
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
