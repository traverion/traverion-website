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
  status?: string;
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
    guests: data.travelers ?? 1,
    booking_date: data.departure_date || null,
    status: data.status ?? 'pending',
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
