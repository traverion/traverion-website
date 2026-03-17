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
  currency?: string;
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
  cancellation_reason?: string | null;
  refund_choice?: string | null;
  cancelled_at?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
};

export async function submitBooking(
  data: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }
  const totalAmount = (data.total_price != null ? data.total_price : undefined) as number | undefined;
  const { error } = await supabase.from('bookings').insert({
    listing_id: data.tour_id,
    guest_email: data.customer_email ?? null,
    guest_name: data.customer_name ?? null,
    guests: data.travelers ?? 1,
    booking_date: data.departure_date || null,
    status: data.status ?? 'pending',
    special_requests: data.special_requests ?? null,
    total_amount: totalAmount ?? null,
    currency: data.currency ?? 'USD',
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Fetch all bookings for a supplier's listings (RLS allows select for own listings). Throws on Supabase error. */
export async function fetchBookingsForSupplier(supplierId: string): Promise<BookingRow[]> {
  if (!supabase) return [];
  const { data: listingIds, error: listErr } = await supabase
    .from('listings')
    .select('id')
    .eq('supplier_id', supplierId);
  if (listErr) throw new Error(listErr.message);
  const ids = (listingIds ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, cancellation_reason, refund_choice, cancelled_at, acknowledged_at, created_at')
    .in('listing_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingRow[];
}

/** Update booking status (supplier; RLS must allow update for own listing's bookings). */
export async function updateBookingStatus(
  bookingId: string,
  status: 'pending' | 'confirmed' | 'cancelled',
  options?: { cancellation_reason?: string; refund_choice?: 'full_refund' | 'no_refund' | 'reschedule' }
): Promise<boolean> {
  if (!supabase) return false;
  const payload: Record<string, unknown> = { status };
  if (status === 'cancelled') {
    payload.cancelled_at = new Date().toISOString();
    if (options?.cancellation_reason) payload.cancellation_reason = options.cancellation_reason;
    if (options?.refund_choice) payload.refund_choice = options.refund_choice;
  }
  const { error } = await supabase
    .from('bookings')
    .update(payload)
    .eq('id', bookingId);
  return !error;
}

/** Acknowledge a booking (supplier confirms receipt). */
export async function acknowledgeBooking(bookingId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('bookings')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', bookingId);
  return !error;
}

/** Batch cancel: cancel all bookings for given listing(s) in date range. Returns count cancelled. */
export async function batchCancelBookings(
  supplierId: string,
  params: {
    listingIds: string[];
    dateFrom: string;
    dateTo: string;
    cancellation_reason: string;
    refund_choice?: 'full_refund' | 'no_refund' | 'reschedule';
  }
): Promise<{ count: number; error?: string }> {
  if (!supabase) return { count: 0, error: 'Supabase not configured' };
  const { data: myListings } = await supabase
    .from('listings')
    .select('id')
    .eq('supplier_id', supplierId)
    .in('id', params.listingIds);
  const ids = (myListings ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return { count: 0 };
  const { data: toCancel } = await supabase
    .from('bookings')
    .select('id')
    .in('listing_id', ids)
    .gte('booking_date', params.dateFrom)
    .lte('booking_date', params.dateTo)
    .neq('status', 'cancelled');
  const bookingIds = (toCancel ?? []).map((b: { id: string }) => b.id);
  for (const id of bookingIds) {
    await updateBookingStatus(id, 'cancelled', {
      cancellation_reason: params.cancellation_reason,
      refund_choice: params.refund_choice,
    });
  }
  return { count: bookingIds.length };
}

/** Fetch current consumer's bookings (RLS: select where guest_email = auth user email). Must be logged in. Throws on Supabase error. */
export async function fetchMyBookings(): Promise<BookingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, cancellation_reason, refund_choice, cancelled_at, acknowledged_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingRow[];
}
