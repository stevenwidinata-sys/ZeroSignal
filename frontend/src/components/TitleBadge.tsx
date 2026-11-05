import type { CSSProperties } from "react";
import { findItem, type Item } from "../character/catalog";

/**
 * CSS classes for a title. The tier sets how strong it looks (bronze: color,
 * silver: + icon, gold: + glow, mythic: + animation); the effect picks which
 * glow or animation. "Light graphics" already turns every animation off.
 */
export function titleClasses(item: Item): string {
  const { tier = "bronze", effect } = item.art;
  return ["title-badge", `title-tier-${tier}`, effect && `title-fx-${effect}`].filter(Boolean).join(" ");
}

interface Props {
  /** Title item id from the character catalog. */
  id: string | undefined | null;
  small?: boolean;
}

/** A player title with its color, element icon and effect. */
export default function TitleBadge({ id, small }: Props) {
  const item = findItem(id);
  if (!item || item.slot !== "title") return null;
  const { text = item.name, icon, color } = item.art;
  const style = { "--title-color": color ?? "var(--muted)" } as CSSProperties;
  return (
    <span className={`${titleClasses(item)}${small ? " title-sm" : ""}`} style={style} title={`${item.name} title`}>
      {icon && (
        <span className="title-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="title-text" data-text={text}>
        {text}
      </span>
    </span>
  );
}
