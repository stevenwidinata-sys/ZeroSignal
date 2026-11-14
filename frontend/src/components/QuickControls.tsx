import { useSettingsDialog } from "../store/settingsDialog";
import { findTheme } from "../platform/themes";
import { useTheme } from "../store/theme";

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const scheme = useTheme((s) => s.scheme);
  const toggle = useTheme((s) => s.toggle);
  const next = findTheme(findTheme(theme)?.pair)?.name ?? (scheme === "dark" ? "light" : "dark");
  return (
    <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${next}`} title={`Switch to ${next}`}>
      <span aria-hidden="true">{scheme === "dark" ? "☀️" : "🌙"}</span>
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
