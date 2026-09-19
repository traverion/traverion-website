/** Local calendar YYYY-MM-DD — not UTC (toISOString), so Partner Today matches the operator’s day. */
export function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Tomorrow in the operator’s local calendar. */
export function localYmdPlusDays(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localYmd(d);
}
