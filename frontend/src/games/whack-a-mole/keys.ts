/**
 * Whack-a-Mole keys come from the shared keymap (Settings → Controls), so
 * players can change them. Defaults (KeyboardEvent.code, any keyboard
 * language):
 *  3×3: numpad layout (7 8 9 / 4 5 6 / 1 2 3) on digits and numpad, or
 *       Q W E / A S D / Z X C.
 *  4×4: 1 2 3 4 / Q W E R / A S D F / Z X C V.
 */
import { actionFor, keyLabel as codeLabel, keysFor, type KeyOverrides } from "../../platform/keymap";

const GAME = "whack-a-mole";
const actionId = (hole: number, grid: 3 | 4) => (grid === 3 ? `hole${hole + 1}` : `big${hole + 1}`);

/** Hole index for a key, or null. */
export function holeForKey(code: string, grid: 3 | 4, overrides: KeyOverrides = {}): number | null {
  const id = actionFor(GAME, code, overrides, String(grid));
  const m = id && /^(?:hole|big)(\d+)$/.exec(id);
  return m ? Number(m[1]) - 1 : null;
}

/** True for the pause / resume key. */
export function isPauseKey(code: string, overrides: KeyOverrides = {}): boolean {
  return actionFor(GAME, code, overrides) === "pause";
}

/** Label printed in a hole: its first key ("7", "Q", "Num 7"). */
export function keyLabel(hole: number, grid: 3 | 4, overrides: KeyOverrides = {}): string {
  const first = keysFor(GAME, actionId(hole, grid), overrides)[0];
  return first ? codeLabel(first) : "";
}
