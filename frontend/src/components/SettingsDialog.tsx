import { useEffect, useRef } from "react";
import { TIMER_OPTIONS, useSettings } from "../store/settings";
import { useTheme } from "../store/theme";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Settings modal (native <dialog> for focus trapping + Esc to close). */
export default function SettingsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = useSettings();
  const theme = useTheme((t) => t.theme);
  const toggleTheme = useTheme((t) => t.toggle);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="settings-body">
        <div className="settings-head">
          <h2 id="settings-title">⚙️ Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <fieldset>
          <legend>Display</legend>
          <label className="row-label">
            <span>Dark mode</span>
            <input
              type="checkbox"
              className="switch"
              checked={theme === "dark"}
              onChange={toggleTheme}
            />
          </label>
          <label className="row-label">
            <span>
              Light graphics
              <small>Fewer animations and effects. Good for slow devices.</small>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={s.lightGraphics}
              onChange={(e) => s.update({ lightGraphics: e.target.checked })}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Sound</legend>
          <label className="row-label">
            <span>Sound effects</span>
            <input
              type="checkbox"
              className="switch"
              checked={s.sound}
              onChange={(e) => s.update({ sound: e.target.checked })}
            />
          </label>
          <label className="row-label">
            <span>Volume · {Math.round(s.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(s.volume * 100)}
              disabled={!s.sound}
              onChange={(e) => s.update({ volume: Number(e.target.value) / 100 })}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Gameplay</legend>
          <div className="row-label">
            <span id="timer-label">
              Turn timer
              <small>When time runs out, a random move is played for you.</small>
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="timer-label">
              {TIMER_OPTIONS.map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={s.turnTimer === t}
                  className={`btn-sm ${s.turnTimer === t ? "" : "btn-ghost"}`}
                  onClick={() => s.update({ turnTimer: t })}
                >
                  {t === 0 ? "Off" : `${t}s`}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="settings-foot">
          <button className="btn-ghost btn-sm" onClick={s.reset}>
            Reset defaults
          </button>
          <button className="btn-green btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
