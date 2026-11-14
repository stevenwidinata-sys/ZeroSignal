import type { CSSProperties } from "react";
import { THEMES, themeVars } from "../../platform/themes";
import { useTheme } from "../../store/theme";

/** Settings → Display: pick a mood theme; each card previews its own colors. */
export default function ThemePicker() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.set);

  return (
    <div className="theme-picker" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const v = themeVars(t);
        const style = {
          "--tp-bg": v["--bg"],
          "--tp-surface": v["--surface"],
          "--tp-ink": v["--ink"],
          "--tp-muted": v["--muted"],
          "--tp-line": v["--line"],
          "--tp-yellow": v["--yellow"],
          "--tp-blue": v["--blue"],
          "--tp-green": v["--green"],
        } as CSSProperties;
        const on = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`theme-card${on ? " selected" : ""}`}
            style={style}
            onClick={() => setTheme(t.id)}
            title={t.mood}
          >
            <span className="theme-preview" aria-hidden="true">
              <span className="tp-bar" />
              <span className="tp-dots">
                <i style={{ background: "var(--tp-yellow)" }} />
                <i style={{ background: "var(--tp-green)" }} />
                <i style={{ background: "var(--tp-blue)" }} />
              </span>
              <span className="tp-text">Aa</span>
            </span>
            <strong>
              {on && "✓ "}
              {t.name}
            </strong>
            <small>
              {t.scheme === "dark" ? "🌙" : "☀️"} {t.mood}
            </small>
          </button>
        );
      })}
    </div>
  );
}
