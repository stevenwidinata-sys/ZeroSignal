import { useEffect, useRef, useState } from "react";
import { resetSeen } from "../platform/tutorial";
import { TEXT_SIZES, TIMER_OPTIONS, useSettings, type TextSize } from "../store/settings";
import { useTheme } from "../store/theme";
import { useSync } from "../platform/settingsSync";
import { useAuth } from "../store/auth";
import AccountPanel from "./settings/AccountPanel";
import ThemePicker from "./settings/ThemePicker";
import PrivacyPanel from "./settings/PrivacyPanel";
import ControlsPanel from "./settings/ControlsPanel";
import { canFullscreen, toggleFullscreen, useFullscreen } from "../platform/display";

type TabId = "display" | "sound" | "gameplay" | "controls" | "privacy" | "account";
const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "display", icon: "🖥️", label: "Display" },
  { id: "sound", icon: "🔊", label: "Sound" },
  { id: "gameplay", icon: "🎮", label: "Gameplay" },
  { id: "controls", icon: "⌨️", label: "Controls" },
  { id: "privacy", icon: "🔒", label: "Privacy" },
  { id: "account", icon: "👤", label: "Account" },
];
/** The last tab you looked at (until the page reloads). */
let lastTab: TabId = "display";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TEXT_SIZE_NAME: Record<TextSize, string> = { s: "Small", m: "Medium", l: "Large", xl: "Extra large" };

/** Settings modal (native <dialog> for focus trapping + Esc to close). */
export default function SettingsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = useSettings();
  const scheme = useTheme((t) => t.scheme);
  const toggleTheme = useTheme((t) => t.toggle);
  const [tutorialsReset, setTutorialsReset] = useState(false);
  const user = useAuth((a) => a.user);
  const sync = useSync((x) => x.status);
  const fullscreen = useFullscreen();
  const [tab, setTabState] = useState<TabId>(lastTab);
  const setTab = (t: TabId) => {
    lastTab = t;
    setTabState(t);
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (open) setTutorialsReset(false);
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

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              className={`settings-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} className="settings-panel">
          {tab === "display" && (
            <>
              <fieldset>
                <legend>Display</legend>
                <div className="row-label row-stack">
                  <span>
                    Theme
                    <small>Pick one for your mood. It follows you to every device when you're logged in.</small>
                  </span>
                  <ThemePicker />
                </div>
                <label className="row-label">
                  <span>
                    Dark version
                    <small>Switch to this mood's {scheme === "dark" ? "light" : "dark"} partner (also the 🌙/☀️ button).</small>
                  </span>
                  <input type="checkbox" className="switch" checked={scheme === "dark"} onChange={toggleTheme} />
                </label>
                <label className="row-label">
                  <span>
                    High contrast
                    <small>Plain black and white with bright borders. Easier in sunlight or with low vision.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.highContrast}
                    onChange={(e) => s.update({ highContrast: e.target.checked })}
                  />
                </label>
                <label className="row-label">
                  <span>
                    Readable font
                    <small>Swap the pixel-art font for a plain one that's easier to read.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.readableFont}
                    onChange={(e) => s.update({ readableFont: e.target.checked })}
                  />
                </label>
                {canFullscreen() && (
                  <label className="row-label">
                    <span>
                      Fullscreen
                      <small>Hide the browser bars. Shortcut: F. Esc leaves.</small>
                    </span>
                    <input type="checkbox" className="switch" checked={fullscreen} onChange={() => void toggleFullscreen()} />
                  </label>
                )}
                <label className="row-label">
                  <span>
                    Show FPS
                    <small>Frames per second in the bottom-right corner.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.showFps}
                    onChange={(e) => s.update({ showFps: e.target.checked })}
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
                <label className="row-label">
                  <span>
                    Colorblind-friendly
                    <small>Color-safe palette, plus shapes on pieces so you never need color alone.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.colorblind}
                    onChange={(e) => s.update({ colorblind: e.target.checked })}
                  />
                </label>
                <label className="row-label">
                  <span>
                    Reduced motion
                    <small>Stops animations but keeps the effects. Your device setting is followed too.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.reducedMotion}
                    onChange={(e) => s.update({ reducedMotion: e.target.checked })}
                  />
                </label>
                <label className="row-label">
                  <span>
                    Screen shake
                    <small>The board shakes on bombs and big hits.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.screenShake}
                    onChange={(e) => s.update({ screenShake: e.target.checked })}
                  />
                </label>
                <div className="row-label">
                  <span id="text-size-label">
                    Text size
                    <small>Makes the whole site bigger or smaller.</small>
                  </span>
                  <div className="segmented" role="radiogroup" aria-labelledby="text-size-label">
                    {TEXT_SIZES.map((t: TextSize) => (
                      <button
                        key={t}
                        role="radio"
                        aria-checked={s.textSize === t}
                        aria-label={TEXT_SIZE_NAME[t]}
                        className={`btn-sm${s.textSize === t ? "" : " btn-ghost"}`}
                        onClick={() => s.update({ textSize: t })}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>
            </>
          )}
          {tab === "sound" && (
            <>
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
                  <span>Game sounds · {Math.round(s.volume * 100)}%</span>
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
              <label className="row-label">
                  <span>
                    Menu sounds · {Math.round(s.uiVolume * 100)}%
                    <small>Button clicks, separate from game sounds.</small>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(s.uiVolume * 100)}
                    disabled={!s.sound}
                    onChange={(e) => s.update({ uiVolume: Number(e.target.value) / 100 })}
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>Music</legend>
                <label className="row-label">
                  <span>
                    Background music
                    <small>Chiptune made in code. Starts after your first click.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.music}
                    onChange={(e) => s.update({ music: e.target.checked })}
                  />
                </label>
                <label className="row-label">
                  <span>Music volume · {Math.round(s.musicVolume * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(s.musicVolume * 100)}
                    disabled={!s.music}
                    onChange={(e) => s.update({ musicVolume: Number(e.target.value) / 100 })}
                  />
                </label>
              </fieldset>
            </>
          )}
          {tab === "gameplay" && (
            <>
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
                <label className="row-label">
                  <span>
                    Ask before leaving a round
                    <small>Warns you before closing the tab or opening another page mid-round.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.confirmLeave}
                    onChange={(e) => s.update({ confirmLeave: e.target.checked })}
                  />
                </label>
                <label className="row-label">
                  <span>
                    Vibration
                    <small>Short buzzes on phones for hits, bombs and flags.</small>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={s.vibration}
                    onChange={(e) => s.update({ vibration: e.target.checked })}
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>Help</legend>
                <div className="row-label">
                  <span>
                    Tutorials
                    <small>Show each game's "how to play" again the next time you open it.</small>
                  </span>
                  <button
                    className="btn-sm btn-ghost"
                    onClick={() => {
                      resetSeen();
                      setTutorialsReset(true);
                    }}
                    disabled={tutorialsReset}
                  >
                    {tutorialsReset ? "✓ Reset" : "Reset tutorials"}
                  </button>
                </div>
              </fieldset>
            </>
          )}
          {tab === "controls" && <ControlsPanel />}
          {tab === "privacy" && <PrivacyPanel onClose={onClose} />}
          {tab === "account" && <AccountPanel onClose={onClose} />}
        </div>

        <div className="settings-foot">
          {tab !== "account" ? (
            <button className="btn-ghost btn-sm" onClick={s.reset}>
              Reset defaults
            </button>
          ) : (
            <span />
          )}
          <small className="settings-sync" role="status">
            {user && !user.is_guest
              ? { off: "", loading: "Loading your settings…", synced: "☁️ Saved to your account", saving: "☁️ Saving…", error: "⚠️ Couldn't sync; saved in this browser" }[sync]
              : "Saved in this browser"}
          </small>
          <button className="btn-green btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
