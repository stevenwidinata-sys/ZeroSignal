/**
 * Leaderboard weeks run Monday 00:00 → Monday 00:00 WIB (UTC+7), matching
 * backend/src/daily.rs. Monday 00:00 WIB is Sunday 17:00 UTC.
 */
const WIB_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** When the current week ends (next Monday 00:00 WIB), as a Date. */
export function nextWeekReset(now: Date): Date {
  const wib = new Date(now.getTime() + WIB_MS);
  const daysFromMonday = (wib.getUTCDay() + 6) % 7; // Monday = 0
  const mondayWib = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - daysFromMonday * DAY_MS;
  return new Date(mondayWib + 7 * DAY_MS - WIB_MS);
}

/** 3d 4h · 5h 12m · 9m */
export function formatCountdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mins}m`;
  return `${mins}m`;
}
