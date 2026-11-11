import type { Kind } from "./engine";

/**
 * Moles drawn in SVG (no image files). Every kind has its own shape, not
 * just its own color: ninja mask, hard hat (cracks after one hit), crown
 * with sparkles, a bomb, an ice block. So colorblind players never need color.
 */
export default function Mole({ kind, cracked = false, size = 80 }: { kind: Kind; cracked?: boolean; size?: number }) {
  if (kind === "bomb") return <Bomb size={size} />;
  // Plain moles take their colors from the board theme (CSS variables).
  const body = BODY[kind] ?? "var(--mole-body, #8a5a3b)";
  const belly = BELLY[kind] ?? "var(--mole-belly, #c79a73)";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={`mole-svg mole-${kind}`}>
      {/* head + body */}
      <ellipse cx="50" cy="66" rx="34" ry="38" style={{ fill: body }} stroke="#2a1a10" strokeWidth="3" />
      <ellipse cx="50" cy="80" rx="20" ry="18" style={{ fill: belly }} />
      {/* eyes */}
      {kind === "ninja" ? (
        <>
          <rect x="16" y="40" width="68" height="16" rx="4" fill="#1b1b2e" />
          <path d="M84 46 l12 -6 M84 50 l12 4" stroke="#1b1b2e" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="38" cy="48" rx="6" ry="3.5" fill="#fff" />
          <ellipse cx="62" cy="48" rx="6" ry="3.5" fill="#fff" />
          <circle cx="39" cy="48" r="2" fill="#111" />
          <circle cx="61" cy="48" r="2" fill="#111" />
        </>
      ) : (
        <>
          <circle cx="38" cy="50" r="5" fill="#111" />
          <circle cx="62" cy="50" r="5" fill="#111" />
          <circle cx="39.5" cy="48.5" r="1.6" fill="#fff" />
          <circle cx="63.5" cy="48.5" r="1.6" fill="#fff" />
        </>
      )}
      {/* nose + teeth */}
      <ellipse cx="50" cy="61" rx="8" ry="6" fill="#ff7aa2" stroke="#2a1a10" strokeWidth="2" />
      <rect x="45" y="67" width="10" height="7" rx="1" fill="#fff" stroke="#2a1a10" strokeWidth="1.5" />
      <line x1="50" y1="67" x2="50" y2="74" stroke="#2a1a10" strokeWidth="1.5" />
      {/* whiskers */}
      <path d="M28 62 h-14 M28 66 l-13 4 M72 62 h14 M72 66 l13 4" stroke="#2a1a10" strokeWidth="2" strokeLinecap="round" />

      {kind === "helmet" && (
        <g>
          <path d="M14 40 Q50 -4 86 40 Z" fill="#c9cfd8" stroke="#2a1a10" strokeWidth="3" />
          <rect x="10" y="37" width="80" height="8" rx="3" fill="#9aa3b1" stroke="#2a1a10" strokeWidth="3" />
          <rect x="45" y="12" width="10" height="26" rx="2" fill="#9aa3b1" />
          {cracked && <path d="M30 20 l8 8 -5 5 9 6" fill="none" stroke="#2a1a10" strokeWidth="3" strokeLinejoin="round" />}
        </g>
      )}
      {kind === "golden" && (
        <g>
          <path d="M28 30 L32 12 L42 24 L50 8 L58 24 L68 12 L72 30 Z" fill="#ffd23f" stroke="#2a1a10" strokeWidth="3" strokeLinejoin="round" />
          <path d="M10 20 l3 -8 3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 Z M84 34 l2 -5 2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 Z" fill="#fff6c2" stroke="#2a1a10" strokeWidth="1.5" />
        </g>
      )}
      {kind === "boss" && (
        <g>
          {/* horns + angry brows + scar */}
          <path d="M20 36 L10 6 L34 28 Z M80 36 L90 6 L66 28 Z" fill="#f5f7ff" stroke="#2a1a10" strokeWidth="3" strokeLinejoin="round" />
          <path d="M28 40 L46 46 M72 40 L54 46" stroke="#2a1a10" strokeWidth="5" strokeLinecap="round" />
          <path d="M66 56 l8 10 M70 55 l-4 4" stroke="#ff8a8d" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {kind === "double" && (
        <g>
          <circle cx="76" cy="28" r="18" fill="#ffd23f" stroke="#2a1a10" strokeWidth="3" />
          <text x="76" y="35" textAnchor="middle" fontSize="18" fontWeight="900" fill="#2a1a10" fontFamily="monospace">×2</text>
        </g>
      )}
      {kind === "shield" && (
        <path d="M76 10 L94 17 V32 C94 44 86 51 76 55 C66 51 58 44 58 32 V17 Z" fill="#3a86ff" stroke="#2a1a10" strokeWidth="3" strokeLinejoin="round" />
      )}
      {kind === "slow_mo" && (
        <g>
          <path d="M64 10 H90 M64 52 H90 M67 10 C67 26 87 26 87 31 C87 36 67 36 67 52 M87 10 C87 26 67 26 67 31 C67 36 87 36 87 52" fill="none" stroke="#2a1a10" strokeWidth="3" strokeLinecap="round" />
          <path d="M70 47 H84 L77 40 Z" fill="#ffd23f" />
        </g>
      )}
      {kind === "ice" && (
        <g>
          <rect x="8" y="24" width="84" height="76" rx="10" fill="rgba(200,235,255,0.35)" stroke="#e3f5ff" strokeWidth="3" strokeDasharray="10 6" />
          <path d="M50 4 v24 M39 10 l22 12 M61 10 l-22 12" stroke="#1d5fd8" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function Bomb({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="mole-svg mole-bomb">
      <circle cx="50" cy="62" r="32" fill="#22223a" stroke="#000" strokeWidth="3" />
      <rect x="40" y="22" width="20" height="12" rx="2" fill="#555a75" stroke="#000" strokeWidth="3" />
      <path d="M50 22 Q56 8 70 10" fill="none" stroke="#c9932e" strokeWidth="4" strokeLinecap="round" />
      <path className="bomb-spark" d="M72 4 l3 6 6 -2 -3 6 6 3 -7 1 0 7 -4 -6 -6 3 2 -7 -6 -3 7 -1 Z" fill="#ffd23f" stroke="#ff5a1f" strokeWidth="1.5" />
      {/* skull: the shape says "danger" without color */}
      <circle cx="50" cy="60" r="12" fill="#f5f7ff" />
      <rect x="44" y="68" width="12" height="8" rx="2" fill="#f5f7ff" />
      <circle cx="45" cy="59" r="3.5" fill="#22223a" />
      <circle cx="55" cy="59" r="3.5" fill="#22223a" />
      <circle cx="40" cy="48" r="5" fill="rgba(255,255,255,0.18)" />
    </svg>
  );
}

export const KIND_LABEL: Record<Kind, string> = {
  normal: "Mole",
  ninja: "Ninja mole",
  helmet: "Helmet mole",
  golden: "Golden mole",
  bomb: "Bomb",
  ice: "Ice mole",
  double: "Double-points mole",
  shield: "Shield mole",
  slow_mo: "Slow-mo mole",
  boss: "Boss mole",
};

const BODY: Partial<Record<Kind, string>> = {
  golden: "#f4b400",
  ice: "#9ad8ff",
  boss: "#7b3fb0",
};
const BELLY: Partial<Record<Kind, string>> = {
  golden: "#ffe17a",
  ice: "#e3f5ff",
  boss: "#c9a3ec",
};
