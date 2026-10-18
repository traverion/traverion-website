/**
 * Stay night pricing. Missing seasons keep the legacy rule: every night uses the base rate.
 * When availabilityMode is "scheduled", a night outside every enabled season cannot be booked.
 * Overlapping seasons: the shortest window wins, then the later start date, then the id.
 * Keep supabase/functions/_shared/stay-season-quote.ts identical.
 */

export type StayAvailabilityMode = 'open' | 'scheduled';

export type StaySeasonWindow = {
  id: string;
  name: string;
  start: string;
  end: string;
  enabled: boolean;
  nightlyPrice: number | null;
  minNights: number | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function addStayDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function stayNightDates(checkIn: string, nights: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < nights; i += 1) out.push(addStayDays(checkIn, i));
  return out;
}

function daySpan(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
}

export function normalizeStaySeasons(raw: unknown): StaySeasonWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: StaySeasonWindow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim().slice(0, 80) : '';
    const start = typeof o.start === 'string' ? o.start.trim() : '';
    const end = typeof o.end === 'string' ? o.end.trim() : '';
    if (!id || !ISO.test(start) || !ISO.test(end) || end < start) continue;
    const nightly =
      typeof o.nightlyPrice === 'number' && o.nightlyPrice > 0 ? Math.round(o.nightlyPrice * 100) / 100 : null;
    const minNights =
      typeof o.minNights === 'number' && o.minNights >= 1 ? Math.min(365, Math.floor(o.minNights)) : null;
    out.push({
      id,
      name: typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '',
      start,
      end,
      enabled: o.enabled !== false,
      nightlyPrice: nightly,
      minNights,
    });
    if (out.length >= 24) break;
  }
  return out;
}

function coveringSeason(night: string, seasons: readonly StaySeasonWindow[]): StaySeasonWindow | null {
  const hits = seasons.filter((s) => s.enabled && s.start <= night && night <= s.end);
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const span = daySpan(a.start, a.end) - daySpan(b.start, b.end);
    if (span !== 0) return span;
    if (a.start !== b.start) return a.start < b.start ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return hits[0] ?? null;
}

export function quoteStayLodging(input: {
  checkIn: string;
  nights: number;
  baseNightly: number;
  baseMinNights: number;
  availabilityMode?: StayAvailabilityMode | null;
  seasons?: readonly StaySeasonWindow[] | null;
}): { ok: true; lodging: number; nightlyPrices: number[]; minNights: number } | { ok: false; error: string } {
  const seasons = input.seasons ?? [];
  const mode: StayAvailabilityMode = input.availabilityMode === 'scheduled' ? 'scheduled' : 'open';
  const nights = stayNightDates(input.checkIn, input.nights);
  const prices: number[] = [];
  for (const night of nights) {
    const season = coveringSeason(night, seasons);
    if (!season && mode === 'scheduled') {
      return { ok: false, error: 'These dates are not open. Choose nights inside an availability period.' };
    }
    const price = season?.nightlyPrice && season.nightlyPrice > 0 ? season.nightlyPrice : input.baseNightly;
    if (!(price > 0)) return { ok: false, error: 'This stay does not have a nightly price yet.' };
    prices.push(Math.round(price * 100) / 100);
  }
  const checkInSeason = coveringSeason(input.checkIn, seasons);
  const minNights = Math.max(
    input.baseMinNights >= 1 ? Math.floor(input.baseMinNights) : 1,
    checkInSeason?.minNights && checkInSeason.minNights >= 1 ? checkInSeason.minNights : 1
  );
  const lodging = Math.round(prices.reduce((sum, n) => sum + n, 0) * 100) / 100;
  return { ok: true, lodging, nightlyPrices: prices, minNights };
}
