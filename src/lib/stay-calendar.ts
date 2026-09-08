import { addCalendarDays } from './stayOccupancy';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function formatStayNightHuman(iso: string): string {
  if (!ISO.test(iso)) return iso;
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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

export function stayNightState(params: {
  iso: string;
  todayIso: string;
  occupied: Set<string>;
  checkIn: string;
  checkOut: string;
}): 'past' | 'occupied' | 'selected' | 'checkout' | 'available' {
  if (params.iso < params.todayIso) return 'past';
  if (params.occupied.has(params.iso)) return 'occupied';
  if (params.checkIn && params.checkOut && params.iso >= params.checkIn && params.iso < params.checkOut) {
    return 'selected';
  }
  if (params.checkOut && params.iso === params.checkOut) return 'checkout';
  if (params.checkIn && !params.checkOut && params.iso === params.checkIn) return 'selected';
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
