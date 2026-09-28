/**
 * Shared traveler marketplace browse helpers (search, filters, sort).
 * Filter predicates only use fields that already exist on listings — never invented inventory.
 */
import { durationToMinutes } from '../data/listings';
import { catalogHeadlineAmount } from './discount-display';
import { listingIsFamily } from './inventory';
import { listingTourMatchesBrowseTag } from './listingTruth';
import { formatStayAmenityLabel, stayAmenityDisplayList } from './stay-amenities';
import { addCalendarDays } from './stayOccupancy';
import { addCalendarDaysYmd, ymdInTimeZone } from './booking-lifecycle-calendar';
import { materializedBookingOptions, parseListingExtras } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';

/**
 * Destination-unaware browse date floor (Phase 1095).
 * Do not use browser-local “today”: a traveler west of UTC would block an
 * experience-local today that is still bookable in Rovaniemi, and a traveler
 * east of UTC would advertise a day that has already ended in destination TZ.
 * Floor at UTC yesterday so any listing still on its local “today” remains selectable;
 * PDP/Pay continue to enforce experienceTodayIsoForListing.
 */
export function marketplaceSearchMinSelectableIso(nowMs: number = Date.now()): string {
  const utcToday = ymdInTimeZone(nowMs, 'UTC');
  if (!utcToday) {
    const d = new Date(nowMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return addCalendarDaysYmd(utcToday, -1) ?? utcToday;
}

export type MarketplaceSearchFamily = 'tours' | 'stays';

export type MarketplaceSearchValues = {
  where: string;
  date: string;
  checkout: string;
  guests: string;
};

export type PriceChipId = 'all' | 'under100' | '100-500' | '500-1000' | '1000plus';
export type RatingFilterId = 'all' | '4' | '45';
export type DurationFilterId = 'all' | 'under3' | '3to6' | '6plus';
export type MarketplaceSortOption = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'duration';

export type DestOption = { id: string; label: string; type: 'world' | 'region' | 'city' };

export const MARKETPLACE_LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  fi: 'Finnish',
  sv: 'Swedish',
  nl: 'Dutch',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
};

export const RATING_FILTER_CHIPS: { id: RatingFilterId; label: string }[] = [
  { id: 'all', label: 'Any rating' },
  { id: '4', label: '4.0+' },
  { id: '45', label: '4.5+' },
];

export const DURATION_FILTER_CHIPS: { id: DurationFilterId; label: string }[] = [
  { id: 'all', label: 'Any duration' },
  { id: 'under3', label: 'Under 3 hours' },
  { id: '3to6', label: '3–6 hours' },
  { id: '6plus', label: '6+ hours' },
];

const PRICE_CHIP_IDS: readonly PriceChipId[] = ['all', 'under100', '100-500', '500-1000', '1000plus'];
const RATING_IDS: readonly RatingFilterId[] = ['all', '4', '45'];
const DURATION_IDS: readonly DurationFilterId[] = ['all', 'under3', '3to6', '6plus'];
const SORT_IDS: readonly MarketplaceSortOption[] = [
  'recommended',
  'price-asc',
  'price-desc',
  'rating',
  'duration',
];

export function parsePriceChipId(raw: string | null | undefined): PriceChipId {
  return PRICE_CHIP_IDS.includes(raw as PriceChipId) ? (raw as PriceChipId) : 'all';
}

export function parseRatingFilterId(raw: string | null | undefined): RatingFilterId {
  return RATING_IDS.includes(raw as RatingFilterId) ? (raw as RatingFilterId) : 'all';
}

export function parseDurationFilterId(raw: string | null | undefined): DurationFilterId {
  return DURATION_IDS.includes(raw as DurationFilterId) ? (raw as DurationFilterId) : 'all';
}

export function parseMarketplaceSort(raw: string | null | undefined): MarketplaceSortOption {
  return SORT_IDS.includes(raw as MarketplaceSortOption) ? (raw as MarketplaceSortOption) : 'recommended';
}

/**
 * Price-chip labels used to be hardcoded with a € sign, but listings are genuinely
 * priced in any of SUPPORTED_CURRENCIES — a hardcoded € both mislabels a non-EUR
 * catalog and silently mixes magnitudes from different currencies into the same bucket.
 * When every visible listing shares one real currency we label chips in that currency;
 * otherwise (no invented conversion rate) we fall back to plain numbers so nothing here
 * claims a currency it did not earn.
 */
export function buildPriceChips(
  currency: string | null,
  formatMoney: (amount: number, currency: string) => string
): { id: PriceChipId; label: string }[] {
  if (currency) {
    return [
      { id: 'all', label: 'Any price' },
      { id: 'under100', label: `Under ${formatMoney(100, currency)}` },
      { id: '100-500', label: `${formatMoney(100, currency)} – ${formatMoney(500, currency)}` },
      { id: '500-1000', label: `${formatMoney(500, currency)} – ${formatMoney(1000, currency)}` },
      { id: '1000plus', label: `${formatMoney(1000, currency)}+` },
    ];
  }
  return [
    { id: 'all', label: 'Any price' },
    { id: 'under100', label: 'Under 100' },
    { id: '100-500', label: '100 – 500' },
    { id: '500-1000', label: '500 – 1,000' },
    { id: '1000plus', label: '1,000+' },
  ];
}

export function matchesPriceChip(amount: number, chip: PriceChipId): boolean {
  if (chip === 'all') return true;
  if (chip === 'under100') return amount < 100;
  if (chip === '100-500') return amount >= 100 && amount < 500;
  if (chip === '500-1000') return amount >= 500 && amount <= 1000;
  return amount > 1000;
}

export function matchesRatingFilter(score: number | null, filter: RatingFilterId): boolean {
  if (filter === 'all') return true;
  if (score == null) return false;
  if (filter === '45') return score >= 4.5;
  return score >= 4;
}

export function matchesDurationFilter(duration: string, filter: DurationFilterId): boolean {
  if (filter === 'all') return true;
  const minutes = durationToMinutes(duration);
  if (minutes <= 0) return false;
  if (filter === 'under3') return minutes < 180;
  if (filter === '3to6') return minutes >= 180 && minutes < 360;
  return minutes >= 360;
}

export function catalogHasParseableDurations(listings: { duration?: string }[]): boolean {
  return listings.some((l) => durationToMinutes(l.duration || '') > 0);
}

export function languageLabel(code: string): string {
  const key = code.trim().toLowerCase();
  if (!key || key === 'other') return '';
  return MARKETPLACE_LANGUAGE_LABELS[key] ?? code.trim();
}

export function listingLanguageCodes(tour: TourPackage): string[] {
  const extras = parseListingExtras(tour.listingExtras);
  const raw = [tour.experienceLanguage, ...(extras.additionalLanguages ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const key = (item ?? '').trim().toLowerCase();
    if (!key || key === 'other' || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function collectTourLanguages(listings: TourPackage[]): { id: string; label: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const tour of listings) {
    for (const code of listingLanguageCodes(tour)) {
      if (seen.has(code)) continue;
      const label = languageLabel(code);
      if (!label) continue;
      seen.add(code);
      out.push({ id: code, label });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function stayNightlyAmount(tour: TourPackage): number {
  const extras = parseListingExtras(tour.listingExtras);
  const nightly = extras.stay?.nightlyPriceUsd;
  if (typeof nightly === 'number' && nightly > 0) return nightly;
  return catalogHeadlineAmount(tour);
}

export function listingBrowseAmount(tour: TourPackage): number {
  return listingIsFamily(tour, 'stay') ? stayNightlyAmount(tour) : catalogHeadlineAmount(tour);
}

export function collectStayPropertyTypes(listings: TourPackage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const listing of listings) {
    const type = parseListingExtras(listing.listingExtras).stay?.propertyType?.trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(type);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function collectStayAmenities(listings: TourPackage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const listing of listings) {
    for (const label of stayAmenityDisplayList(parseListingExtras(listing.listingExtras).stay?.amenities)) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function stayHasAmenity(tour: TourPackage, amenityLabel: string): boolean {
  const want = formatStayAmenityLabel(amenityLabel).toLowerCase();
  if (!want) return false;
  const have = stayAmenityDisplayList(parseListingExtras(tour.listingExtras).stay?.amenities);
  return have.some((item) => item.toLowerCase() === want);
}

export function matchesDestination(tour: TourPackage, destId: string, destinationOptions: DestOption[]): boolean {
  if (destId === 'all' || !destId) return true;
  const opt = destinationOptions.find((d) => d.id === destId);
  // Phase 1363: orphan URL/chip ids must fail closed — returning true showed the full catalog
  // while Applied filters still claimed a destination (1275 season-live chips).
  if (!opt) return false;
  if (opt.type === 'region') return (tour.country?.toLowerCase() ?? '') === opt.label.toLowerCase();
  if (opt.type === 'city') {
    const cityNorm = (tour.city ?? '').toLowerCase().replace(/\s+/g, '-');
    const idNorm = destId.toLowerCase().replace(/\s+/g, '-');
    return cityNorm === idNorm || (tour.city?.toLowerCase() ?? '') === opt.label.toLowerCase();
  }
  return true;
}

export function listingIsPrivateOnly(tour: TourPackage): boolean {
  const opts = materializedBookingOptions(parseListingExtras(tour.listingExtras).bookingOptions);
  return opts.length > 0 && opts.every((o) => Boolean(o.isPrivate));
}

export function nextStayDatePatch(
  current: Pick<MarketplaceSearchValues, 'date' | 'checkout'>,
  nextCheckIn: string
): Partial<MarketplaceSearchValues> {
  const patch: Partial<MarketplaceSearchValues> = { date: nextCheckIn };
  if (current.checkout && nextCheckIn && current.checkout <= nextCheckIn) {
    patch.checkout = addCalendarDays(nextCheckIn, 1);
  }
  return patch;
}

export function catalogSharedCurrency(listings: TourPackage[], normalizeCurrency: (raw?: string) => string): string | null {
  if (listings.length === 0) return null;
  const codes = new Set(listings.map((t) => normalizeCurrency(t.price?.currency)));
  return codes.size === 1 ? [...codes][0] : null;
}

export type TourCatalogFilterInput = {
  q: string;
  destinationId: string;
  destinationOptions: DestOption[];
  tags: string[];
  price: PriceChipId;
  date: string;
  guests: string;
  privateOnly: boolean;
  rating: RatingFilterId;
  duration: DurationFilterId;
  language: string;
  ratingScore: number | null;
  /** Phase 1223: null = unknown capacity — guest filter fails closed. */
  partyMax: number | null;
  runsOnDate: boolean;
};

export function tourMatchesCatalogFilters(tour: TourPackage, input: TourCatalogFilterInput): boolean {
  const q = input.q.trim().toLowerCase();
  const matchesSearch =
    !q ||
    tour.title.toLowerCase().includes(q) ||
    (tour.destination && tour.destination.toLowerCase().includes(q)) ||
    (tour.city && tour.city.toLowerCase().includes(q)) ||
    (tour.country && tour.country.toLowerCase().includes(q));
  const matchesDest = matchesDestination(tour, input.destinationId, input.destinationOptions);
  const matchesTag =
    input.tags.length === 0 ||
    input.tags.every((tagId) => listingTourMatchesBrowseTag(tour, tagId));
  const matchesPrice = matchesPriceChip(listingBrowseAmount(tour), input.price);
  const matchesDate = !input.date || input.runsOnDate;
  const guestCount = Number.parseInt(input.guests, 10);
  const matchesGuests =
    !input.guests ||
    !Number.isFinite(guestCount) ||
    guestCount < 1 ||
    (input.partyMax != null && guestCount <= input.partyMax);
  const matchesPrivate = !input.privateOnly || listingIsPrivateOnly(tour);
  const matchesRating = matchesRatingFilter(input.ratingScore, input.rating);
  const matchesDuration = matchesDurationFilter(tour.duration || '', input.duration);
  const lang = input.language.trim().toLowerCase();
  const matchesLanguage = !lang || lang === 'all' || listingLanguageCodes(tour).includes(lang);
  return Boolean(
    matchesSearch &&
      matchesDest &&
      matchesTag &&
      matchesPrice &&
      matchesDate &&
      matchesGuests &&
      matchesPrivate &&
      matchesRating &&
      matchesDuration &&
      matchesLanguage
  );
}

export type StayCatalogFilterInput = {
  q: string;
  guests: string;
  propertyType: string;
  price: PriceChipId;
  amenities: string[];
  rating: RatingFilterId;
  ratingScore: number | null;
};

export function stayMatchesCatalogFilters(tour: TourPackage, input: StayCatalogFilterInput): boolean {
  const query = input.q.trim().toLowerCase();
  if (query) {
    const hay = `${tour.title} ${tour.city ?? ''} ${tour.country ?? ''} ${tour.destination}`.toLowerCase();
    if (!hay.includes(query)) return false;
  }
  const extras = parseListingExtras(tour.listingExtras);
  const maxG = extras.stay?.maxGuests;
  const guestN = Number.parseInt(input.guests, 10);
  // Phase 1220: guest filter fail-closed when capacity unknown (StayDetails/quote 1216–1217 parity).
  if (Number.isFinite(guestN) && guestN > 0) {
    if (typeof maxG !== 'number' || !Number.isFinite(maxG) || maxG < 1) return false;
    if (guestN > maxG) return false;
  }
  const wantType = input.propertyType.trim().toLowerCase();
  if (wantType && wantType !== 'all') {
    const have = extras.stay?.propertyType?.trim().toLowerCase() ?? '';
    if (have !== wantType) return false;
  }
  if (!matchesPriceChip(stayNightlyAmount(tour), input.price)) return false;
  if (input.amenities.some((amenity) => !stayHasAmenity(tour, amenity))) return false;
  return matchesRatingFilter(input.ratingScore, input.rating);
}

export const MARKETPLACE_GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5';

/** Denser homepage discovery grids — photography preserved, more results per viewport. */
export const HOME_DISCOVERY_GRID_CLASS =
  'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5';
/** Full-width catalog after horizontal filters — denser discovery. */
export const MARKETPLACE_BROWSE_GRID_CLASS =
  'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4';

/** Carry where/when/who when switching Tours ↔ Stays browse without inventing extra filters. */
export function marketplaceFamilySwitchPath(
  target: MarketplaceSearchFamily,
  values: { q?: string; date?: string; checkout?: string; guests?: string }
): string {
  const p = new URLSearchParams();
  const q = values.q?.trim();
  if (q) p.set('q', q);
  if (values.date) p.set('date', values.date);
  if (target === 'stays' && values.date) {
    const out =
      values.checkout && values.checkout > values.date ? values.checkout : addCalendarDays(values.date, 1);
    p.set('checkout', out);
  }
  if (values.guests?.trim()) p.set('guests', values.guests.trim());
  const path = target === 'stays' ? '/stays' : '/packages';
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
