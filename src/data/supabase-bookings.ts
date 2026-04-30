import { supabase } from '../lib/supabase';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { notifySupplierEvent } from './supabase-supplier-messaging';
import { hmToPgTime } from './supabase-listings';

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
  /** Local experience start time (Postgres time, e.g. 18:30:00). */
  start_time?: string | null;
  /** Assigned guest pickup time (local). */
  pickup_time?: string | null;
};

const BOOKING_LIST_COLUMNS =
  'id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, cancellation_reason, refund_choice, cancelled_at, acknowledged_at, created_at, start_time, pickup_time';

async function readEdgeFunctionErrorMessage(
  error: unknown,
  data: unknown
): Promise<string> {
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === 'string' && e.trim()) return e.trim();
  }
  const err = error as { message?: string; context?: { json?: () => Promise<unknown> } };
  if (err?.context && typeof err.context.json === 'function') {
    try {
      const body = (await err.context.json()) as { error?: unknown; message?: unknown };
      if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
      if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
    } catch {
      /* ignore */
    }
  }
  return typeof err?.message === 'string' && err.message.trim()
    ? err.message.trim()
    : 'Could not start checkout. Try again or contact support.';
}

export async function createBookingCheckoutSession(params: {
  listingId: string;
  listingTitle?: string;
  bookingDate: string;
  guests: number;
  customerName?: string;
  customerPhone?: string;
  specialRequests?: string;
  totalAmount: number;
  currency?: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ success: boolean; checkoutUrl?: string; bookingId?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('create-booking-checkout-session', {
    body: params,
  });
  if (error) {
    return { success: false, error: await readEdgeFunctionErrorMessage(error, data) };
  }
  const payload = data as { success?: unknown; checkoutUrl?: unknown; bookingId?: unknown; error?: unknown } | null;
  return {
    success: Boolean(payload?.success && payload?.checkoutUrl),
    checkoutUrl: typeof payload?.checkoutUrl === 'string' ? payload.checkoutUrl : undefined,
    bookingId: typeof payload?.bookingId === 'string' ? payload.bookingId : undefined,
    error: typeof payload?.error === 'string' ? payload.error : undefined,
  };
}

export async function submitBooking(
  data: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }
  const totalAmount = (data.total_price != null ? data.total_price : undefined) as number | undefined;
  const { data: listingData } = await supabase
    .from('listings')
    .select('supplier_id, title')
    .eq('id', data.tour_id)
    .maybeSingle();

  const guestEmailNorm = (data.customer_email ?? '').trim().toLowerCase() || null;
  const { data: authData } = await supabase.auth.getUser();
  const sessionUser = authData?.user;
  const sessionEmail = sessionUser?.email?.trim().toLowerCase() ?? '';
  const guest_user_id =
    sessionUser?.id && guestEmailNorm && sessionEmail === guestEmailNorm ? sessionUser.id : null;

  const { data: inserted, error } = await supabase.from('bookings').insert({
    listing_id: data.tour_id,
    guest_email: guestEmailNorm,
    guest_name: data.customer_name ?? null,
    guests: data.travelers ?? 1,
    booking_date: data.departure_date || null,
    status: data.status ?? 'confirmed',
    special_requests: data.special_requests ?? null,
    total_amount: totalAmount ?? null,
    currency: data.currency ?? 'USD',
    guest_user_id,
  }).select('id').maybeSingle();
  if (error) return { success: false, error: error.message };
  if (listingData?.supplier_id) {
    void notifySupplierEvent({
      supplierId: listingData.supplier_id,
      eventType: 'new_booking',
      listingId: data.tour_id,
      listingTitle: listingData.title ?? data.tour_title ?? undefined,
      bookingId: inserted?.id,
      bookingDate: data.departure_date,
      guests: data.travelers,
      guestName: data.customer_name,
      portalBaseUrl: supplierPortalPublicBaseUrl(),
    });
  }
  if (guestEmailNorm) {
    void supabase.functions.invoke('notify-customer-booking', {
      body: {
        customerEmail: guestEmailNorm,
        customerName: data.customer_name ?? undefined,
        listingTitle: listingData?.title ?? data.tour_title ?? 'Experience',
        bookingId: inserted?.id,
        bookingDate: data.departure_date ?? undefined,
        guests: data.travelers ?? undefined,
        totalAmount: totalAmount ?? undefined,
        currency: data.currency ?? 'USD',
      },
    });
  }
  return { success: true };
}

/**
 * Guest updates the note / special requests on their booking. Notifies the supplier by email (guest_message).
 */
export async function updateGuestBookingSpecialRequests(
  bookingId: string,
  specialRequests: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data: ok, error: rpcError } = await supabase.rpc('update_guest_booking_special_requests', {
    p_booking_id: bookingId,
    p_special_requests: specialRequests,
  });
  if (rpcError) return { success: false, error: rpcError.message };
  if (!ok) return { success: false, error: 'Could not update this booking.' };

  const { data: row } = await supabase
    .from('bookings')
    .select('id, listing_id, booking_date, guests, guest_name')
    .eq('id', bookingId)
    .maybeSingle();
  if (!row?.listing_id) return { success: true };

  const { data: listingData } = await supabase
    .from('listings')
    .select('supplier_id, title')
    .eq('id', row.listing_id)
    .maybeSingle();
  if (listingData?.supplier_id) {
    const preview =
      specialRequests.trim().length > 400 ? `${specialRequests.trim().slice(0, 400)}…` : specialRequests.trim();
    void notifySupplierEvent({
      supplierId: listingData.supplier_id,
      eventType: 'guest_message',
      listingId: row.listing_id,
      listingTitle: listingData.title ?? undefined,
      bookingId: row.id,
      bookingDate: row.booking_date ?? undefined,
      guests: Number(row.guests ?? 0),
      guestName: row.guest_name ?? undefined,
      messagePreview: preview || '(empty note)',
      portalBaseUrl: supplierPortalPublicBaseUrl(),
    });
  }
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
    .select(BOOKING_LIST_COLUMNS)
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

/** Set per-booking start and pickup times (supplier; RLS: own listing’s bookings). Times are HH:MM or empty to clear. */
export async function updateBookingSchedule(
  bookingId: string,
  params: { start_time?: string | null; pickup_time?: string | null }
): Promise<boolean> {
  if (!supabase) return false;
  const payload: Record<string, unknown> = {};
  if ('start_time' in params) payload.start_time = hmToPgTime(params.start_time ?? null);
  if ('pickup_time' in params) payload.pickup_time = hmToPgTime(params.pickup_time ?? null);
  if (Object.keys(payload).length === 0) return true;
  const { error } = await supabase.from('bookings').update(payload).eq('id', bookingId);
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

/** Consumer cancels own booking. RLS allows update only when guest_email = auth user. Sets refund_choice to full_refund if tour start is >24h away, else no_refund. */
export async function cancelBookingAsCustomer(
  bookingId: string,
  refundChoice: 'full_refund' | 'no_refund'
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      refund_choice: refundChoice,
    })
    .eq('id', bookingId);
  if (error) return { success: false, error: error.message };
  const { data: bookingMeta } = await supabase
    .from('bookings')
    .select('id, listing_id, booking_date, guests, guest_name')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingMeta?.listing_id) {
    const { data: listingData } = await supabase
      .from('listings')
      .select('supplier_id, title')
      .eq('id', bookingMeta.listing_id)
      .maybeSingle();
    if (listingData?.supplier_id) {
      void notifySupplierEvent({
        supplierId: listingData.supplier_id,
        eventType: 'booking_cancelled',
        listingId: bookingMeta.listing_id,
        listingTitle: listingData.title ?? undefined,
        bookingId: bookingMeta.id,
        bookingDate: bookingMeta.booking_date ?? undefined,
        guests: Number(bookingMeta.guests ?? 0),
        guestName: bookingMeta.guest_name ?? undefined,
        portalBaseUrl: supplierPortalPublicBaseUrl(),
      });
    }
  }
  return { success: true };
}

/** Fetch current consumer's bookings (RLS: select where guest_email = auth user email). Must be logged in. Throws on Supabase error. */
export async function fetchMyBookings(): Promise<BookingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_LIST_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingRow[];
}
