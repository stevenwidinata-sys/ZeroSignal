/**
 * Every game's keyboard controls in one place. Keys are
 * `KeyboardEvent.code` values (physical keys), so they work the same on any
 * keyboard language. Players can change them in Settings → Controls; their
 * changes are stored in settings (`keys`) as overrides of these defaults.
 */
import { useSettings } from "../store/settings";

export interface KeyAction {
  id: string;
  label: string;
  /** Default keys (KeyboardEvent.code). */
  keys: string[];
}

export interface KeyGroup {
  /** Optional group title inside a game (e.g. "3×3 board"). */
  title?: string;
  /**
   * Groups with a context are only active in that situation (Whack-a-Mole
   * "3" or "4" grid); groups without one are always active.
   */
  context?: string;
  actions: KeyAction[];
}

export interface GameKeymap {
  gameId: string;
  groups: KeyGroup[];
  /** Controls that aren't keys (mouse, touch). */
  note?: string;
}

/** Player overrides: "gameId.actionId" → keys. */
export type KeyOverrides = Record<string, string[]>;

const digit = (d: string) => (/\d/.test(d) ? [`Digit${d}`, `Numpad${d}`] : [`Key${d}`]);

/** 3×3: numpad layout or QWE/ASD/ZXC; 4×4: 1234/QWER/ASDF/ZXCV. */
const NUM3 = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
const LET3 = ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"];
const KEY4 = ["1", "2", "3", "4", "Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
const POS3 = ["Top left", "Top middle", "Top right", "Middle left", "Center", "Middle right", "Bottom left", "Bottom middle", "Bottom right"];

export const KEYMAPS: GameKeymap[] = [
  {
    gameId: "angry-bird",
    groups: [{ actions: [{ id: "cancel", label: "Cancel aiming", keys: ["Escape"] }] }],
    note: "Drag the bird back with the mouse or a finger, then let go to launch.",
  },
  {
    gameId: "connect-four",
    groups: [
      {
        actions: Array.from({ length: 7 }, (_, i) => ({
          id: `col${i + 1}`,
          label: `Drop in column ${i + 1}`,
          keys: digit(String(i + 1)),
        })),
      },
    ],
    note: "Or click a column.",
  },
  {
    gameId: "tic-tac-toe",
    groups: [
      {
        actions: NUM3.map((d, i) => ({ id: `cell${i + 1}`, label: POS3[i], keys: [...digit(d), ...digit(LET3[i])] })),
      },
    ],
    note: "Keys follow the numpad layout: 7 8 9 is the top row. Or click a square.",
  },
  {
    gameId: "whack-a-mole",
    groups: [
      { actions: [{ id: "pause", label: "Pause / resume", keys: ["Escape", "KeyP"] }] },
      {
        title: "3×3 board",
        context: "3",
        actions: NUM3.map((d, i) => ({ id: `hole${i + 1}`, label: `Hole ${i + 1}`, keys: [...digit(d), ...digit(LET3[i])] })),
      },
      {
        title: "4×4 board",
        context: "4",
        actions: KEY4.map((d, i) => ({ id: `big${i + 1}`, label: `Hole ${i + 1}`, keys: digit(d) })),
      },
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

/** Most keys one action can have. */
export const MAX_KEYS = 4;

export function findKeymap(gameId: string): GameKeymap | undefined {
  return KEYMAPS.find((m) => m.gameId === gameId);
}

export const overrideId = (gameId: string, actionId: string) => `${gameId}.${actionId}`;

function findAction(gameId: string, actionId: string): KeyAction | undefined {
  return findKeymap(gameId)?.groups.flatMap((g) => g.actions).find((a) => a.id === actionId);
}

/** The keys an action uses now (player's choice, else the default). */
export function keysFor(gameId: string, actionId: string, overrides: KeyOverrides): string[] {
  return overrides[overrideId(gameId, actionId)] ?? findAction(gameId, actionId)?.keys ?? [];
}

function activeGroups(m: GameKeymap, context?: string): KeyGroup[] {
  return m.groups.filter((g) => !g.context || g.context === context);
}

/** Which action a key triggers in a game (and context), or null. */
export function actionFor(gameId: string, code: string, overrides: KeyOverrides, context?: string): string | null {
  const m = findKeymap(gameId);
  if (!m) return null;
  for (const g of activeGroups(m, context)) {
    for (const a of g.actions) if (keysFor(gameId, a.id, overrides).includes(code)) return a.id;
  }
  return null;
}

/** Same as `actionFor`, with the player's current settings (for key handlers). */
export function currentAction(gameId: string, code: string, context?: string): string | null {
  return actionFor(gameId, code, useSettings.getState().keys, context);
}

export interface Conflict {
  key: string;
  actions: string[];
}

/** Keys used by more than one action that can be active at the same time. */
export function conflicts(gameId: string, overrides: KeyOverrides): Conflict[] {
  const m = findKeymap(gameId);
  if (!m) return [];
  const contexts = [undefined, ...new Set(m.groups.map((g) => g.context).filter(Boolean))] as (string | undefined)[];
  const found = new Map<string, Set<string>>();
  for (const ctx of contexts) {
    const byKey = new Map<string, string[]>();
    for (const g of ctx === undefined ? m.groups.filter((x) => !x.context) : activeGroups(m, ctx)) {
      for (const a of g.actions) {
        for (const k of keysFor(gameId, a.id, overrides)) byKey.set(k, [...(byKey.get(k) ?? []), a.label]);
      }
    }
    for (const [k, labels] of byKey) {
      if (labels.length > 1) found.set(k, new Set([...(found.get(k) ?? []), ...labels]));
    }
  }
  return [...found].map(([key, s]) => ({ key, actions: [...s] }));
}

/** Overrides with one game's keys put back to their defaults. */
export function resetGame(gameId: string, overrides: KeyOverrides): KeyOverrides {
  return Object.fromEntries(Object.entries(overrides).filter(([k]) => !k.startsWith(`${gameId}.`)));
}

/** Overrides after setting an action's keys (dropping it when it equals the default). */
export function withKeys(gameId: string, actionId: string, keys: string[], overrides: KeyOverrides): KeyOverrides {
  const id = overrideId(gameId, actionId);
  const next = { ...overrides };
  const def = findAction(gameId, actionId)?.keys ?? [];
  const clean = [...new Set(keys)].slice(0, MAX_KEYS);
  if (clean.length === def.length && clean.every((k, i) => k === def[i])) delete next[id];
  else next[id] = clean;
  return next;
}

const NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "Num Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  Tab: "Tab",
  ShiftLeft: "Shift",
  ShiftRight: "Right Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Right Ctrl",
  AltLeft: "Alt",
  AltRight: "Right Alt",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
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

/** Keys that can't be bound (Tab moves focus; Esc cancels choosing). */
export function canBind(code: string): boolean {
  return /^[A-Za-z0-9]{1,24}$/.test(code) && code !== "Tab" && code !== "Escape";
}
