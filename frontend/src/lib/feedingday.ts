/** Compute the YYYY-MM-DD feeding-day key for a timestamp, given the anchor.
 * If the timestamp falls before the anchor on its calendar date, it belongs
 * to the previous feeding day. Mirrors backend feeding_day_for. */
export function feedingDayKey(ts: Date, anchorH: number, anchorM: number): string {
  const minutes = ts.getHours() * 60 + ts.getMinutes()
  const anchor = anchorH * 60 + anchorM
  const day = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate())
  if (minutes < anchor) day.setDate(day.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

/** Override-aware variant for feed records. */
export function feedingDayKeyOfFeed(
  f: { fed_at: string; feeding_day_override?: string | null },
  anchorH: number,
  anchorM: number,
): string {
  if (f.feeding_day_override) return f.feeding_day_override
  return feedingDayKey(new Date(f.fed_at), anchorH, anchorM)
}
