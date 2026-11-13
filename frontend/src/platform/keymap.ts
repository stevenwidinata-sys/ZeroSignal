/**
 * Every game's keyboard controls in one place. Keys are
 * `KeyboardEvent.code` values (physical keys), so they work the same on any
 * keyboard language. Settings → Controls lists them.
 */
export interface KeyAction {
  id: string;
  label: string;
  /** Default keys (KeyboardEvent.code). */
  keys: string[];
}

export interface GameKeymap {
  gameId: string;
  /** Optional group title inside a game (e.g. "3×3 board"). */
  groups: { title?: string; actions: KeyAction[] }[];
  /** Controls that aren't keys (mouse, touch). */
  note?: string;
}

const hole = (id: string, n: number, keys: string[]): KeyAction => ({ id, label: `Hole ${n}`, keys });
const digit = (d: string) => (/\d/.test(d) ? [`Digit${d}`, `Numpad${d}`] : [`Key${d}`]);

/** 3×3: numpad layout or QWE/ASD/ZXC; 4×4: 1234/QWER/ASDF/ZXCV. */
const NUM3 = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
const LET3 = ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"];
const KEY4 = ["1", "2", "3", "4", "Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];

export const KEYMAPS: GameKeymap[] = [
  {
    gameId: "angry-bird",
    groups: [{ actions: [{ id: "cancel", label: "Cancel aiming", keys: ["Escape"] }] }],
    note: "Drag the bird back with the mouse or a finger, then let go to launch.",
  },
  {
    gameId: "whack-a-mole",
    groups: [
      { actions: [{ id: "pause", label: "Pause / resume", keys: ["Escape", "KeyP"] }] },
      { title: "3×3 board", actions: NUM3.map((d, i) => hole(`hole${i + 1}`, i + 1, [...digit(d), ...digit(LET3[i])])) },
      { title: "4×4 board", actions: KEY4.map((d, i) => hole(`big${i + 1}`, i + 1, digit(d))) },
    ],
    note: "Or click / tap the holes.",
  },
  {
    gameId: "minefield",
    groups: [
      {
        actions: [
          { id: "up", label: "Move up", keys: ["ArrowUp"] },
          { id: "down", label: "Move down", keys: ["ArrowDown"] },
          { id: "left", label: "Move left", keys: ["ArrowLeft"] },
          { id: "right", label: "Move right", keys: ["ArrowRight"] },
          { id: "open", label: "Open / chord", keys: ["Space", "Enter"] },
          { id: "flag", label: "Flag", keys: ["KeyF"] },
          { id: "chord", label: "Open around a number", keys: ["KeyD"] },
        ],
      },
    ],
    note: "Right-click or long-press flags too. Click the board first to use the keys.",
  },
  {
    gameId: "2048",
    groups: [
      {
        actions: [
          { id: "up", label: "Slide up", keys: ["ArrowUp", "KeyW"] },
          { id: "down", label: "Slide down", keys: ["ArrowDown", "KeyS"] },
          { id: "left", label: "Slide left", keys: ["ArrowLeft", "KeyA"] },
          { id: "right", label: "Slide right", keys: ["ArrowRight", "KeyD"] },
          { id: "undo", label: "Undo", keys: ["KeyZ"] },
        ],
      },
    ],
    note: "Or swipe on the board.",
  },
];

export const SHORTCUTS: KeyAction[] = [
  { id: "mute", label: "Mute / unmute everything", keys: ["KeyM"] },
  { id: "fullscreen", label: "Fullscreen on / off", keys: ["KeyF"] },
  { id: "close", label: "Close a window (and pause Whack-a-Mole)", keys: ["Escape"] },
];

const NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  Tab: "Tab",
  ShiftLeft: "Shift",
  ShiftRight: "Right Shift",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
};

/** "KeyA" → "A", "Digit1" → "1", "Numpad1" → "Num 1", "ArrowUp" → "↑". */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}
