import { useId, type ReactNode } from "react";
import { type Item, type Loadout, findItem, normalizeLoadout } from "./catalog";

/**
 * Pixel-art paper doll. Every item is drawn in code from its catalog `art`
 * (shape + colors), so there are no image files to load or keep in sync.
 * Canvas: 64 x 80 "pixels". Head 22..42 x 8..30, torso 23..41 x 34..54.
 */

const INK = "#1b1b2f";

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

interface Ctx {
  skin: string;
  hair: string;
  uid: string;
}

const px = (x: number, y: number, w: number, h: number, fill: string, opacity?: number) => (
  <rect x={x} y={y} width={w} height={h} fill={fill} opacity={opacity} />
);

function star(cx: number, cy: number, r: number, fill: string) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} />;
}

function heart(cx: number, cy: number, s: number, fill: string) {
  return (
    <path
      d={`M${cx} ${cy + s} L${cx - s} ${cy} A${s / 2} ${s / 2} 0 0 1 ${cx} ${cy - s / 2} A${s / 2} ${s / 2} 0 0 1 ${cx + s} ${cy} Z`}
      fill={fill}
    />
  );
}

// ---------------------------------------------------------------------------
// Layers. Each returns null for "none" or unknown shapes.
// ---------------------------------------------------------------------------

function background(a: Item["art"], c: Ctx): ReactNode {
  const base = a.color ?? "#8ecae6";
  const acc = a.accent ?? "#ffffff";
  switch (a.shape) {
    case "gradient":
      return (
        <>
          <defs>
            <linearGradient id={`bg${c.uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={base} />
              <stop offset="1" stopColor={acc} />
            </linearGradient>
          </defs>
          <rect width="64" height="80" fill={`url(#bg${c.uid})`} />
        </>
      );
    case "grid":
      return (
        <>
          {px(0, 0, 64, 80, base)}
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={`v${i}`} x={i * 8} y={0} width={1} height={80} fill={acc} opacity={0.3} />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={`h${i}`} x={0} y={i * 8} width={64} height={1} fill={acc} opacity={0.3} />
          ))}
        </>
      );
    case "stars":
      return (
        <>
          {px(0, 0, 64, 80, base)}
          {[
            [6, 6], [18, 14], [52, 8], [58, 26], [8, 30], [48, 44], [4, 52], [56, 60], [30, 4], [12, 70],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={i % 3 ? 1 : 2} height={i % 3 ? 1 : 2} fill={acc} />
          ))}
        </>
      );
    case "rays":
      return (
        <>
          {px(0, 0, 64, 80, base)}
          {Array.from({ length: 8 }, (_, i) => {
            const a1 = (Math.PI / 4) * i;
            const a2 = a1 + Math.PI / 10;
            const r = 80;
            return (
              <polygon
                key={i}
                points={`32,40 ${32 + r * Math.cos(a1)},${40 + r * Math.sin(a1)} ${32 + r * Math.cos(a2)},${40 + r * Math.sin(a2)}`}
                fill={acc}
                opacity={0.45}
              />
            );
          })}
        </>
      );
    default:
      return px(0, 0, 64, 80, base);
  }
}

function frame(a: Item["art"]): ReactNode {
  const col = a.color ?? INK;
  switch (a.shape) {
    case "double":
      return (
        <>
          <rect x="1" y="1" width="62" height="78" fill="none" stroke={col} strokeWidth="2" />
          <rect x="4" y="4" width="56" height="72" fill="none" stroke={col} strokeWidth="1" />
        </>
      );
    case "glow":
      return (
        <>
          <rect x="2" y="2" width="60" height="76" fill="none" stroke={col} strokeWidth="5" opacity="0.35" />
          <rect x="1.5" y="1.5" width="61" height="77" fill="none" stroke={col} strokeWidth="2" />
        </>
      );
    default:
      return <rect x="1" y="1" width="62" height="78" fill="none" stroke={col} strokeWidth="2" />;
  }
}

function back(a: Item["art"]): ReactNode {
  const col = a.color ?? INK;
  const acc = a.accent ?? shade(col, -0.25);
  switch (a.shape) {
    case "backpack":
      return (
        <>
          {px(18, 37, 28, 16, shade(col, -0.2))}
          {px(19, 38, 26, 14, col)}
        </>
      );
    case "cape":
      return <polygon points="22,34 42,34 49,72 15,72" fill={col} stroke={shade(col, -0.3)} strokeWidth="1" />;
    case "wings":
      return (
        <>
          <path d="M22 38 Q4 26 2 44 Q10 42 6 52 Q16 46 22 50 Z" fill={col} stroke="#cfd8dc" strokeWidth="1" />
          <path d="M42 38 Q60 26 62 44 Q54 42 58 52 Q48 46 42 50 Z" fill={col} stroke="#cfd8dc" strokeWidth="1" />
        </>
      );
    case "batwings":
      return (
        <>
          <polygon points="22,38 4,28 6,40 1,44 8,46 6,54 22,50" fill={col} stroke={acc} strokeWidth="1" />
          <polygon points="42,38 60,28 58,40 63,44 56,46 58,54 42,50" fill={col} stroke={acc} strokeWidth="1" />
        </>
      );
    case "jetpack":
      return (
        <>
          {px(14, 36, 7, 15, col)}
          {px(43, 36, 7, 15, col)}
          <polygon points="14,51 21,51 17.5,59" fill={acc} />
          <polygon points="43,51 50,51 46.5,59" fill={acc} />
        </>
      );
    default:
      return null;
  }
}

/** Hair pieces that sit behind the head. */
function hairBack(a: Item["art"], c: Ctx): ReactNode {
  switch (a.shape) {
    case "long":
      return px(20, 8, 24, 27, c.hair);
    case "bob":
      return px(20, 8, 24, 17, c.hair);
    case "ponytail":
      return px(42, 12, 5, 16, c.hair);
    case "afro":
      return <ellipse cx="32" cy="13" rx="15" ry="11" fill={c.hair} />;
    default:
      return null;
  }
}

function hairFront(a: Item["art"], c: Ctx): ReactNode {
  const top = (
    <>
      {px(22, 6, 20, 5, c.hair)}
      {px(21, 8, 2, 7, c.hair)}
      {px(41, 8, 2, 7, c.hair)}
    </>
  );
  switch (a.shape) {
    case "short":
      return top;
    case "spiky":
      return (
        <polygon points="21,14 21,7 24,1 27,6 30,0 33,6 36,0 39,6 43,2 43,14 41,10 23,10" fill={c.hair} />
      );
    case "long":
    case "bob":
      return (
        <>
          {top}
          {px(22, 10, 7, 3, c.hair)}
        </>
      );
    case "mohawk":
      return px(29, 1, 6, 9, c.hair);
    case "ponytail":
      return (
        <>
          {top}
          {px(41, 10, 4, 3, c.hair)}
        </>
      );
    case "afro":
      return <ellipse cx="32" cy="8" rx="12" ry="5" fill={c.hair} />;
    default:
      return null;
  }
}

function eyes(a: Item["art"]): ReactNode {
  const col = a.color ?? INK;
  switch (a.shape) {
    case "dot":
      return (
        <>
          {px(27, 18, 2, 2, col)}
          {px(35, 18, 2, 2, col)}
        </>
      );
    case "round":
      return (
        <>
          {px(26, 17, 4, 4, "#ffffff")}
          {px(34, 17, 4, 4, "#ffffff")}
          {px(27, 18, 2, 2, col)}
          {px(35, 18, 2, 2, col)}
        </>
      );
    case "happy":
      return (
        <>
          {px(26, 19, 1, 1, col)}
          {px(27, 18, 2, 1, col)}
          {px(29, 19, 1, 1, col)}
          {px(34, 19, 1, 1, col)}
          {px(35, 18, 2, 1, col)}
          {px(37, 19, 1, 1, col)}
        </>
      );
    case "sleepy":
      return (
        <>
          {px(26, 19, 4, 1, col)}
          {px(34, 19, 4, 1, col)}
        </>
      );
    case "wink":
      return (
        <>
          {px(27, 18, 2, 2, col)}
          {px(34, 19, 4, 1, col)}
        </>
      );
    case "angry":
      return (
        <>
          {px(26, 18, 4, 3, "#ffffff")}
          {px(34, 18, 4, 3, "#ffffff")}
          {px(28, 19, 2, 2, col)}
          {px(34, 19, 2, 2, col)}
        </>
      );
    case "star":
      return (
        <>
          {star(28, 19, 2.6, col)}
          {star(36, 19, 2.6, col)}
        </>
      );
    case "glow":
      return (
        <>
          {px(25, 17, 6, 4, col, 0.35)}
          {px(33, 17, 6, 4, col, 0.35)}
          {px(26, 18, 4, 2, col)}
          {px(34, 18, 4, 2, col)}
        </>
      );
    default:
      return null;
  }
}

function eyebrows(a: Item["art"], c: Ctx): ReactNode {
  const col = shade(c.hair, -0.25);
  switch (a.shape) {
    case "thin":
      return (
        <>
          {px(26, 15, 4, 1, col)}
          {px(34, 15, 4, 1, col)}
        </>
      );
    case "thick":
      return (
        <>
          {px(25, 14, 5, 2, col)}
          {px(34, 14, 5, 2, col)}
        </>
      );
    case "angry":
      return (
        <>
          <polygon points="25,14 30,16 30,17.5 25,15.5" fill={col} />
          <polygon points="39,14 34,16 34,17.5 39,15.5" fill={col} />
        </>
      );
    default:
      return null;
  }
}

function mouth(a: Item["art"]): ReactNode {
  switch (a.shape) {
    case "smile":
      return (
        <>
          {px(29, 24, 1, 1, INK)}
          {px(30, 25, 4, 1, INK)}
          {px(34, 24, 1, 1, INK)}
        </>
      );
    case "grin":
      return (
        <>
          {px(29, 24, 6, 3, INK)}
          {px(30, 24, 4, 1, "#ffffff")}
        </>
      );
    case "open":
      return (
        <>
          {px(30, 24, 4, 3, INK)}
          {px(31, 26, 2, 1, "#ff6b81")}
        </>
      );
    case "flat":
      return px(29, 25, 6, 1, INK);
    case "smirk":
      return (
        <>
          {px(30, 25, 4, 1, INK)}
          {px(34, 24, 1, 1, INK)}
        </>
      );
    case "tongue":
      return (
        <>
          {px(29, 24, 1, 1, INK)}
          {px(30, 25, 4, 1, INK)}
          {px(34, 24, 1, 1, INK)}
          {px(32, 26, 2, 2, "#ff6b81")}
        </>
      );
    default:
      return null;
  }
}

function facialHair(a: Item["art"], c: Ctx): ReactNode {
  const col = c.hair;
  switch (a.shape) {
    case "mustache":
      return px(28, 22, 8, 2, col);
    case "beard":
      return (
        <>
          {px(22, 20, 3, 9, col)}
          {px(39, 20, 3, 9, col)}
          {px(24, 27, 16, 4, col)}
          {px(28, 22, 8, 2, col)}
        </>
      );
    case "goatee":
      return px(30, 27, 4, 3, col);
    default:
      return null;
  }
}

function hat(a: Item["art"]): ReactNode {
  const col = a.color ?? "#e63946";
  const acc = a.accent ?? "#ffffff";
  switch (a.shape) {
    case "cap":
      return (
        <>
          <path d="M21 10 L21 6 Q32 0 43 6 L43 10 Z" fill={col} />
          {px(30, 9, 19, 2, shade(col, -0.2))}
          {px(31, 4, 2, 2, acc)}
        </>
      );
    case "beanie":
      return (
        <>
          <path d="M21 11 L21 6 Q32 -2 43 6 L43 11 Z" fill={col} />
          {px(21, 8, 22, 3, acc)}
          <circle cx="32" cy="1" r="2" fill={acc} />
        </>
      );
    case "headband":
      return (
        <>
          {px(21, 10, 22, 3, col)}
          {px(21, 11, 22, 1, acc)}
        </>
      );
    case "party":
      return (
        <>
          <polygon points="25,10 39,10 32,-4" fill={col} />
          <polygon points="27,6 37,6 36,3 28,3" fill={acc} />
          <circle cx="32" cy="-4" r="2" fill={acc} />
        </>
      );
    case "cowboy":
      return (
        <>
          <path d="M13 10 Q32 4 51 10 L51 11 Q32 8 13 11 Z" fill={shade(col, -0.15)} />
          <path d="M22 9 L23 0 Q32 -3 41 0 L42 9 Z" fill={col} />
          {px(22, 6, 20, 2, acc)}
        </>
      );
    case "tophat":
      return (
        <>
          {px(17, 8, 30, 3, col)}
          {px(24, -6, 16, 14, col)}
          {px(24, 4, 16, 2, acc)}
        </>
      );
    case "wizard":
      return (
        <>
          <polygon points="17,11 47,11 36,-6 33,-8" fill={col} />
          {star(30, 3, 2.5, acc)}
          {star(37, 7, 1.6, acc)}
        </>
      );
    case "viking":
      return (
        <>
          <polygon points="22,8 16,0 18,8" fill={acc} />
          <polygon points="42,8 48,0 46,8" fill={acc} />
          <path d="M21 12 L21 7 Q32 -3 43 7 L43 12 Z" fill={col} />
          {px(21, 10, 22, 2, shade(col, -0.25))}
        </>
      );
    case "halo":
      return (
        <>
          <ellipse cx="32" cy="2" rx="11" ry="3" fill="none" stroke={acc} strokeWidth="4" opacity="0.4" />
          <ellipse cx="32" cy="2" rx="10" ry="2.4" fill="none" stroke={col} strokeWidth="1.6" />
        </>
      );
    case "crown":
      return (
        <>
          <polygon points="22,11 22,1 27,6 32,-1 37,6 42,1 42,11" fill={col} stroke={shade(col, -0.3)} strokeWidth="0.8" />
          <circle cx="32" cy="7" r="1.6" fill={acc} />
          <circle cx="26" cy="8" r="1.1" fill={acc} />
          <circle cx="38" cy="8" r="1.1" fill={acc} />
        </>
      );
    default:
      return null;
  }
}

function glasses(a: Item["art"]): ReactNode {
  const col = a.color ?? INK;
  switch (a.shape) {
    case "round":
      return (
        <>
          <circle cx="28" cy="19" r="3.3" fill="none" stroke={col} strokeWidth="1" />
          <circle cx="36" cy="19" r="3.3" fill="none" stroke={col} strokeWidth="1" />
          {px(31, 18, 2, 1, col)}
        </>
      );
    case "square":
      return (
        <>
          <rect x="24.5" y="16.5" width="7" height="5" fill="none" stroke={col} strokeWidth="1" />
          <rect x="32.5" y="16.5" width="7" height="5" fill="none" stroke={col} strokeWidth="1" />
          {px(31, 18, 2, 1, col)}
        </>
      );
    case "shades":
      return (
        <>
          {px(23, 17, 8, 4, col)}
          {px(33, 17, 8, 4, col)}
          {px(31, 17, 2, 1, col)}
          {px(24, 17, 2, 1, "#ffffff", 0.6)}
          {px(34, 17, 2, 1, "#ffffff", 0.6)}
        </>
      );
    case "star":
      return (
        <>
          {star(28, 19, 4.2, col)}
          {star(36, 19, 4.2, col)}
          {px(31, 18, 2, 1, INK)}
        </>
      );
    case "heart":
      return (
        <>
          {heart(28, 18.5, 3.4, col)}
          {heart(36, 18.5, 3.4, col)}
          {px(31, 18, 2, 1, INK)}
        </>
      );
    case "monocle":
      return (
        <>
          <circle cx="36" cy="19" r="3.4" fill="#ffffff" fillOpacity="0.25" stroke={col} strokeWidth="1.2" />
          <path d="M39 21 Q41 27 38 32" fill="none" stroke={col} strokeWidth="0.7" />
        </>
      );
    case "visor":
      return (
        <>
          {px(21, 16, 22, 5, col, 0.35)}
          {px(22, 17, 20, 3, col, 0.9)}
        </>
      );
    default:
      return null;
  }
}

function mask(a: Item["art"]): ReactNode {
  const col = a.color ?? INK;
  const acc = a.accent ?? "#ffffff";
  switch (a.shape) {
    case "bandana":
      return (
        <>
          <polygon points="22,22 42,22 42,27 32,32 22,27" fill={col} />
          {px(26, 24, 1, 1, acc)}
          {px(32, 26, 1, 1, acc)}
          {px(37, 24, 1, 1, acc)}
        </>
      );
    case "snout":
      return (
        <>
          <ellipse cx="32" cy="24" rx="5" ry="3.4" fill={col} stroke={shade(col, -0.35)} strokeWidth="0.8" />
          <ellipse cx="30" cy="24" rx="1" ry="1.5" fill={acc} />
          <ellipse cx="34" cy="24" rx="1" ry="1.5" fill={acc} />
        </>
      );
    case "ninja":
      return (
        <>
          {px(21, 6, 22, 10, col)}
          {px(21, 21, 22, 10, col)}
        </>
      );
    case "hero":
      return <path d="M22 15 H42 V22 H22 Z M26 17 V21 H30 V17 Z M34 17 V21 H38 V17 Z" fill={col} fillRule="evenodd" />;
    case "skull":
      return (
        <>
          <rect x="22" y="8" width="20" height="22" rx="3" fill={col} />
          {px(25, 16, 5, 5, acc)}
          {px(34, 16, 5, 5, acc)}
          {px(31, 22, 2, 2, acc)}
          {[27, 29, 31, 33, 35].map((x) => (
            <rect key={x} x={x} y="26" width="1" height="2" fill={acc} />
          ))}
        </>
      );
    default:
      return null;
  }
}

function earrings(a: Item["art"]): ReactNode {
  const col = a.color ?? "#d9d9e3";
  switch (a.shape) {
    case "stud":
      return (
        <>
          <circle cx="21" cy="23" r="1" fill={col} />
          <circle cx="43" cy="23" r="1" fill={col} />
        </>
      );
    case "hoop":
      return (
        <>
          <circle cx="21" cy="24.5" r="1.8" fill="none" stroke={col} strokeWidth="0.9" />
          <circle cx="43" cy="24.5" r="1.8" fill="none" stroke={col} strokeWidth="0.9" />
        </>
      );
    case "star":
      return (
        <>
          {star(21, 24.5, 1.8, col)}
          {star(43, 24.5, 1.8, col)}
        </>
      );
    default:
      return null;
  }
}

function shirt(a: Item["art"]): ReactNode {
  const col = a.color ?? "#f5f5f5";
  const acc = a.accent ?? shade(col, -0.25);
  const dark = shade(col, -0.18);
  const torso = px(23, 34, 18, 20, col);
  const shortSleeves = (
    <>
      {px(18, 35, 5, 7, col)}
      {px(41, 35, 5, 7, col)}
    </>
  );
  const longSleeves = (c: string) => (
    <>
      {px(18, 35, 5, 17, c)}
      {px(41, 35, 5, 17, c)}
    </>
  );
  const neckline = px(29, 34, 6, 1, dark);
  switch (a.shape) {
    case "tee":
      return (
        <>
          {torso}
          {shortSleeves}
          {neckline}
        </>
      );
    case "striped":
      return (
        <>
          {torso}
          {shortSleeves}
          {[37, 41, 45, 49].map((y) => (
            <rect key={y} x="23" y={y} width="18" height="2" fill={acc} />
          ))}
          {px(18, 38, 5, 2, acc)}
          {px(41, 38, 5, 2, acc)}
        </>
      );
    case "tank":
      return (
        <>
          {px(25, 36, 14, 18, col)}
          {px(26, 34, 3, 2, col)}
          {px(35, 34, 3, 2, col)}
        </>
      );
    case "polo":
      return (
        <>
          {torso}
          {shortSleeves}
          <polygon points="27,34 32,37 37,34 37,35.5 32,38.5 27,35.5" fill={acc} />
          {px(31.5, 38, 1, 1, dark)}
          {px(31.5, 41, 1, 1, dark)}
        </>
      );
    case "hoodie":
      return (
        <>
          {px(25, 31, 14, 4, acc)}
          {torso}
          {longSleeves(col)}
          {px(27, 45, 10, 6, acc)}
          {px(30, 35, 1, 5, "#ffffff", 0.7)}
          {px(33, 35, 1, 5, "#ffffff", 0.7)}
        </>
      );
    case "bird":
      return (
        <>
          {torso}
          {shortSleeves}
          <circle cx="32" cy="45" r="6" fill={acc} />
          {px(29, 41, 2, 2, "#ffffff")}
          {px(33, 41, 2, 2, "#ffffff")}
          {px(30, 42, 1, 1, INK)}
          {px(33, 42, 1, 1, INK)}
          <polygon points="28,39.5 31,41 28,41" fill={INK} />
          <polygon points="36,39.5 33,41 36,41" fill={INK} />
          <polygon points="30,44 34,44 32,47" fill="#ffb703" />
        </>
      );
    case "jersey":
      return (
        <>
          {torso}
          {shortSleeves}
          {px(18, 40, 5, 2, acc)}
          {px(41, 40, 5, 2, acc)}
          {px(28, 34, 8, 2, acc)}
          <text x="32" y="49" textAnchor="middle" fontSize="9" fontWeight="bold" fill={acc} fontFamily="monospace">
            {a.text ?? "10"}
          </text>
        </>
      );
    case "tux":
      return (
        <>
          {torso}
          {longSleeves(col)}
          <polygon points="28,34 36,34 32,46" fill={acc} />
          <polygon points="29.5,36 32,37.5 29.5,39" fill="#e63946" />
          <polygon points="34.5,36 32,37.5 34.5,39" fill="#e63946" />
          {px(31.5, 41, 1, 1, INK)}
          {px(31.5, 44, 1, 1, INK)}
        </>
      );
    default:
      return null;
  }
}

function jacket(a: Item["art"]): ReactNode {
  const col = a.color ?? "#457b9d";
  const acc = a.accent ?? shade(col, -0.3);
  const sleeves = (c: string) => (
    <>
      {px(18, 35, 5, 17, c)}
      {px(41, 35, 5, 17, c)}
    </>
  );
  switch (a.shape) {
    case "open":
      return (
        <>
          {px(23, 34, 6, 20, col)}
          {px(35, 34, 6, 20, col)}
          {sleeves(col)}
          <polygon points="23,34 29,34 29,40" fill={acc} />
          <polygon points="41,34 35,34 35,40" fill={acc} />
        </>
      );
    case "puffer":
      return (
        <>
          {px(23, 34, 18, 20, col)}
          {sleeves(col)}
          {[39, 44, 49].map((y) => (
            <rect key={y} x="18" y={y} width="28" height="1" fill={shade(col, -0.25)} />
          ))}
          {px(31.5, 34, 1, 20, shade(col, -0.4))}
        </>
      );
    case "long":
      return (
        <>
          {px(22, 34, 7, 30, col)}
          {px(35, 34, 7, 30, col)}
          {sleeves(col)}
          {a.accent && (
            <>
              {px(28, 34, 1, 30, acc)}
              {px(35, 34, 1, 30, acc)}
              {px(18, 50, 5, 2, acc)}
              {px(41, 50, 5, 2, acc)}
            </>
          )}
        </>
      );
    case "varsity":
      return (
        <>
          {px(23, 34, 6, 20, col)}
          {px(35, 34, 6, 20, col)}
          {sleeves(acc)}
          {px(23, 52, 18, 2, acc)}
          {px(25, 38, 3, 3, acc)}
        </>
      );
    default:
      return null;
  }
}

function pants(a: Item["art"]): ReactNode {
  const col = a.color ?? "#355c9a";
  const acc = a.accent ?? shade(col, -0.25);
  const hips = px(24, 52, 16, 4, col);
  const legs = (h: number) => (
    <>
      {px(25, 54, 6, h, col)}
      {px(33, 54, 6, h, col)}
    </>
  );
  switch (a.shape) {
    case "long":
      return (
        <>
          {hips}
          {legs(14)}
        </>
      );
    case "shorts":
      return (
        <>
          {hips}
          {legs(7)}
        </>
      );
    case "cargo":
      return (
        <>
          {hips}
          {legs(14)}
          {px(25, 58, 3, 4, acc)}
          {px(36, 58, 3, 4, acc)}
        </>
      );
    case "skirt":
      return <polygon points="24,52 40,52 43,63 21,63" fill={col} />;
    case "plaid":
      return (
        <>
          {hips}
          {legs(14)}
          {[56, 60, 64].map((y) => (
            <rect key={y} x="24" y={y} width="16" height="1" fill={acc} />
          ))}
          {[27, 35].map((x) => (
            <rect key={x} x={x} y="52" width="1" height="16" fill={acc} />
          ))}
        </>
      );
    default:
      return null;
  }
}

function shoes(a: Item["art"]): ReactNode {
  const col = a.color ?? "#f5f5f5";
  const acc = a.accent ?? shade(col, -0.3);
  switch (a.shape) {
    case "sneakers":
      return (
        <>
          {px(23, 68, 8, 4, col)}
          {px(33, 68, 8, 4, col)}
          {px(23, 71, 8, 1, acc)}
          {px(33, 71, 8, 1, acc)}
          {px(25, 69, 3, 1, acc)}
          {px(35, 69, 3, 1, acc)}
        </>
      );
    case "sandals":
      return (
        <>
          {px(23, 71, 8, 1, col)}
          {px(33, 71, 8, 1, col)}
          {px(26, 68, 1, 3, col)}
          {px(36, 68, 1, 3, col)}
        </>
      );
    case "boots":
      return (
        <>
          {px(24, 63, 7, 9, col)}
          {px(33, 63, 7, 9, col)}
          {px(23, 71, 8, 1, shade(col, -0.45))}
          {px(33, 71, 8, 1, shade(col, -0.45))}
        </>
      );
    case "hightops":
      return (
        <>
          {px(24, 65, 7, 7, col)}
          {px(33, 65, 7, 7, col)}
          {px(23, 71, 8, 1, acc)}
          {px(33, 71, 8, 1, acc)}
          {px(26, 66, 2, 4, acc)}
          {px(35, 66, 2, 4, acc)}
        </>
      );
    case "rocket":
      return (
        <>
          {px(24, 64, 7, 8, col)}
          {px(33, 64, 7, 8, col)}
          <polygon points="24,72 31,72 27.5,78" fill={acc} />
          <polygon points="33,72 40,72 36.5,78" fill={acc} />
        </>
      );
    default:
      return null;
  }
}

function gloves(a: Item["art"]): ReactNode {
  const col = a.color ?? "#f5f5f5";
  switch (a.shape) {
    case "basic":
      return (
        <>
          {px(18, 51, 5, 5, col)}
          {px(41, 51, 5, 5, col)}
        </>
      );
    case "boxing":
      return (
        <>
          <rect x="16.5" y="49.5" width="8" height="8" rx="2" fill={col} />
          <rect x="39.5" y="49.5" width="8" height="8" rx="2" fill={col} />
          {px(17, 49, 7, 1.5, a.accent ?? shade(col, 0.4))}
          {px(40, 49, 7, 1.5, a.accent ?? shade(col, 0.4))}
        </>
      );
    default:
      return null;
  }
}

function necklace(a: Item["art"]): ReactNode {
  const col = a.color ?? "#ffd23f";
  const chain = <polyline points="27,34 32,39 37,34" fill="none" stroke={col} strokeWidth="0.8" />;
  switch (a.shape) {
    case "chain":
      return (
        <>
          <polyline points="26,34 32,41 38,34" fill="none" stroke={col} strokeWidth="1.4" />
          {chain}
        </>
      );
    case "pendant":
      return (
        <>
          {chain}
          {heart(32, 40, 2.2, col)}
        </>
      );
    case "medal":
      return (
        <>
          <polygon points="27,34 30,34 32,39 34,34 37,34 33,41 31,41" fill={a.accent ?? "#3a86ff"} />
          <circle cx="32" cy="43" r="3" fill={col} stroke={shade(col, -0.3)} strokeWidth="0.6" />
        </>
      );
    case "scarf":
      return (
        <>
          {px(25, 31, 14, 4, col)}
          {px(34, 34, 4, 8, col)}
          {px(34, 41, 4, 1, shade(col, -0.3))}
        </>
      );
    default:
      return null;
  }
}

function held(a: Item["art"]): ReactNode {
  const col = a.color ?? "#7f5539";
  const acc = a.accent ?? shade(col, -0.3);
  switch (a.shape) {
    case "slingshot":
      return (
        <>
          {px(46, 44, 2, 12, col)}
          <path d="M43 36 L47 45 L51 36" fill="none" stroke={col} strokeWidth="2" />
          <path d="M43 36 Q47 40 51 36" fill="none" stroke="#e9c46a" strokeWidth="0.8" />
        </>
      );
    case "balloon":
      return (
        <>
          <path d="M44 53 Q50 40 52 26" fill="none" stroke={INK} strokeWidth="0.5" />
          <ellipse cx="52" cy="20" rx="6" ry="7" fill={col} />
          <ellipse cx="50" cy="17" rx="1.5" ry="2" fill="#ffffff" opacity="0.6" />
        </>
      );
    case "controller":
      return (
        <>
          <rect x="38" y="47" width="16" height="8" rx="3" fill={col} />
          {px(41, 50, 3, 1, "#ffffff")}
          {px(42, 49, 1, 3, "#ffffff")}
          <circle cx="50" cy="50" r="1" fill={acc} />
          <circle cx="52" cy="52" r="1" fill={acc} />
        </>
      );
    case "sword":
      return (
        <>
          <polygon points="47,22 50,22 50,50 47,50" fill={col} />
          <polygon points="47,22 48.5,18 50,22" fill={col} />
          {px(43, 50, 11, 2, acc)}
          {px(47, 52, 3, 5, shade(acc, -0.2))}
        </>
      );
    case "wand":
      return (
        <>
          <polygon points="45,55 47,55 51,33 49,33" fill={col} />
          {star(50, 31, 4, acc)}
        </>
      );
    case "guitar":
      return (
        <>
          <polygon points="49,24 52,24 50,44 47,44" fill={shade(acc, 0.3)} />
          {px(48, 20, 5, 4, acc)}
          <ellipse cx="47" cy="50" rx="7" ry="6" fill={col} />
          <circle cx="47" cy="49" r="1.8" fill={acc} />
        </>
      );
    case "trophy":
      return (
        <>
          <path d="M44 38 H56 V42 Q56 48 50 48 Q44 48 44 42 Z" fill={col} />
          <path d="M44 40 Q40 40 42 45 M56 40 Q60 40 58 45" fill="none" stroke={col} strokeWidth="1.4" />
          {px(49, 48, 2, 4, col)}
          {px(46, 52, 8, 3, shade(col, -0.3))}
        </>
      );
    case "laser":
      return (
        <>
          {px(46, 21, 5, 29, col, 0.3)}
          {px(47.5, 21, 2, 29, "#ffffff")}
          {px(47, 21, 3, 29, col, 0.75)}
          {px(46.5, 50, 4, 7, acc)}
        </>
      );
    default:
      return null;
  }
}

function pet(a: Item["art"]): ReactNode {
  const col = a.color ?? "#e63946";
  const eye = (x: number, y: number) => (
    <>
      {px(x, y, 2, 2, "#ffffff")}
      {px(x + 1, y + 1, 1, 1, INK)}
    </>
  );
  switch (a.shape) {
    case "bird":
      return (
        <>
          <circle cx="10" cy="71" r="6" fill={col} stroke={INK} strokeWidth="0.6" />
          <ellipse cx="10" cy="74" rx="4" ry="2.4" fill="#f6e7c8" />
          {eye(7, 68)}
          {eye(11, 68)}
          <polygon points="6,67 9,68 6,68.5" fill={INK} />
          <polygon points="14,67 11,68 14,68.5" fill={INK} />
          <polygon points="9,71 12,71 10.5,73" fill="#ffb703" />
        </>
      );
    case "cat":
      return (
        <>
          <polygon points="4,66 6,61 8,66" fill={col} />
          <polygon points="12,66 14,61 16,66" fill={col} />
          <rect x="4" y="65" width="12" height="12" rx="3" fill={col} />
          {eye(6, 68)}
          {eye(11, 68)}
          {px(9, 71, 2, 1, "#ff6b81")}
        </>
      );
    case "dog":
      return (
        <>
          <rect x="4" y="64" width="12" height="13" rx="4" fill={col} />
          {px(2, 65, 3, 7, shade(col, -0.3))}
          {px(15, 65, 3, 7, shade(col, -0.3))}
          {eye(6, 68)}
          {eye(11, 68)}
          {px(8.5, 71, 3, 2, INK)}
        </>
      );
    case "pig":
      return (
        <>
          <circle cx="10" cy="71" r="6" fill={col} stroke={shade(col, -0.35)} strokeWidth="0.6" />
          <circle cx="5.5" cy="65.5" r="1.8" fill={col} />
          <circle cx="14.5" cy="65.5" r="1.8" fill={col} />
          {eye(6, 68)}
          {eye(12, 68)}
          <ellipse cx="10" cy="72" rx="3" ry="2" fill={shade(col, 0.3)} />
          {px(8.5, 71.5, 1, 1, shade(col, -0.5))}
          {px(10.5, 71.5, 1, 1, shade(col, -0.5))}
        </>
      );
    case "slime":
      return (
        <>
          <path d="M3 77 Q3 63 10 63 Q17 63 17 77 Z" fill={col} />
          {eye(6, 69)}
          {eye(11, 69)}
          <ellipse cx="6" cy="66" rx="1.5" ry="1" fill="#ffffff" opacity="0.6" />
        </>
      );
    case "dragon":
      return (
        <>
          <polygon points="2,66 7,70 3,72" fill={a.accent ?? "#ffd23f"} />
          <polygon points="18,66 13,70 17,72" fill={a.accent ?? "#ffd23f"} />
          <rect x="5" y="64" width="10" height="13" rx="4" fill={col} />
          <polygon points="6,64 7,60 9,64" fill={a.accent ?? "#ffd23f"} />
          <polygon points="11,64 13,60 14,64" fill={a.accent ?? "#ffd23f"} />
          {eye(6, 67)}
          {eye(11, 67)}
          {px(8, 72, 4, 1, shade(col, -0.4))}
        </>
      );
    default:
      return null;
  }
}

/** Draw one item on its own (used by the wardrobe thumbnails and tests). */
export function drawItem(item: Item, ctx: Ctx): ReactNode {
  const a = item.art;
  switch (item.slot) {
    case "background":
      return background(a, ctx);
    case "frame":
      return frame(a);
    case "back":
      return back(a);
    case "hair_style":
      return a.shape === "none" ? null : (
        <>
          {hairBack(a, ctx)}
          {hairFront(a, ctx)}
        </>
      );
    case "eyes":
      return eyes(a);
    case "eyebrows":
      return eyebrows(a, ctx);
    case "mouth":
      return mouth(a);
    case "facial_hair":
      return facialHair(a, ctx);
    case "hat":
      return hat(a);
    case "glasses":
      return glasses(a);
    case "mask":
      return mask(a);
    case "earrings":
      return earrings(a);
    case "shirt":
      return shirt(a);
    case "jacket":
      return jacket(a);
    case "pants":
      return pants(a);
    case "shoes":
      return shoes(a);
    case "gloves":
      return gloves(a);
    case "necklace":
      return necklace(a);
    case "held":
      return held(a);
    case "pet":
      return pet(a);
    // Colors only: they tint other layers.
    case "skin_tone":
    case "hair_color":
      return a.color ? px(0, 0, 0, 0, a.color) : null;
    case "title":
      return a.text ? <title>{a.text}</title> : null;
    default:
      return null;
  }
}

function Body({ skin }: { skin: string }) {
  const dark = shade(skin, -0.15);
  return (
    <>
      {/* legs + feet */}
      {px(25, 54, 6, 14, skin)}
      {px(33, 54, 6, 14, skin)}
      {px(24, 68, 7, 3, skin)}
      {px(33, 68, 7, 3, skin)}
      {/* torso, arms, hands */}
      {px(23, 34, 18, 20, skin)}
      {px(18, 35, 5, 17, skin)}
      {px(41, 35, 5, 17, skin)}
      {px(18, 52, 5, 4, dark)}
      {px(41, 52, 5, 4, dark)}
      {/* neck, ears, head */}
      {px(29, 29, 6, 6, dark)}
      {px(20, 17, 3, 5, dark)}
      {px(41, 17, 3, 5, dark)}
      <rect x="22" y="8" width="20" height="22" rx="3" fill={skin} />
      {px(24, 23, 3, 2, "#ff8fa3", 0.35)}
      {px(37, 23, 3, 2, "#ff8fa3", 0.35)}
    </>
  );
}

interface Props {
  loadout: Loadout | null | undefined;
  /** Rendered width in px (height follows the 4:5 shape, or 1:1 for "head"). */
  size?: number;
  /** "full" = whole character; "head" = face close-up for small chips. */
  crop?: "full" | "head";
  className?: string;
  /** Accessible name; omit when the avatar is decorative. */
  label?: string;
}

/** Layer order, back to front. */
const ORDER = [
  "hair_back",
  "body",
  "pants",
  "shoes",
  "shirt",
  "jacket",
  "gloves",
  "necklace",
  "facial_hair",
  "mouth",
  "eyes",
  "eyebrows",
  "hair_front",
  "mask",
  "glasses",
  "earrings",
  "hat",
  "held",
  "pet",
] as const;

export default function Avatar({ loadout, size = 160, crop = "full", className, label }: Props) {
  const uid = useId().replace(/:/g, "");
  const l = normalizeLoadout(loadout);
  const get = (slot: string) => findItem(l[slot]);
  const hairColor = get("hair_color");
  const ctx: Ctx = {
    skin: get("skin_tone")?.art.color ?? "#f1c27d",
    hair: hairColor?.art.special === "rainbow" ? `url(#rb${uid})` : hairColor?.art.color ?? "#6b3e1f",
    uid,
  };
  const hair = get("hair_style");

  const layer = (name: (typeof ORDER)[number]): ReactNode => {
    if (name === "body") return <Body skin={ctx.skin} />;
    if (name === "hair_back") return hair ? hairBack(hair.art, ctx) : null;
    if (name === "hair_front") return hair ? hairFront(hair.art, ctx) : null;
    if (name === "eyebrows" || name === "facial_hair") {
      const it = get(name);
      return it ? (name === "eyebrows" ? eyebrows(it.art, ctx) : facialHair(it.art, ctx)) : null;
    }
    const it = get(name);
    return it ? drawItem(it, ctx) : null;
  };

  const bg = get("background");
  const fr = get("frame");
  const head = crop === "head";
  const viewBox = head ? "14 -4 36 36" : "0 0 64 80";

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={head ? size : size * 1.25}
      className={className}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      overflow="hidden"
    >
      <defs>
        <linearGradient id={`rb${uid}`} x1="0" y1="0" x2="1" y2="0">
          {["#ff5a5f", "#ffd23f", "#3bce7a", "#3a86ff", "#9b5de5"].map((c, i) => (
            <stop key={c} offset={i / 4} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {head ? <rect x="14" y="-4" width="36" height="36" fill={bg?.art.color ?? "#8ecae6"} /> : bg && background(bg.art, ctx)}
      {get("back") && !head && back(get("back")!.art)}
      {ORDER.map((name) => (
        <g key={name}>{layer(name)}</g>
      ))}
      {!head && fr && frame(fr.art)}
    </svg>
  );
}
