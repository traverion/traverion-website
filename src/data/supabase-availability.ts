import { supabase } from '../lib/supabase';

export type AvailabilityRow = {
  listing_id: string;
  available_date: string;
  capacity: number;
  booked: number;
};

/** Fetch availability for a listing (all dates with capacity). */
export async function fetchAvailabilityByListingId(listingId: string): Promise<AvailabilityRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('listing_availability')
    .select('*')
    .eq('listing_id', listingId)
    .gte('available_date', new Date().toISOString().slice(0, 10))
    .order('available_date', { ascending: true });
  if (error) return [];
  return (data ?? []) as AvailabilityRow[];
}

export type AvailabilityCheckOption = {
  id: string;
  title: string;
  description: string;
  selectable: boolean;
};

/** Check if a date has capacity (if listing uses availability; otherwise treat as available). Always returns at least one `options` row for the booking UI. */
export async function checkAvailability(
  listingId: string,
  date: string,
  guests: number
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
  if (!data) {
    return {
      available: true,
      options: [
        {
          id: 'open',
          title: 'Book this date',
          description: 'No separate capacity calendar for this date — your request goes to the provider.',
          selectable: true,
        },
      ],
    };
  }
  const remaining = (data.capacity ?? 0) - (data.booked ?? 0);
  const available = remaining >= guests;
  if (!available) {
    const spotsWord = remaining === 1 ? 'spot' : 'spots';
    return {
      available: false,
      remaining,
      options: [
        {
          id: 'full',
          title:
            remaining <= 0
              ? 'This date is fully booked'
              : `Only ${remaining} ${spotsWord} left`,
          description: 'Not enough capacity for your party. Try fewer guests or another date.',
          selectable: false,
        },
      ],
    };
  }
  const spotsWord = remaining === 1 ? 'spot' : 'spots';
  return {
    available: true,
    remaining,
    options: [
      {
        id: 'slot',
        title: 'This date is available',
        description: `${remaining} ${spotsWord} left · ${guests} ${guests === 1 ? 'guest' : 'guests'}`,
        selectable: true,
      },
    ],
  };
}

/** Increment booked count when a booking is confirmed. Call after status → confirmed. */
export async function incrementAvailabilityBooked(
  listingId: string,
  date: string
): Promise<boolean> {
  if (!supabase) return false;
  const { data: row } = await supabase
    .from('listing_availability')
    .select('booked')
    .eq('listing_id', listingId)
    .eq('available_date', date)
    .single();
  if (!row) return true;
  const newBooked = (row.booked ?? 0) + 1;
  const { error } = await supabase
    .from('listing_availability')
    .update({ booked: newBooked })
    .eq('listing_id', listingId)
    .eq('available_date', date);
  return !error;
}

/** Decrement booked when a booking is cancelled. */
export async function decrementAvailabilityBooked(
  listingId: string,
  date: string
): Promise<boolean> {
  if (!supabase) return false;
  const { data: row } = await supabase
    .from('listing_availability')
    .select('booked')
    .eq('listing_id', listingId)
    .eq('available_date', date)
    .single();
  if (!row) return true;
  const newBooked = Math.max(0, (row.booked ?? 0) - 1);
  const { error } = await supabase
    .from('listing_availability')
    .update({ booked: newBooked })
    .eq('listing_id', listingId)
    .eq('available_date', date);
  return !error;
}

/** Supplier: upsert availability for a listing (set capacity for dates). */
export async function upsertAvailability(
  listingId: string,
  entries: { available_date: string; capacity: number }[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  for (const e of entries) {
    const { error } = await supabase.from('listing_availability').upsert(
      {
        listing_id: listingId,
        available_date: e.available_date,
        capacity: e.capacity,
      },
      { onConflict: 'listing_id,available_date' }
    );
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}
