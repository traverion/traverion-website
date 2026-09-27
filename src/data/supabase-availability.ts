import { listingTourCapacityFromOptions, capacitySpotsFromBookingOptions } from '../lib/availability-ops';
import { localYmd } from '../lib/local-ymd';
import { supabase } from '../lib/supabase';
import { tourAvailabilityCheckMessages, tourPublicAvailabilityRemaining } from '../lib/tour-check-availability';

export type AvailabilityRow = {
  listing_id: string;
  available_date: string;
  capacity: number;
  booked: number;
};

/**
 * Fetch availability rows for a listing.
 * Default window is today onward (traveler calendars). Pass fromDate/toDate for partner month grids.
 */
export async function fetchAvailabilityByListingId(
  listingId: string,
  opts?: { fromDate?: string; toDate?: string }
): Promise<AvailabilityRow[]> {
  if (!supabase) return [];
  const from = opts?.fromDate ?? localYmd();
  let query = supabase
    .from('listing_availability')
    .select('*')
    .eq('listing_id', listingId)
    .gte('available_date', from);
  if (opts?.toDate) query = query.lte('available_date', opts.toDate);
  const { data, error } = await query.order('available_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AvailabilityRow[];
}

/** Inventory-occupying guest counts per departure date (paid + live holds). Failed, expired, and refunded are omitted. */
export async function fetchPublishedTourPaidGuests(
  listingId: string
): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('published_tour_paid_guests', {
    p_listing_id: listingId,
  });
  if (error) throw new Error(error.message);
  // Phase 1105: non-array payload ≠ empty occupancy (would invent open seats).
  if (!Array.isArray(data)) {
    throw new Error('Unexpected occupancy response from published_tour_paid_guests');
  }
  const out: Record<string, number> = {};
  for (const row of data as { departure?: unknown; paid_guests?: unknown }[]) {
    const day = String(row.departure ?? '').slice(0, 10);
    const n = Number(row.paid_guests ?? 0);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(n)) out[day] = n;
  }
  return out;
}

/** Slot key: `YYYY-MM-DD|HH:MM` (or `YYYY-MM-DD|` when start_time is null). */
export function tourPaidSlotKey(dayIso: string, startTimeHm?: string | null): string {
  const day = dayIso.slice(0, 10);
  const hm = String(startTimeHm ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return `${day}|`;
  return `${day}|${hm[1].padStart(2, '0')}:${hm[2]}`;
}

/** Occupying guests per date+startTime (paid + live holds). */
export async function fetchPublishedTourPaidGuestsBySlot(
  listingId: string
): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('published_tour_paid_guests_by_slot', {
    p_listing_id: listingId,
  });
  // Phase 1101: missing/failed slot RPC ≠ empty occupancy (every departure looked open).
  if (error) throw new Error(error.message);
  // Phase 1105: non-array payload ≠ empty occupancy.
  if (!Array.isArray(data)) {
    throw new Error('Unexpected occupancy response from published_tour_paid_guests_by_slot');
  }
  const out: Record<string, number> = {};
  for (const row of data as { departure?: unknown; start_time_hm?: unknown; paid_guests?: unknown }[]) {
    const day = String(row.departure ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const n = Number(row.paid_guests ?? 0);
    if (!Number.isFinite(n)) continue;
    const key = tourPaidSlotKey(day, row.start_time_hm == null ? null : String(row.start_time_hm));
    out[key] = n;
  }
  return out;
}

async function fetchTourOptionCapacity(listingId: string): Promise<number | null> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('listings')
    .select('listing_extras')
    .eq('id', listingId)
    .maybeSingle();
  // Phase 1105: listing load failure must not invent default capacity 8.
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Listing not found');
  const extras = data.listing_extras as {
    bookingOptions?: Array<{
      maxSpotsPerSlot?: unknown;
      schedules?: Array<{ maxSpotsPerSlot?: unknown; status?: string } | null> | null;
    }>;
  } | null;
  // Phase 1163: empty option spots → null (callers fail closed; no invent-8).
  return listingTourCapacityFromOptions(capacitySpotsFromBookingOptions(extras?.bookingOptions ?? []));
}

export type AvailabilityCheckOption = {
  id: string;
  title: string;
  description: string;
  selectable: boolean;
};

/** Check if a date has capacity. Public remaining matches checkout: paid + live pending holds. */
export async function checkAvailability(
  listingId: string,
  date: string,
  guests: number,
  opts?: {
    /** HH:MM — when set with slotMaxSpots, counts paid guests for that departure only. */
    startTimeHm?: string | null;
    slotMaxSpots?: number | null;
  }
): Promise<{
  available: boolean;
  remaining?: number;
  error?: string;
  options: AvailabilityCheckOption[];
}> {
  if (!supabase) {
    return {
      available: true,
      options: [
        {
          id: 'offline',
          title: 'Request this date',
          description: 'Availability will be confirmed by the provider.',
          selectable: true,
        },
      ],
    };
  }
  const { data, error } = await supabase
    .from('listing_availability')
    .select('capacity, booked')
    .eq('listing_id', listingId)
    .eq('available_date', date)
    .maybeSingle();
  if (error) {
    return {
      available: false,
      error: error.message,
      options: [
        {
          id: 'error',
          title: 'Could not check availability',
          description: error.message,
          selectable: false,
        },
      ],
    };
  }
  let paidByDay: Record<string, number>;
  let fallbackCap: number | null;
  let paidSlot = 0;
  const startHm = (opts?.startTimeHm ?? '').trim();
  try {
    paidByDay = await fetchPublishedTourPaidGuests(listingId);
    fallbackCap = await fetchTourOptionCapacity(listingId);
    // Phase 1112: slot occupancy applies even when a day capacity override exists.
    if (startHm) {
      const paidBySlot = await fetchPublishedTourPaidGuestsBySlot(listingId);
      paidSlot = paidBySlot[tourPaidSlotKey(date, startHm)] ?? 0;
    }
  } catch (e) {
    // Phase 1192: occupancy/capacity RPC failure → error path (not unhandled reject / sold-out UX).
    const message = e instanceof Error ? e.message : 'Could not check availability';
    return {
      available: false,
      error: message,
      options: [
        {
          id: 'error',
          title: 'Could not check availability',
          description: message,
          selectable: false,
        },
      ],
    };
  }
  const dayOverride =
    data && typeof data.capacity === 'number' && Number.isFinite(Number(data.capacity))
      ? Number(data.capacity)
      : null;

  const { available, remaining, scope } = tourPublicAvailabilityRemaining({
    date,
    guests,
    dayCapacityOverride: dayOverride,
    paidGuestsDay: paidByDay[date] ?? 0,
    fallbackDayCapacity: fallbackCap,
    startTimeHm: startHm || null,
    slotMaxSpots: opts?.slotMaxSpots ?? null,
    paidGuestsSlot: paidSlot,
  });

  if (!available) {
    // Phase 1190: unknown listing-wide fallback is not “fully booked” (1163 / 1191–1192).
    const slotResolved =
      Boolean(startHm) &&
      typeof opts?.slotMaxSpots === 'number' &&
      Number.isFinite(opts.slotMaxSpots) &&
      opts.slotMaxSpots >= 1;
    const capacityUnknown =
      dayOverride == null &&
      !slotResolved &&
      (fallbackCap == null || !Number.isFinite(fallbackCap) || fallbackCap < 1);
    if (capacityUnknown) {
      return {
        available: false,
        remaining: 0,
        error: 'Listing capacity is not configured.',
        options: [
          {
            id: 'capacity-unknown',
            title: 'Could not verify capacity',
            description: 'This tour does not have a configured capacity for this date. Try another date or contact the operator.',
            selectable: false,
          },
        ],
      };
    }
    const msg = tourAvailabilityCheckMessages(remaining, guests, scope, startHm || null);
    return {
      available: false,
      remaining,
      options: [
        {
          id: 'full',
          title: msg.title,
          description: msg.description,
          selectable: false,
        },
      ],
    };
  }
  const msg = tourAvailabilityCheckMessages(remaining, guests, scope, startHm || null);
  return {
    available: true,
    remaining,
    options: [
      {
        id: 'slot',
        title: msg.title,
        description: msg.description,
        selectable: true,
      },
    ],
  };
}

/** Occupancy is paid + live holds. Do not mutate listing_availability.booked (stale footgun). */
export async function incrementAvailabilityBooked(
  _listingId: string,
  _date: string,
  _guests = 1
): Promise<boolean> {
  return true;
}

/** Occupancy is paid + live holds. Do not mutate listing_availability.booked (stale footgun). */
export async function decrementAvailabilityBooked(
  _listingId: string,
  _date: string,
  _guests = 1
): Promise<boolean> {
  return true;
}

/**
 * Supplier: upsert availability for a listing (set capacity for dates).
 * Always writes booked: 0 — occupancy uses paid + live holds; leaving a stale booked
 * value would fail booked_lte_capacity when blocking (capacity 0) or lowering a cap.
 */
export async function upsertAvailability(
  listingId: string,
  entries: { available_date: string; capacity: number }[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  if (entries.length === 0) return { success: true };
  const { error } = await supabase.from('listing_availability').upsert(
    entries.map((e) => ({
      listing_id: listingId,
      available_date: e.available_date,
      capacity: e.capacity,
      booked: 0,
    })),
    { onConflict: 'listing_id,available_date' }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteAvailability(
  listingId: string,
  date: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('listing_availability')
    .delete()
    .eq('listing_id', listingId)
    .eq('available_date', date);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Supplier: clear capacity overrides for a date range (returns nights/days to weekday defaults). */
export async function deleteAvailabilityRange(
  listingId: string,
  dates: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  if (dates.length === 0) return { success: true };
  const { error } = await supabase
    .from('listing_availability')
    .delete()
    .eq('listing_id', listingId)
    .in('available_date', dates);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
