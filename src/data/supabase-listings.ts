import { supabase } from '../lib/supabase';
import { isListingUuid } from '../lib/listing-creation-persist';
import { userFacingError } from '../lib/userFacingError';
import { TourPackage } from '../types/tour';
import { listingExtrasToDb, parseListingExtras, stripPublicStayCheckInAddress } from '../types/listingExtras';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import { resolveSupplierId } from './supabase-supplier-team';

export type ListingRow = {
  id: string;
  supplier_id: string;
  title: string;
  destination: string;
  duration: string;
  style: string | null;
  start_location: string | null;
  end_location: string | null;
  price_starting_from: number;
  price_currency: string | null;
  category: string | null;
  tour_type: string | null;
  validity: string | null;
  image: string | null;
  description: string;
  highlights: string[];
  itinerary: { day: number; title: string; description: string; meals: string; location: string; activities: string[] }[];
  includes: string[];
  excludes: string[];
  difficulty: string | null;
  group_size: string | null;
  best_time: string | null;
  rating: number;
  reviews: number;
  is_popular: boolean;
  city: string | null;
  region: string | null;
  country: string | null;
  tags: string[] | null;
  status: 'draft' | 'published' | null;
  cancellation_policy: string | null;
  meeting_point: string | null;
  pickup_instructions: string | null;
  default_start_time?: string | null;
  pickup_window_minutes_before_min?: number | null;
  pickup_window_minutes_before_max?: number | null;
  experience_start_style?: string | null;
  dropoff_mode?: string | null;
  dropoff_location?: string | null;
  experience_language?: string | null;
  experience_kind?: string | null;
  listing_subtitle?: string | null;
  listing_extras?: unknown | null;
  created_at: string;
  updated_at: string;
};

/** Postgres time string -> HH:MM for inputs and display. */
export function pgTimeToHm(value: string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  const s = String(value);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** Form HH:MM or empty -> Postgres time (null clears). */
export function hmToPgTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  return v.length === 5 ? `${v}:00` : v;
}

const defaultItinerary = [
  { day: 1, title: 'Tour', description: '', meals: 'None', location: '', activities: ['Tour'] },
];
const defaultIncludes = ['Guide', 'As described'];
const defaultExcludes = ['Personal expenses'];

/** Map DB row to TourPackage for the app. */
export function rowToTourPackage(row: ListingRow): TourPackage {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    duration: row.duration,
    style: row.style ?? 'Tour',
    startLocation: row.start_location ?? row.destination,
    endLocation: row.end_location ?? row.destination,
    price: {
      startingFrom: Number(row.price_starting_from),
      currency: row.price_currency ?? 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: row.validity ?? 'Year round',
    },
    category: (row.category as TourPackage['category']) ?? '3*',
    tourType: (row.tour_type as TourPackage['tourType']) ?? 'cultural',
    validity: row.validity ?? 'Year round',
    image: listingHeroImageSrc(row.image) ?? '',
    subtitle: row.listing_subtitle?.trim() || undefined,
    description: row.description,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    itinerary: Array.isArray(row.itinerary) && row.itinerary.length > 0 ? row.itinerary : defaultItinerary,
    includes: Array.isArray(row.includes) ? row.includes : defaultIncludes,
    excludes: Array.isArray(row.excludes) ? row.excludes : defaultExcludes,
    hotels: [],
    difficulty: (row.difficulty as TourPackage['difficulty']) ?? 'Easy',
    // Phase 1236: null group_size → empty (no invent 2–12; edge quote 1228 parity).
    groupSize: row.group_size?.trim() || '',
    bestTime: row.best_time ?? 'Year round',
    rating: Number(row.rating),
    reviews: Number(row.reviews),
    isPopular: row.is_popular ?? false,
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    country: row.country ?? undefined,
    tags: row.tags && row.tags.length > 0 ? row.tags : undefined,
    supplierId: row.supplier_id,
    status: (row.status as 'draft' | 'published') ?? 'published',
    cancellationPolicy: row.cancellation_policy ?? undefined,
    meetingPoint: row.meeting_point ?? undefined,
    pickupInstructions: row.pickup_instructions ?? undefined,
    defaultStartTime: pgTimeToHm(row.default_start_time ?? null),
    pickupWindowMinutesBeforeMin: row.pickup_window_minutes_before_min ?? 0,
    pickupWindowMinutesBeforeMax: row.pickup_window_minutes_before_max ?? 30,
    experienceStartStyle: normalizeExperienceStartStyle(row.experience_start_style),
    dropoffMode: normalizeDropoffMode(row.dropoff_mode),
    dropoffLocation: row.dropoff_location ?? undefined,
    experienceLanguage: row.experience_language?.trim() || undefined,
    experienceKind: normalizeExperienceKind(row.experience_kind, row.style),
    listingExtras: (() => {
      const parsed = parseListingExtras(row.listing_extras);
      // Never trust public listing_extras for exact stay address (Phase 1081).
      const publicSafe = stripPublicStayCheckInAddress(parsed);
      return publicSafe && Object.keys(publicSafe).length > 0 ? publicSafe : undefined;
    })(),
  };
}

const EXPERIENCE_KINDS = new Set(['tour', 'ticket', 'transportation']);

function normalizeExperienceKind(
  kind: string | null | undefined,
  style: string | null | undefined
): TourPackage['experienceKind'] | undefined {
  if (kind && EXPERIENCE_KINDS.has(kind)) return kind as TourPackage['experienceKind'];
  const s = (style ?? '').trim().toLowerCase();
  if (s === 'ticket') return 'ticket';
  if (s === 'transportation' || s === 'transport') return 'transportation';
  if (s === 'tour' || s === '') return 'tour';
  return 'tour';
}

const EXPERIENCE_START_STYLES = new Set([
  'unspecified',
  'fixed_meeting_place',
  'operator_pickup',
  'either_available',
]);
const DROPOFF_MODES = new Set(['same_as_pickup', 'different_place']);

function normalizeExperienceStartStyle(
  v: string | null | undefined
): TourPackage['experienceStartStyle'] | undefined {
  if (v == null || v === '') return undefined;
  return EXPERIENCE_START_STYLES.has(v)
    ? (v as TourPackage['experienceStartStyle'])
    : undefined;
}

function normalizeDropoffMode(v: string | null | undefined): TourPackage['dropoffMode'] | undefined {
  if (v == null || v === '') return undefined;
  return DROPOFF_MODES.has(v) ? (v as TourPackage['dropoffMode']) : undefined;
}

/** Map TourPackage (or partial) to DB insert/update payload. */
export function tourPackageToRow(tour: Partial<TourPackage> & { title: string; destination: string; duration: string; price: { startingFrom: number } }): Omit<ListingRow, 'id' | 'supplier_id' | 'created_at' | 'updated_at'> {
  return {
    title: tour.title,
    destination: tour.destination,
    duration: tour.duration,
    style: tour.style ?? 'Tour',
    start_location: tour.startLocation ?? tour.city ?? tour.destination,
    end_location: tour.endLocation ?? tour.city ?? tour.destination,
    price_starting_from: tour.price.startingFrom,
    price_currency: tour.price.currency ?? 'EUR',
    category: tour.category ?? '3*',
    tour_type: tour.tourType ?? 'cultural',
    validity: tour.validity ?? 'Year round',
    image: listingHeroImageSrc(tour.image) ?? null,
    description: tour.description ?? '',
    highlights: Array.isArray(tour.highlights) ? tour.highlights : [],
    itinerary: Array.isArray(tour.itinerary) && tour.itinerary.length > 0 ? tour.itinerary : defaultItinerary,
    includes: Array.isArray(tour.includes) ? tour.includes : defaultIncludes,
    excludes: Array.isArray(tour.excludes) ? tour.excludes : defaultExcludes,
    difficulty: tour.difficulty ?? 'Easy',
    // Phase 1236: do not invent 2–12 People into DB when supplier left group size blank.
    group_size: tour.groupSize?.trim() || null,
    best_time: tour.bestTime ?? 'Year round',
    // Always 0 — real scores come from reviews aggregates; DB trigger 122 also forces 0.
    rating: 0,
    reviews: 0,
    is_popular: tour.isPopular ?? false,
    city: tour.city ?? null,
    region: tour.region ?? null,
    country: tour.country ?? null,
    tags: tour.tags && tour.tags.length > 0 ? tour.tags : null,
    status: tour.status ?? 'published',
    cancellation_policy: tour.cancellationPolicy ?? null,
    meeting_point: tour.meetingPoint ?? null,
    pickup_instructions: tour.pickupInstructions ?? null,
    default_start_time: hmToPgTime(tour.defaultStartTime ?? null),
    pickup_window_minutes_before_min: tour.pickupWindowMinutesBeforeMin ?? 0,
    pickup_window_minutes_before_max: Math.max(
      tour.pickupWindowMinutesBeforeMin ?? 0,
      tour.pickupWindowMinutesBeforeMax ?? 30
    ),
    experience_start_style: tour.experienceStartStyle ?? null,
    dropoff_mode: tour.dropoffMode ?? null,
    dropoff_location: tour.dropoffLocation?.trim() ? tour.dropoffLocation.trim() : null,
    experience_language: tour.experienceLanguage?.trim() ? tour.experienceLanguage.trim() : null,
    experience_kind: tour.experienceKind ?? null,
    listing_subtitle: tour.subtitle?.trim() ? tour.subtitle.trim().slice(0, 300) : null,
    listing_extras: listingExtrasToDb(tour.listingExtras) ?? {},
  };
}

/** Owner-only: merge listing_stay_private.check_in_address into stay extras for edit UI. */
async function mergeOwnedStayPrivateAddresses(tours: TourPackage[]): Promise<TourPackage[]> {
  if (!supabase || tours.length === 0) return tours;
  const ids = tours.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return tours;
  const { data, error } = await supabase
    .from('listing_stay_private')
    .select('listing_id, check_in_address')
    .in('listing_id', ids);
  if (error || !data?.length) return tours;
  const byId = new Map<string, string>();
  for (const row of data as { listing_id: string; check_in_address: string | null }[]) {
    const addr = (row.check_in_address ?? '').trim();
    if (addr) byId.set(row.listing_id, addr.slice(0, 400));
  }
  if (byId.size === 0) return tours;
  return tours.map((t) => {
    const addr = byId.get(t.id);
    if (!addr) return t;
    return {
      ...t,
      listingExtras: {
        ...t.listingExtras,
        stay: { ...t.listingExtras?.stay, checkInAddress: addr },
      },
    };
  });
}

async function upsertStayPrivateCheckInAddress(
  listingId: string,
  checkInAddress: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const trimmed = (checkInAddress ?? '').trim().slice(0, 400);
  if (!trimmed) {
    const { error } = await supabase.from('listing_stay_private').delete().eq('listing_id', listingId);
    if (error) return { ok: false, error: formatSupabaseListingError('Could not clear check-in address', error) };
    return { ok: true };
  }
  const { error } = await supabase.from('listing_stay_private').upsert(
    { listing_id: listingId, check_in_address: trimmed, updated_at: new Date().toISOString() },
    { onConflict: 'listing_id' }
  );
  if (error) return { ok: false, error: formatSupabaseListingError('Could not save check-in address', error) };
  return { ok: true };
}

/** Fetch published listings for the public site (www).
 * Status NOT NULL (mig 092); do not include status.is.null (legacy null bypass).
 */
export async function fetchAllListings(): Promise<TourPackage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, supplier_id, title, destination, duration, style, start_location, end_location, price_starting_from, price_currency, category, tour_type, validity, image, description, highlights, includes, excludes, difficulty, group_size, best_time, rating, reviews, is_popular, city, region, country, tags, status, cancellation_policy, meeting_point, pickup_instructions, default_start_time, pickup_window_minutes_before_min, pickup_window_minutes_before_max, experience_start_style, dropoff_mode, dropoff_location, experience_language, experience_kind, listing_subtitle, listing_extras, created_at, updated_at'
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ListingRow[]).map(rowToTourPackage);
}

/** Fetch listings for the current supplier (requires auth). Throws on Supabase error.
 * Phase 1140: resolve team JWT → owner supplier_id. */
export async function fetchMyListings(supplierId: string): Promise<TourPackage[]> {
  if (!supabase) return [];
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('supplier_id', ownerSupplierId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const tours = (data as ListingRow[]).map(rowToTourPackage);
  return mergeOwnedStayPrivateAddresses(tours);
}

export type ListingSaveResult =
  | { ok: true; tour: TourPackage }
  | { ok: false; error: string };

export type ListingStatusResult = { ok: true } | { ok: false; error: string };

function formatSupabaseListingError(prefix: string, error: { message?: string; details?: string; hint?: string }): string {
  return userFacingError(error.message, `${prefix}. Check your connection and try again.`);
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || /duplicate key/i.test(error.message ?? '');
}

/** Insert a new listing (requires auth). Phase 1143: team JWT writes under owner supplier_id. */
export async function insertListing(tour: TourPackage, supplierId: string): Promise<ListingSaveResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const privateAddress = tour.listingExtras?.stay?.checkInAddress?.trim() || null;
  const row = tourPackageToRow(tour);
  const explicitId = isListingUuid(tour.id) ? tour.id : undefined;
  const { data, error } = await supabase
    .from('listings')
    .insert({ ...row, supplier_id: ownerSupplierId, ...(explicitId ? { id: explicitId } : {}) })
    .select()
    .single();
  if (error) {
    if (explicitId && isUniqueViolation(error)) {
      return updateListing(explicitId, tour);
    }
    console.error('Supabase insert listing:', error);
    return { ok: false, error: formatSupabaseListingError('Could not create listing', error) };
  }
  const saved = rowToTourPackage(data as ListingRow);
  const priv = await upsertStayPrivateCheckInAddress(saved.id, privateAddress);
  if (!priv.ok) return priv;
  const [merged] = await mergeOwnedStayPrivateAddresses([saved]);
  return { ok: true, tour: merged ?? saved };
}

/** Update an existing listing (requires auth; must be owner). */
export async function updateListing(id: string, tour: Partial<TourPackage>): Promise<ListingSaveResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const privateAddress =
    tour.listingExtras && 'stay' in (tour.listingExtras ?? {})
      ? tour.listingExtras?.stay?.checkInAddress?.trim() || null
      : undefined;
  const row = tourPackageToRow(tour as Parameters<typeof tourPackageToRow>[0]);
  const { data, error } = await supabase
    .from('listings')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Supabase update listing:', error);
    return { ok: false, error: formatSupabaseListingError('Could not update listing', error) };
  }
  if (privateAddress !== undefined) {
    const priv = await upsertStayPrivateCheckInAddress(id, privateAddress);
    if (!priv.ok) return priv;
  }
  const saved = rowToTourPackage(data as ListingRow);
  const [merged] = await mergeOwnedStayPrivateAddresses([saved]);
  return { ok: true, tour: merged ?? saved };
}

/** Delete a listing (requires auth; must be owner). Optionally GC owned listing-images. */
export async function deleteListing(
  id: string,
  opts?: { ownerUserId?: string; imageUrls?: string[] }
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listings').delete().eq('id', id);
  if (error) {
    console.error('Supabase delete listing:', error);
    return false;
  }
  if (opts?.ownerUserId && opts.imageUrls?.length) {
    const { removeOwnedListingImagesAfterDelete } = await import('./supabase-listing-images');
    await removeOwnedListingImagesAfterDelete(opts.ownerUserId, opts.imageUrls);
  }
  return true;
}

/** Update only listing status (draft/published). */
export async function updateListingStatus(id: string, status: 'draft' | 'published'): Promise<ListingStatusResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { data, error } = await supabase.from('listings').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('Supabase update listing status:', error);
    return { ok: false, error: formatSupabaseListingError('Could not update status', error) };
  }
  if (!data) {
    return { ok: false, error: 'Listing not found or you do not have permission to change it.' };
  }
  return { ok: true };
}

/**
 * Fetch a single listing by id. With RLS: travelers only see published listings; suppliers see their own drafts when logged in.
 * Throws on Supabase error; returns null if not found or not visible.
 */
export async function fetchListingById(id: string): Promise<TourPackage | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('listings').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw new Error(error.message);
  }
  if (!data) return null;
  const tour = rowToTourPackage(data as ListingRow);
  // RLS on listing_stay_private returns address only for the supplier owner.
  const [merged] = await mergeOwnedStayPrivateAddresses([tour]);
  return merged ?? tour;
}

/** Fetch listing titles for given ids (public). Returns id -> title map. */
export async function fetchListingTitlesByIds(ids: string[]): Promise<Record<string, string>> {
  const ops = await fetchListingOpsByIds(ids);
  return Object.fromEntries(Object.entries(ops).map(([id, v]) => [id, v.title]));
}

export type ListingOpsMeta = {
  title: string;
  supplier_id: string | null;
  meeting_point: string | null;
  pickup_instructions: string | null;
  image: string | null;
  destination: string | null;
  city: string | null;
  /** Publish state — Trips must not offer “browse live” for unpublished rows. */
  status: string | null;
};

export async function fetchListingOpsByIds(ids: string[]): Promise<Record<string, ListingOpsMeta>> {
  if (!supabase || ids.length === 0) return {};
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, supplier_id, meeting_point, pickup_instructions, image, destination, city, status')
    .in('id', ids);
  // Failure must not look like "listings have no ops meta" (Phase 1089).
  if (error) throw new Error(error.message);
  const map: Record<string, ListingOpsMeta> = {};
  for (const r of data ?? []) {
    map[r.id] = {
      title: r.title ?? '',
      supplier_id: r.supplier_id ?? null,
      meeting_point: r.meeting_point ?? null,
      pickup_instructions: r.pickup_instructions ?? null,
      image: listingHeroImageSrc(r.image) ?? null,
      destination: typeof r.destination === 'string' ? r.destination : null,
      city: typeof r.city === 'string' ? r.city : null,
      status: typeof r.status === 'string' ? r.status : null,
    };
  }
  return map;
}
