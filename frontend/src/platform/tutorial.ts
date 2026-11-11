/** Which game tutorials this browser has already seen (localStorage). */
const KEY = "zerosignal_tutorials_seen";

export function parseSeen(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function hasSeen(gameId: string): boolean {
  try {
    return parseSeen(localStorage.getItem(KEY)).includes(gameId);
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}

export function markSeen(gameId: string): void {
  try {
    const seen = parseSeen(localStorage.getItem(KEY));
    if (!seen.includes(gameId)) localStorage.setItem(KEY, JSON.stringify([...seen, gameId]));
  } catch {
    /* storage may be blocked */
  }
}

/** Show every tutorial again on the next visit. */
export function resetSeen(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage may be blocked */
  }
}
