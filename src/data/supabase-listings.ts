import { supabase } from '../lib/supabase';
import { TourPackage } from '../types/tour';

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
      currency: row.price_currency ?? 'USD',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: row.validity ?? 'Year round',
    },
    category: (row.category as TourPackage['category']) ?? '3*',
    tourType: (row.tour_type as TourPackage['tourType']) ?? 'cultural',
    validity: row.validity ?? 'Year round',
    image: row.image ?? 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg',
    description: row.description,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    itinerary: Array.isArray(row.itinerary) && row.itinerary.length > 0 ? row.itinerary : defaultItinerary,
    includes: Array.isArray(row.includes) ? row.includes : defaultIncludes,
    excludes: Array.isArray(row.excludes) ? row.excludes : defaultExcludes,
    hotels: [],
    difficulty: (row.difficulty as TourPackage['difficulty']) ?? 'Easy',
    groupSize: row.group_size ?? '2-12 People',
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
  };
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
    price_currency: tour.price.currency ?? 'USD',
    category: tour.category ?? '3*',
    tour_type: tour.tourType ?? 'cultural',
    validity: tour.validity ?? 'Year round',
    image: tour.image ?? null,
    description: tour.description ?? '',
    highlights: Array.isArray(tour.highlights) ? tour.highlights : [],
    itinerary: Array.isArray(tour.itinerary) && tour.itinerary.length > 0 ? tour.itinerary : defaultItinerary,
    includes: Array.isArray(tour.includes) ? tour.includes : defaultIncludes,
    excludes: Array.isArray(tour.excludes) ? tour.excludes : defaultExcludes,
    difficulty: tour.difficulty ?? 'Easy',
    group_size: tour.groupSize ?? '2-12 People',
    best_time: tour.bestTime ?? 'Year round',
    rating: tour.rating ?? 4.5,
    reviews: tour.reviews ?? 0,
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
  };
}

/** Fetch all listings (public; only published, for main site). Throws on Supabase error. */
export async function fetchAllListings(): Promise<TourPackage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .or('status.eq.published,status.is.null')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ListingRow[]).map(rowToTourPackage);
}

/** Fetch listings for the current supplier (requires auth). Throws on Supabase error. */
export async function fetchMyListings(supplierId: string): Promise<TourPackage[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ListingRow[]).map(rowToTourPackage);
}

/** Insert a new listing (requires auth; supplier_id = current user). */
export async function insertListing(tour: TourPackage, supplierId: string): Promise<TourPackage | null> {
  if (!supabase) return null;
  const row = tourPackageToRow(tour);
  const { data, error } = await supabase
    .from('listings')
    .insert({ ...row, supplier_id: supplierId })
    .select()
    .single();
  if (error) {
    console.error('Supabase insert listing:', error);
    return null;
  }
  return rowToTourPackage(data as ListingRow);
}

/** Update an existing listing (requires auth; must be owner). */
export async function updateListing(id: string, tour: Partial<TourPackage>): Promise<TourPackage | null> {
  if (!supabase) return null;
  const row = tourPackageToRow(tour as Parameters<typeof tourPackageToRow>[0]);
  const { data, error } = await supabase
    .from('listings')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Supabase update listing:', error);
    return null;
  }
  return rowToTourPackage(data as ListingRow);
}

/** Delete a listing (requires auth; must be owner). */
export async function deleteListing(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listings').delete().eq('id', id);
  if (error) {
    console.error('Supabase delete listing:', error);
    return false;
  }
  return true;
}

/** Update only listing status (draft/published). */
export async function updateListingStatus(id: string, status: 'draft' | 'published'): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('listings').update({ status }).eq('id', id);
  return !error;
}

/** Fetch a single listing by id (public). Throws on Supabase error; returns null only if not found. */
export async function fetchListingById(id: string): Promise<TourPackage | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('listings').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw new Error(error.message);
  }
  return data ? rowToTourPackage(data as ListingRow) : null;
}

/** Fetch listing titles for given ids (public). Returns id -> title map. */
export async function fetchListingTitlesByIds(ids: string[]): Promise<Record<string, string>> {
  if (!supabase || ids.length === 0) return {};
  const { data, error } = await supabase.from('listings').select('id, title').in('id', ids);
  if (error) return {};
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: { id: string; title: string }) => { map[r.id] = r.title ?? ''; });
  return map;
}
