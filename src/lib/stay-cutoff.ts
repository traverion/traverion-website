/** Booking notice stored as minutes. Checkout reads the same minute count. */

export type StayCutoffUnit = 'minutes' | 'hours' | 'days';

const MINUTE_AMOUNTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;
const HOUR_AMOUNTS = Array.from({ length: 24 }, (_, index) => index + 1);
const DAY_AMOUNTS = [1, 2, 3, 4, 5, 6, 7] as const;

export function stayCutoffAmounts(unit: StayCutoffUnit): readonly number[] {
  if (unit === 'minutes') return MINUTE_AMOUNTS;
  if (unit === 'hours') return HOUR_AMOUNTS;
  return DAY_AMOUNTS;
}

export function stayCutoffToMinutes(unit: StayCutoffUnit, amount: number): number {
  const allowed = stayCutoffAmounts(unit);
  const next = allowed.includes(amount) ? amount : allowed[0];
  if (unit === 'minutes') return next;
  if (unit === 'hours') return next * 60;
  return next * 24 * 60;
}

/** Read a saved minute count without treating 5 hours as 5 minutes. */
export function stayCutoffFromMinutes(minutes: number | null | undefined): { unit: StayCutoffUnit; amount: number } {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  if (value > 0 && value % (24 * 60) === 0 && value / (24 * 60) <= 7) {
    return { unit: 'days', amount: value / (24 * 60) };
  }
  if (value > 0 && value % 60 === 0 && value / 60 <= 24) {
    return { unit: 'hours', amount: value / 60 };
  }
  if ((MINUTE_AMOUNTS as readonly number[]).includes(value)) return { unit: 'minutes', amount: value };
  return { unit: 'hours', amount: 1 };
}

export function stayCutoffSummary(minutes: number | null | undefined): string {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  if (value <= 0) return 'Reservations can be made until check-in.';
  const parsed = stayCutoffFromMinutes(value);
  const noun = parsed.unit === 'minutes' ? 'minutes' : parsed.unit === 'hours' ? (parsed.amount === 1 ? 'hour' : 'hours') : parsed.amount === 1 ? 'day' : 'days';
  return `Reservations close ${parsed.amount} ${noun} before check-in.`;
}
