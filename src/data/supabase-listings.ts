import { supabase } from '../lib/supabase';
import { isListingUuid } from '../lib/listing-creation-persist';
import { userFacingError } from '../lib/userFacingError';
import { TourPackage } from '../types/tour';
import {
  listingExtrasToDb,
  parseListingExtras,
  stripPublicBookingContactPhone,
  stripPublicStayCheckInAddress,
} from '../types/listingExtras';
import { validateBookingContactPhone } from '../lib/listing-booking-contact-phone';
import { listingHeroImageSrc } from '../lib/listingPhotoGrid';
import {
  TOUR_EXCLUDE_MAX,
  TOUR_INCLUDE_MAX,
  persistableProgressiveSlots,
} from '../lib/listing-creation-lines';
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
    includes: Array.isArray(row.includes)
      ? persistableProgressiveSlots(row.includes.map(String), TOUR_INCLUDE_MAX)
      : defaultIncludes,
    excludes: Array.isArray(row.excludes)
      ? persistableProgressiveSlots(row.excludes.map(String), TOUR_EXCLUDE_MAX)
      : [],
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
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
    cancellationPolicy: row.cancellation_policy ?? undefined,
    meetingPoint: row.meeting_point ?? undefined,
    pickupInstructions: row.pickup_instructions ?? undefined,
    defaultStartTime: pgTimeToHm(row.default_start_time ?? null),
    // Phase 1253/1279: null pickup window → undefined. Legacy 025 DEFAULT 0/30
    // also reads as unset until rows are cleared (migration 185).
    ...(() => {
      const min = row.pickup_window_minutes_before_min;
      const max = row.pickup_window_minutes_before_max;
      if (min == null && max == null) return {};
      if (min === 0 && max === 30) return {};
      return {
        ...(min != null ? { pickupWindowMinutesBeforeMin: min } : {}),
        ...(max != null ? { pickupWindowMinutesBeforeMax: max } : {}),
      };
    })(),
    experienceStartStyle: normalizeExperienceStartStyle(row.experience_start_style),
    dropoffMode: normalizeDropoffMode(row.dropoff_mode),
    dropoffLocation: row.dropoff_location ?? undefined,
    experienceLanguage: row.experience_language?.trim() || undefined,
    experienceKind: normalizeExperienceKind(row.experience_kind, row.style),
    listingExtras: (() => {
      const parsed = parseListingExtras(row.listing_extras);
      // Never trust public listing_extras for exact stay address (Phase 1081).
      const withoutAddr = stripPublicStayCheckInAddress(parsed);
      // Booking contact is private (listing_booking_contact) — strip leaked extras keys.
      const publicSafe = stripPublicBookingContactPhone(withoutAddr);
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
    includes: Array.isArray(tour.includes)
      ? persistableProgressiveSlots(tour.includes, TOUR_INCLUDE_MAX)
      : defaultIncludes,
    excludes: Array.isArray(tour.excludes)
      ? persistableProgressiveSlots(tour.excludes, TOUR_EXCLUDE_MAX)
      : [],
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
    // Phase 1253: do not invent pickup window 0/30 into DB when unset.
    pickup_window_minutes_before_min:
      typeof tour.pickupWindowMinutesBeforeMin === 'number' && Number.isFinite(tour.pickupWindowMinutesBeforeMin)
        ? Math.max(0, Math.floor(tour.pickupWindowMinutesBeforeMin))
        : null,
    pickup_window_minutes_before_max:
      typeof tour.pickupWindowMinutesBeforeMax === 'number' && Number.isFinite(tour.pickupWindowMinutesBeforeMax)
        ? Math.max(
            typeof tour.pickupWindowMinutesBeforeMin === 'number' && Number.isFinite(tour.pickupWindowMinutesBeforeMin)
              ? Math.floor(tour.pickupWindowMinutesBeforeMin)
              : 0,
            Math.floor(tour.pickupWindowMinutesBeforeMax)
          )
        : null,
    experience_start_style: tour.experienceStartStyle ?? null,
    dropoff_mode: tour.dropoffMode ?? null,
    dropoff_location: tour.dropoffLocation?.trim() ? tour.dropoffLocation.trim() : null,
    experience_language: tour.experienceLanguage?.trim() ? tour.experienceLanguage.trim() : null,
    experience_kind: tour.experienceKind ?? null,
    listing_subtitle: tour.subtitle?.trim() || null,
    listing_extras: listingExtrasToDb(tour.listingExtras) ?? {},
  };
}

type StayPrivateRow = {
  listing_id: string;
  check_in_address: string | null;
  address_street?: string | null;
  address_unit?: string | null;
  address_postal?: string | null;
  pin_lat?: number | null;
  pin_lng?: number | null;
  pin_place_id?: string | null;
};

/** Owner-only: merge listing_stay_private into stay extras for edit UI. */
async function mergeOwnedStayPrivateAddresses(tours: TourPackage[]): Promise<TourPackage[]> {
  if (!supabase || tours.length === 0) return tours;
  const ids = tours.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return tours;
  const full = await supabase
    .from('listing_stay_private')
    .select('listing_id, check_in_address, address_street, address_unit, address_postal, pin_lat, pin_lng, pin_place_id')
    .in('listing_id', ids);
  const fallback =
    full.error && /column|schema cache|address_street|pin_lat/i.test(full.error.message ?? '')
      ? await supabase.from('listing_stay_private').select('listing_id, check_in_address').in('listing_id', ids)
      : null;
  const data = fallback ? fallback.data : full.data;
  const error = fallback ? fallback.error : full.error;
  if (error || !data?.length) return tours;
  const byId = new Map<string, StayPrivateRow>();
  for (const row of data as StayPrivateRow[]) {
    if ((row.check_in_address ?? '').trim() || row.pin_lat != null) byId.set(row.listing_id, row);
  }
  if (byId.size === 0) return tours;
  return tours.map((t) => {
    const row = byId.get(t.id);
    if (!row) return t;
    const addr = (row.check_in_address ?? '').trim();
    return {
      ...t,
      listingExtras: {
        ...t.listingExtras,
        stay: {
          ...t.listingExtras?.stay,
          ...(addr ? { checkInAddress: addr.slice(0, 400) } : {}),
          ...(row.address_street?.trim() ? { addressStreet: row.address_street.trim().slice(0, 160) } : {}),
          ...(row.address_unit?.trim() ? { addressUnit: row.address_unit.trim().slice(0, 40) } : {}),
          ...(row.address_postal?.trim() ? { addressPostal: row.address_postal.trim().slice(0, 16) } : {}),
          ...(typeof row.pin_lat === 'number' && typeof row.pin_lng === 'number'
            ? { pinLat: row.pin_lat, pinLng: row.pin_lng }
            : {}),
          ...(row.pin_place_id?.trim() ? { pinPlaceId: row.pin_place_id.trim().slice(0, 200) } : {}),
        },
      },
    };
  });
}

/** Owner-only: merge listing_booking_contact.phone_e164 into extras for edit UI. */
async function mergeOwnedBookingContactPhones(tours: TourPackage[]): Promise<TourPackage[]> {
  if (!supabase || tours.length === 0) return tours;
  const ids = tours.map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return tours;
  const { data, error } = await supabase
    .from('listing_booking_contact')
    .select('listing_id, phone_e164')
    .in('listing_id', ids);
  if (error || !data?.length) return tours;
  const byId = new Map<string, string>();
  for (const row of data as { listing_id: string; phone_e164: string | null }[]) {
    const phone = (row.phone_e164 ?? '').trim();
    if (phone) byId.set(row.listing_id, phone.slice(0, 24));
  }
  if (byId.size === 0) return tours;
  return tours.map((t) => {
    const phone = byId.get(t.id);
    if (!phone) return t;
    return {
      ...t,
      listingExtras: {
        ...t.listingExtras,
        bookingContactPhoneE164: phone,
      },
    };
  });
}

async function mergeOwnedPrivateListingFields(tours: TourPackage[]): Promise<TourPackage[]> {
  const withAddr = await mergeOwnedStayPrivateAddresses(tours);
  return mergeOwnedBookingContactPhones(withAddr);
}

async function upsertStayPrivateCheckInAddress(
  listingId: string,
  stay: {
    checkInAddress?: string | null;
    addressStreet?: string | null;
    addressUnit?: string | null;
    addressPostal?: string | null;
    pinLat?: number | null;
    pinLng?: number | null;
    pinPlaceId?: string | null;
  } | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const trimmed = (stay?.checkInAddress ?? '').trim().slice(0, 400);
  if (!trimmed) {
    const { error } = await supabase.from('listing_stay_private').delete().eq('listing_id', listingId);
    if (error) return { ok: false, error: formatSupabaseListingError('Could not clear check-in address', error) };
    return { ok: true };
  }
  const pinLat = typeof stay?.pinLat === 'number' && Number.isFinite(stay.pinLat) ? stay.pinLat : null;
  const pinLng = typeof stay?.pinLng === 'number' && Number.isFinite(stay.pinLng) ? stay.pinLng : null;
  const detailed = {
    listing_id: listingId,
    check_in_address: trimmed,
    address_street: stay?.addressStreet?.trim().slice(0, 160) || null,
    address_unit: stay?.addressUnit?.trim().slice(0, 40) || null,
    address_postal: stay?.addressPostal?.trim().slice(0, 16) || null,
    pin_lat: pinLat,
    pin_lng: pinLng,
    pin_place_id: stay?.pinPlaceId?.trim().slice(0, 200) || null,
    updated_at: new Date().toISOString(),
  };
  const first = await supabase.from('listing_stay_private').upsert(detailed, { onConflict: 'listing_id' });
  if (!first.error) return { ok: true };
  if (!/column|schema cache|address_street|pin_lat/i.test(first.error.message ?? '')) {
    return { ok: false, error: formatSupabaseListingError('Could not save check-in address', first.error) };
  }
  const { error } = await supabase.from('listing_stay_private').upsert(
    { listing_id: listingId, check_in_address: trimmed, updated_at: new Date().toISOString() },
    { onConflict: 'listing_id' }
  );
  if (error) return { ok: false, error: formatSupabaseListingError('Could not save check-in address', error) };
  return { ok: true };
}

/** PostgREST when a migration is not yet applied on the linked project. */
function isMissingRelationError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? '';
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /Could not find the table/i.test(msg) ||
    /relation .+ does not exist/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

async function upsertListingBookingContactPhone(
  listingId: string,
  phoneE164: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const trimmed = (phoneE164 ?? '').trim();
  if (!trimmed) {
    const { error } = await supabase.from('listing_booking_contact').delete().eq('listing_id', listingId);
    if (error) {
      // Migration 242 not applied yet — do not block listing draft/publish.
      if (isMissingRelationError(error)) {
        console.warn('listing_booking_contact missing; skip clear until migration 242 is applied', error);
        return { ok: true };
      }
      return { ok: false, error: formatSupabaseListingError('Could not clear booking contact', error) };
    }
    return { ok: true };
  }
  const validated = validateBookingContactPhone(trimmed);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const { error } = await supabase.from('listing_booking_contact').upsert(
    { listing_id: listingId, phone_e164: validated.e164, updated_at: new Date().toISOString() },
    { onConflict: 'listing_id' }
  );
  if (error) {
    if (isMissingRelationError(error)) {
      console.warn('listing_booking_contact missing; skip phone save until migration 242 is applied', error);
      return { ok: true };
    }
    return { ok: false, error: formatSupabaseListingError('Could not save booking contact', error) };
  }
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
  return mergeOwnedPrivateListingFields(tours);
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
  const privateStay = tour.listingExtras?.stay;
  const privatePhone = tour.listingExtras?.bookingContactPhoneE164?.trim() || null;
  const isStay = tour.listingExtras?.inventoryFamily === 'stay';
  // Phase 1252: stays that should go live insert as draft first so listing_stay_private
  // exists before publish (SQL requires address on any published stay row).
  const wantPublished = (tour.status ?? 'published') === 'published';
  const row = tourPackageToRow({
    ...tour,
    status: isStay && wantPublished ? 'draft' : tour.status,
  });
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
  let saved = rowToTourPackage(data as ListingRow);
  const priv = await upsertStayPrivateCheckInAddress(saved.id, privateStay);
  if (!priv.ok) return priv;
  const phonePriv = await upsertListingBookingContactPhone(saved.id, privatePhone);
  if (!phonePriv.ok) return phonePriv;
  if (isStay && wantPublished) {
    const published = await updateListingStatus(saved.id, 'published');
    if (!published.ok) return published;
    saved = { ...saved, status: 'published' };
  }
  const [merged] = await mergeOwnedPrivateListingFields([saved]);
  return { ok: true, tour: merged ?? saved };
}

/** Update an existing listing (requires auth; must be owner). */
export async function updateListing(id: string, tour: Partial<TourPackage>): Promise<ListingSaveResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const privateStay =
    tour.listingExtras && 'stay' in (tour.listingExtras ?? {}) ? tour.listingExtras?.stay : undefined;
  const privatePhone =
    tour.listingExtras != null
      ? tour.listingExtras.bookingContactPhoneE164?.trim() || null
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
  if (privateStay !== undefined) {
    const priv = await upsertStayPrivateCheckInAddress(id, privateStay);
    if (!priv.ok) return priv;
  }
  if (privatePhone !== undefined) {
    const phonePriv = await upsertListingBookingContactPhone(id, privatePhone);
    if (!phonePriv.ok) return phonePriv;
  }
  const saved = rowToTourPackage(data as ListingRow);
  const [merged] = await mergeOwnedPrivateListingFields([saved]);
  return { ok: true, tour: merged ?? saved };
}

/** Delete a listing (requires auth; must be owner). Optionally GC owned listing-images.
 * Phase 1734: returns ok:false when bookings still reference the listing (FK RESTRICT).
 */
export async function deleteListing(
  id: string,
  opts?: { ownerUserId?: string; imageUrls?: string[] }
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { data: deleted, error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('Supabase delete listing:', error);
    const code = String((error as { code?: string }).code ?? '');
    if (code === '23503') {
      return {
        ok: false,
        error:
          'This listing still has bookings. Take it offline instead of removing it so trips and Income history stay.',
      };
    }
    return { ok: false, error: error.message };
  }
  // Phase 1744: finance/viewer RLS zero-row must not look like a delete.
  if (!deleted?.id) {
    return { ok: false, error: 'Listing not found or you do not have permission to remove it.' };
  }
  if (opts?.ownerUserId && opts.imageUrls?.length) {
    const { removeOwnedListingImagesAfterDelete } = await import('./supabase-listing-images');
    await removeOwnedListingImagesAfterDelete(opts.ownerUserId, opts.imageUrls);
  }
  return { ok: true };
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
  // RLS returns stay address / booking contact only for supplier editors.
  const [merged] = await mergeOwnedPrivateListingFields([tour]);
  return merged ?? tour;
}

/**
 * Batch hydrate listings by id (Wishlist / Saved). Preserves caller id order.
 * Missing ids are omitted — callers count unavailable separately.
 */
export async function fetchListingsByIds(ids: string[]): Promise<TourPackage[]> {
  if (!supabase || ids.length === 0) return [];
  const unique = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from('listings').select('*').in('id', unique);
  if (error) throw new Error(error.message);
  const tours = (data ?? []).map((row) => rowToTourPackage(row as ListingRow));
  const merged = await mergeOwnedPrivateListingFields(tours);
  const byId = new Map(merged.map((t) => [t.id, t]));
  const ordered: TourPackage[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (t) ordered.push(t);
  }
  return ordered;
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
  /** Phase 1277: season / family for Trips “browse live” honesty. */
  listing_extras: unknown;
};

export async function fetchListingOpsByIds(ids: string[]): Promise<Record<string, ListingOpsMeta>> {
  if (!supabase || ids.length === 0) return {};
  const unique = [...new Set(ids.filter(Boolean))];
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, supplier_id, meeting_point, pickup_instructions, image, destination, city, status, listing_extras'
    )
    .in('id', unique);
  // Failure must not look like "listings have no ops meta" (Phase 1089).
  if (error) throw new Error(error.message);
  const map: Record<string, ListingOpsMeta> = {};
  const ingest = (r: {
    id: string;
    title?: string | null;
    supplier_id?: string | null;
    meeting_point?: string | null;
    pickup_instructions?: string | null;
    image?: string | null;
    destination?: string | null;
    city?: string | null;
    status?: string | null;
    listing_extras?: unknown;
  }) => {
    map[r.id] = {
      title: r.title ?? '',
      supplier_id: r.supplier_id ?? null,
      meeting_point: r.meeting_point ?? null,
      pickup_instructions: r.pickup_instructions ?? null,
      image: listingHeroImageSrc(r.image) ?? null,
      destination: typeof r.destination === 'string' ? r.destination : null,
      city: typeof r.city === 'string' ? r.city : null,
      status: typeof r.status === 'string' ? r.status : null,
      listing_extras: r.listing_extras ?? null,
    };
  };
  for (const r of data ?? []) ingest(r);

  // Phase 1707: unpublished listings are invisible under listings RLS — fill via party RPC.
  const missing = unique.filter((id) => !map[id]);
  if (missing.length > 0) {
    const { data: partyRows, error: partyErr } = await supabase.rpc('listing_ops_for_booking_party', {
      p_listing_ids: missing,
    });
    if (partyErr) throw new Error(partyErr.message);
    for (const r of partyRows ?? []) ingest(r);
  }
  return map;
}

/** Phase 1707: supplier_id + title even when the listing is draft/unpublished (booking party). */
export async function fetchListingSupplierMetaForParty(
  listingId: string
): Promise<{ supplier_id: string | null; title: string | null }> {
  if (!supabase || !listingId) return { supplier_id: null, title: null };
  const { data, error } = await supabase
    .from('listings')
    .select('supplier_id, title')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.supplier_id) {
    return { supplier_id: data.supplier_id, title: data.title?.trim() || null };
  }
  const { data: partyRows, error: partyErr } = await supabase.rpc('listing_ops_for_booking_party', {
    p_listing_ids: [listingId],
  });
  if (partyErr) throw new Error(partyErr.message);
  const row = Array.isArray(partyRows) ? partyRows[0] : null;
  return {
    supplier_id: row?.supplier_id ?? null,
    title: typeof row?.title === 'string' ? row.title.trim() || null : null,
  };
}
