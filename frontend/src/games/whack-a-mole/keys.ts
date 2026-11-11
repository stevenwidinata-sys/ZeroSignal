/**
 * Keyboard layout. Uses `KeyboardEvent.code` (physical key), so it works the
 * same on any keyboard language.
 *  3×3: numpad layout (7 8 9 / 4 5 6 / 1 2 3), the same on the digit row,
 *       or Q W E / A S D / Z X C.
 *  4×4: 1 2 3 4 / Q W E R / A S D F / Z X C V.
 */
const ROWS3 = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];
const LETTERS3 = [
  ["Q", "W", "E"],
  ["A", "S", "D"],
  ["Z", "X", "C"],
];
const ROWS4 = [
  ["1", "2", "3", "4"],
  ["Q", "W", "E", "R"],
  ["A", "S", "D", "F"],
  ["Z", "X", "C", "V"],
];

function codeFor(label: string): string[] {
  return /\d/.test(label) ? [`Digit${label}`, `Numpad${label}`] : [`Key${label}`];
}

function build(rows: string[][][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const layout of rows) {
    layout.forEach((row, r) =>
      row.forEach((label, c) => {
        for (const code of codeFor(label)) m.set(code, r * row.length + c);
      }),
    );
  }
  return m;
}

const MAP3 = build([ROWS3, LETTERS3]);
const MAP4 = build([ROWS4]);

/** Hole index for a key, or null. */
export function holeForKey(code: string, grid: 3 | 4): number | null {
  return (grid === 3 ? MAP3 : MAP4).get(code) ?? null;
}

/** Label printed in a hole (first layout). */
export function keyLabel(hole: number, grid: 3 | 4): string {
  const rows = grid === 3 ? ROWS3 : ROWS4;
  return rows[Math.floor(hole / grid)][hole % grid];
}
