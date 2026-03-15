import { supabase } from '../lib/supabase';

/** Shape used by BookingForm (legacy). Mapped to public.bookings in DB. */
export type Booking = {
  id?: string;
  created_at?: string;
  updated_at?: string;
  tour_id: string;
  tour_title?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  departure_date?: string;
  return_date?: string;
  travelers?: number;
  room_type?: string;
  hotel_category?: string;
  single_supplement?: boolean;
  special_requests?: string;
  total_price?: number;
  status?: 'pending' | 'confirmed' | 'cancelled';
};

/** Row from public.bookings (for supplier dashboard). */
export type BookingRow = {
  id: string;
  listing_id: string;
  guest_email: string | null;
  guest_name: string | null;
  guests: number;
  booking_date: string | null;
  status: string;
  special_requests: string | null;
  created_at: string;
};

export async function submitBooking(
  data: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }
  const { error } = await supabase.from('bookings').insert({
    listing_id: data.tour_id,
    guest_email: data.customer_email ?? null,
    guest_name: data.customer_name ?? null,
    guests: data.travelers ?? 1,
    booking_date: data.departure_date || null,
    status: data.status ?? 'pending',
    special_requests: data.special_requests ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Fetch all bookings for a supplier's listings (RLS allows select for own listings). */
export async function fetchBookingsForSupplier(supplierId: string): Promise<BookingRow[]> {
  if (!supabase) return [];
  const { data: listingIds } = await supabase
    .from('listings')
    .select('id')
    .eq('supplier_id', supplierId);
  const ids = (listingIds ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, created_at')
    .in('listing_id', ids)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as BookingRow[];
}

/** Update booking status (supplier; RLS must allow update for own listing's bookings). */
export async function updateBookingStatus(
  bookingId: string,
  status: 'pending' | 'confirmed' | 'cancelled'
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId);
  return !error;
}

/** Fetch current consumer's bookings (RLS: select where guest_email = auth user email). Must be logged in. */
export async function fetchMyBookings(): Promise<BookingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, created_at')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as BookingRow[];
}
