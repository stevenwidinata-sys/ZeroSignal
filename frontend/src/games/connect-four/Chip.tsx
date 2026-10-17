import { useId } from "react";
import { findSkin } from "./skins";

interface Props {
  skin: string;
  /** Rendered size in px (the chip is a square SVG). */
  size?: number;
  className?: string;
  title?: string;
}

/** One chip, drawn as SVG so all 10 skins scale crisply with no image files. */
export default function Chip({ skin, size = 48, className, title }: Props) {
  const s = findSkin(skin);
  const uid = useId().replace(/:/g, "");
  const grad = `g${uid}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <radialGradient id={grad} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="35%" stopColor={s.color} />
          <stop offset="100%" stopColor={s.rim} />
        </radialGradient>
      </defs>
      {s.id === "tnt" ? (
        <TntBody grad={grad} rim={s.rim} />
      ) : s.id === "egg" ? (
        <ellipse cx="50" cy="52" rx="38" ry="44" fill={`url(#${grad})`} stroke="#03040c" strokeWidth="5" />
      ) : (
        <circle cx="50" cy="50" r="44" fill={`url(#${grad})`} stroke="#03040c" strokeWidth="5" />
      )}
      <Face id={s.id} />
    </svg>
  );
}

function TntBody({ grad, rim }: { grad: string; rim: string }) {
  return (
    <g>
      <rect x="8" y="8" width="84" height="84" rx="6" fill={`url(#${grad})`} stroke="#03040c" strokeWidth="5" />
      <path d="M8 30h84M8 70h84" stroke={rim} strokeWidth="4" />
    </g>
  );
}

/** Decorations per skin. Plain color chips get a simple inner ring. */
function Face({ id }: { id: string }) {
  switch (id) {
    case "red-bird":
      return (
        <g>
          {/* head feathers */}
          <path d="M44 8 l6 -6 l4 8 l6 -4 l-2 10z" fill="#8f1d26" stroke="#03040c" strokeWidth="2" />
          {/* belly */}
          <ellipse cx="50" cy="74" rx="24" ry="14" fill="#f6e7c8" />
          {/* eyes + angry brows */}
          <circle cx="38" cy="46" r="9" fill="#fff" stroke="#03040c" strokeWidth="2" />
          <circle cx="62" cy="46" r="9" fill="#fff" stroke="#03040c" strokeWidth="2" />
          <circle cx="40" cy="47" r="3.5" fill="#03040c" />
          <circle cx="60" cy="47" r="3.5" fill="#03040c" />
          <path d="M26 32 L48 40 M74 32 L52 40" stroke="#03040c" strokeWidth="7" strokeLinecap="round" />
          {/* beak */}
          <path d="M42 58 L58 58 L50 70z" fill="#ffb703" stroke="#03040c" strokeWidth="2" />
        </g>
      );
    case "pig":
      return (
        <g>
          <circle cx="24" cy="18" r="8" fill="#6fb83a" stroke="#03040c" strokeWidth="3" />
          <circle cx="76" cy="18" r="8" fill="#6fb83a" stroke="#03040c" strokeWidth="3" />
          <circle cx="34" cy="40" r="7" fill="#fff" stroke="#03040c" strokeWidth="2" />
          <circle cx="66" cy="40" r="7" fill="#fff" stroke="#03040c" strokeWidth="2" />
          <circle cx="35" cy="41" r="3" fill="#03040c" />
          <circle cx="65" cy="41" r="3" fill="#03040c" />
          {/* snout */}
          <ellipse cx="50" cy="60" rx="16" ry="12" fill="#b7ea7f" stroke="#03040c" strokeWidth="3" />
          <ellipse cx="44" cy="60" rx="3" ry="5" fill="#2f5d12" />
          <ellipse cx="56" cy="60" rx="3" ry="5" fill="#2f5d12" />
        </g>
      );
    case "bomb-bird":
      return (
        <g>
          {/* fuse + spark */}
          <path d="M50 6 q6 -6 12 -2" stroke="#c8873a" strokeWidth="4" fill="none" />
          <circle cx="64" cy="4" r="4" fill="#ffb703" />
          <circle cx="38" cy="46" r="8" fill="#fff" stroke="#03040c" strokeWidth="2" />
          <circle cx="62" cy="46" r="8" fill="#fff" stroke="#03040c" strokeWidth="2" />
          <circle cx="40" cy="47" r="3" fill="#03040c" />
          <circle cx="60" cy="47" r="3" fill="#03040c" />
          <path d="M28 34 L48 40 M72 34 L52 40" stroke="#ff4d4f" strokeWidth="5" strokeLinecap="round" />
          <path d="M43 58 L57 58 L50 68z" fill="#ffb703" stroke="#03040c" strokeWidth="2" />
          <ellipse cx="50" cy="80" rx="14" ry="6" fill="#4a4e69" />
        </g>
      );
    case "egg":
      return (
        <g>
          <path d="M20 54 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8" stroke="#d9a400" strokeWidth="4" fill="none" />
          <circle cx="40" cy="30" r="5" fill="#fff" opacity="0.8" />
        </g>
      );
    case "tnt":
      return (
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontFamily="'Press Start 2P', monospace"
          fontSize="20"
          fill="#ff2d2d"
          stroke="#03040c"
          strokeWidth="1.5"
        >
          TNT
        </text>
      );
    case "golden":
      return (
        <g>
          <circle cx="50" cy="50" r="28" fill="none" stroke="#fff6c2" strokeWidth="3" opacity="0.8" />
          <path d="M50 30 l5 12 h13 l-10 8 l4 13 l-12 -8 l-12 8 l4 -13 l-10 -8 h13z" fill="#fff6c2" />
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="28" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="4" />;
  }
}
