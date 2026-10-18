/**
 * Stay night pricing. Missing seasons keep the legacy rule: every night uses the base rate.
 * When availabilityMode is "scheduled", a night outside every enabled season cannot be booked.
 * Overlapping seasons: the shortest window wins, then the later start date, then the id.
 * Add-ons (extra guests, discounts, extras) come from the check-in night's season.
 * Keep supabase/functions/_shared/stay-season-quote.ts identical.
 */

export type StayAvailabilityMode = 'open' | 'scheduled';

export type StaySeasonExtra = {
  id: string;
  name: string;
  description: string;
  price: number;
  charge: 'per_stay' | 'per_night' | 'per_guest' | 'per_guest_night';
  mandatory: boolean;
  requestOnly?: boolean;
  maxQuantity: number;
};

const EXTRA_CHARGES = new Set<StaySeasonExtra['charge']>(['per_stay', 'per_night', 'per_guest', 'per_guest_night']);

function normalizeSeasonExtras(raw: unknown): StaySeasonExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: StaySeasonExtra[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim().slice(0, 80) : '';
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const requestOnly = o.requestOnly === true;
    const charge = typeof o.charge === 'string' && EXTRA_CHARGES.has(o.charge as StaySeasonExtra['charge']) ? (o.charge as StaySeasonExtra['charge']) : null;
    const price = typeof o.price === 'number' && Number.isFinite(o.price) ? Math.round(o.price * 100) / 100 : null;
    if (!id || !name || !charge || price == null || price < 0 || price > 100000 || seen.has(id)) continue;
    if (!requestOnly && price <= 0) continue;
    seen.add(id);
    const maxQuantity = typeof o.maxQuantity === 'number' ? Math.floor(o.maxQuantity) : 1;
    out.push({
      id,
      name,
      description: typeof o.description === 'string' ? o.description.trim().slice(0, 160) : '',
      price,
      charge,
      mandatory: requestOnly ? false : o.mandatory === true,
      requestOnly,
      maxQuantity: maxQuantity >= 1 && maxQuantity <= 20 ? maxQuantity : 1,
    });
    if (out.length >= 12) break;
  }
  return out;
}

export type StaySeasonWindow = {
  id: string;
  name: string;
  start: string;
  end: string;
  enabled: boolean;
  nightlyPrice: number | null;
  minNights: number | null;
  /** Occupied nights cannot exceed this. Null means only the property minimum applies. */
  maxNights?: number | null;
  minGuests?: number | null;
  /** Cannot exceed the option's physical capacity. Null means the option maximum applies. */
  maxGuests?: number | null;
  checkIn?: string;
  checkOut?: string;
  cleaningFee?: number | null;
  /** Counted guests included in the nightly rate. Null means no extra-guest fee. */
  includedGuests?: number | null;
  extraGuestNightly?: number | null;
  /** Percent off the nightly total for 7 nights or more. Not combined with the monthly discount. */
  weeklyDiscountPercent?: number | null;
  /** Percent off the nightly total for 28 nights or more. Replaces the weekly discount. */
  monthlyDiscountPercent?: number | null;
  extras?: StaySeasonExtra[];
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
    const maxNights =
      typeof o.maxNights === 'number' && o.maxNights >= 1 ? Math.min(365, Math.floor(o.maxNights)) : null;
    const minGuests = typeof o.minGuests === 'number' && o.minGuests >= 1 ? Math.min(50, Math.floor(o.minGuests)) : null;
    const maxGuests = typeof o.maxGuests === 'number' && o.maxGuests >= 1 ? Math.min(50, Math.floor(o.maxGuests)) : null;
    const clock = (value: unknown) => (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim()) ? value.trim() : '');
    const cleaning =
      typeof o.cleaningFee === 'number' && o.cleaningFee >= 0 ? Math.round(o.cleaningFee * 100) / 100 : null;
    const percent = (value: unknown) =>
      typeof value === 'number' && value >= 1 ? Math.min(90, Math.floor(value)) : null;
    const extraNightly =
      typeof o.extraGuestNightly === 'number' && o.extraGuestNightly > 0
        ? Math.round(o.extraGuestNightly * 100) / 100
        : null;
    const extras = normalizeSeasonExtras(o.extras);
    out.push({
      id,
      name: typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '',
      start,
      end,
      enabled: o.enabled !== false,
      nightlyPrice: nightly,
      minNights,
      maxNights,
      minGuests,
      maxGuests: maxGuests != null && minGuests != null && maxGuests < minGuests ? minGuests : maxGuests,
      checkIn: clock(o.checkIn),
      checkOut: clock(o.checkOut),
      cleaningFee: cleaning,
      includedGuests: typeof o.includedGuests === 'number' && o.includedGuests >= 1 ? Math.min(50, Math.floor(o.includedGuests)) : null,
      extraGuestNightly: extraNightly,
      weeklyDiscountPercent: percent(o.weeklyDiscountPercent),
      monthlyDiscountPercent: percent(o.monthlyDiscountPercent),
      extras: extras.length > 0 ? extras : undefined,
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
}):
  | {
      ok: true;
      lodging: number;
      nightlyPrices: number[];
      minNights: number;
      maxNights: number | null;
      minGuests: number | null;
      maxGuests: number | null;
      cleaningFee: number | null;
      checkIn: string;
      includedGuests: number | null;
      extraGuestNightly: number | null;
      weeklyDiscountPercent: number | null;
      monthlyDiscountPercent: number | null;
      extras: StaySeasonExtra[];
    }
  | { ok: false; error: string } {
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
  return {
    ok: true,
    lodging,
    nightlyPrices: prices,
    minNights,
    maxNights: checkInSeason?.maxNights && checkInSeason.maxNights >= 1 ? checkInSeason.maxNights : null,
    minGuests: checkInSeason?.minGuests && checkInSeason.minGuests >= 1 ? checkInSeason.minGuests : null,
    maxGuests: checkInSeason?.maxGuests && checkInSeason.maxGuests >= 1 ? checkInSeason.maxGuests : null,
    cleaningFee: typeof checkInSeason?.cleaningFee === 'number' ? checkInSeason.cleaningFee : null,
    checkIn: checkInSeason?.checkIn && /^\d{2}:\d{2}$/.test(checkInSeason.checkIn) ? checkInSeason.checkIn : '',
    includedGuests: checkInSeason?.includedGuests ?? null,
    extraGuestNightly: checkInSeason?.extraGuestNightly ?? null,
    weeklyDiscountPercent: checkInSeason?.weeklyDiscountPercent ?? null,
    monthlyDiscountPercent: checkInSeason?.monthlyDiscountPercent ?? null,
    extras: checkInSeason?.extras ?? [],
  };
}
