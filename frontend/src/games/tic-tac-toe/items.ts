/**
 * Boards and faces: the same JSON the backend uses
 * (shared/tic_tac_toe_items.json). The server decides ownership and prices.
 */
import raw from "../../../../shared/tic_tac_toe_items.json";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface BoardArt {
  bg: string;
  cell: string;
  line: string;
  glow: string | null;
}

export type FaceArt =
  | { kind: "x"; color: string }
  | { kind: "o"; color: string }
  | { kind: "photo" }
  | { kind: "avatar" }
  | { kind: "emoji"; value: string }
  | { kind: "chip"; value: string };

export interface BoardItem {
  id: string;
  name: string;
  rarity: Rarity;
  price: number | null;
  art: BoardArt;
}

export interface FaceItem {
  id: string;
  name: string;
  rarity: Rarity;
  price: number | null;
  art: FaceArt;
}

export const BOARDS = raw.boards as BoardItem[];
export const FACES = raw.faces as FaceItem[];

export function findBoard(id: string): BoardItem {
  return BOARDS.find((b) => b.id === id) ?? BOARDS[0];
}

export function findFace(id: string): FaceItem {
  return FACES.find((f) => f.id === id) ?? FACES[0];
}

/** Server spin results use keys like "board:neon" / "face:pig". */
export function findByKey(key: string): { kind: "board"; item: BoardItem } | { kind: "face"; item: FaceItem } | null {
  const [kind, id] = key.split(":");
  if (kind === "board") {
    const item = BOARDS.find((b) => b.id === id);
    return item ? { kind, item } : null;
  }
  if (kind === "face") {
    const item = FACES.find((f) => f.id === id);
    return item ? { kind, item } : null;
  }
  return null;
}

/** A face for the other side that never matches yours. */
export function opponentFace(mine: string, preferred = "o"): string {
  if (preferred !== mine) return preferred;
  return mine === "o" ? "x" : "o";
}
