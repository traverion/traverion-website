import { addCalendarDays, STAY_MAX_OCCUPIED_NIGHTS } from './stayOccupancy';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function formatStayNightHuman(iso: string): string {
  if (!ISO.test(iso)) return iso;
  // UTC noon keeps the civil day stable across browser timezones.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatOccupiedNightRanges(nights: string[]): string {
  if (nights.length === 0) return '';
  const sorted = [...nights].sort();
  const chunks: string[][] = [];
  let cur: string[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = cur[cur.length - 1]!;
    if (addCalendarDays(prev, 1) === sorted[i]) cur.push(sorted[i]!);
    else {
      chunks.push(cur);
      cur = [sorted[i]!];
    }
  }
  chunks.push(cur);
  return chunks
    .map((c) => {
      if (c.length === 1) return formatStayNightHuman(c[0]!);
      return `${formatStayNightHuman(c[0]!)} – ${formatStayNightHuman(c[c.length - 1]!)}`;
    })
    .join('; ');
}

/**
 * Phase 1512: Availability copy should list nights that still affect booking,
 * not historical stays that already ended. Calendar still uses full occupancy.
 */
export function upcomingOccupiedNights(nights: string[], todayIso: string): string[] {
  const today = (todayIso ?? '').trim();
  const valid = nights.filter((n) => ISO.test((n ?? '').trim())).map((n) => n.trim());
  if (!ISO.test(today)) return [...valid].sort();
  return valid.filter((n) => n >= today).sort();
}

/** Earliest civil check-out for a check-in given minimum nights (exclusive end). */
export function earliestStayCheckoutIso(checkIn: string, minNights: number): string {
  const n = Math.max(1, Math.floor(Number(minNights)) || 1);
  return addCalendarDays(checkIn, n);
}

/** Latest civil check-out for a check-in given the hard occupied-night cap. */
export function latestStayCheckoutIso(checkIn: string, maxNights: number = STAY_MAX_OCCUPIED_NIGHTS): string {
  const n = Math.max(1, Math.min(STAY_MAX_OCCUPIED_NIGHTS, Math.floor(Number(maxNights)) || 1));
  return addCalendarDays(checkIn, n);
}

export function stayNightState(params: {
  iso: string;
  todayIso: string;
  occupied: Set<string>;
  checkIn: string;
  checkOut: string;
  /**
   * When selecting a new check-in (no open check-in, or restarting a complete range),
   * dates that fail booking notice/cutoff are closed. Checkout of an earlier check-in
   * must remain selectable even when today's new check-in is closed.
   */
  checkInClosed?: (iso: string) => boolean;
  /** Minimum nights once check-in is chosen — nights before earliest checkout are closed. */
  minNights?: number;
  /** Optional hard max nights while picking checkout (defaults to STAY_MAX_OCCUPIED_NIGHTS). */
  maxNights?: number;
}): 'past' | 'occupied' | 'selected' | 'checkout' | 'available' {
  if (params.iso < params.todayIso) return 'past';
  if (params.occupied.has(params.iso)) return 'occupied';
  if (params.checkIn && params.checkOut && params.iso >= params.checkIn && params.iso < params.checkOut) {
    return 'selected';
  }
  if (params.checkOut && params.iso === params.checkOut) return 'checkout';
  if (params.checkIn && !params.checkOut && params.iso === params.checkIn) return 'selected';
  const pickingCheckIn = !params.checkIn || Boolean(params.checkIn && params.checkOut);
  if (pickingCheckIn && params.checkInClosed?.(params.iso)) return 'past';
  // Picking check-out: never treat check-in (or nights before min stay) as a valid checkout.
  if (params.checkIn && !params.checkOut && params.iso > params.checkIn) {
    const earliest = earliestStayCheckoutIso(params.checkIn, params.minNights ?? 1);
    if (params.iso < earliest) return 'past';
    const latest = latestStayCheckoutIso(params.checkIn, params.maxNights);
    if (params.iso > latest) return 'past';
  }
  return 'available';
}

export function monthGrid(year: number, monthIndex0: number): (string | null)[] {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = new Date(Date.UTC(year, monthIndex0, d)).toISOString().slice(0, 10);
    cells.push(iso);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
