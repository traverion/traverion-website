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

/** Check if a date has capacity (if listing uses availability; otherwise treat as available). */
export async function checkAvailability(
  listingId: string,
  date: string,
  guests: number
): Promise<{ available: boolean; remaining?: number; error?: string }> {
  if (!supabase) return { available: true };
  const { data, error } = await supabase
    .from('listing_availability')
    .select('capacity, booked')
    .eq('listing_id', listingId)
    .eq('available_date', date)
    .maybeSingle();
  if (error) return { available: false, error: error.message };
  if (!data) return { available: true };
  const remaining = (data.capacity ?? 0) - (data.booked ?? 0);
  return { available: remaining >= guests, remaining };
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
