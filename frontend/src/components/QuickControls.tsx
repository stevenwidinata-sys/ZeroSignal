import { useSettingsDialog } from "../store/settingsDialog";
import { useTheme } from "../store/theme";

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="icon-btn"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}

export function SettingsButton() {
  const setOpen = useSettingsDialog((s) => s.setOpen);
  return (
    <button
      className="icon-btn"
      onClick={() => setOpen(true)}
      aria-label="Open settings"
      title="Settings"
    >
      <span aria-hidden="true">⚙️</span>
    </button>
  );
}
