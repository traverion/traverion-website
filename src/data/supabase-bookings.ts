import { supabase } from '../lib/supabase';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { notifySupplierEvent } from './supabase-supplier-messaging';
import { hmToPgTime, pgTimeToHm } from './supabase-listings';

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
  /** App-wide sequential order # (1 = first booking ever); display as #N. */
  booking_number?: number | null;
  /** Present when selected with payment columns (supplier list, dashboard). */
  payment_status?: string;
  checkout_session_id?: string | null;
  amount_paid?: number | null;
  currency?: string | null;
};

/** Consumer booking row including Stripe payment fields (RLS same as BookingRow). */
export type BookingWithPaymentRow = BookingRow;

const BOOKING_LIST_COLUMNS =
  'id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, cancellation_reason, refund_choice, cancelled_at, acknowledged_at, created_at, start_time, pickup_time, booking_number';

const BOOKING_PAYMENT_COLUMNS = `${BOOKING_LIST_COLUMNS}, payment_status, checkout_session_id, amount_paid, currency`;

/** Pre–migration 047 (no booking_number). */
const BOOKING_PAYMENT_COLUMNS_LEGACY =
  'id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, cancellation_reason, refund_choice, cancelled_at, acknowledged_at, created_at, start_time, pickup_time, payment_status, checkout_session_id, amount_paid, currency';

/** Pre–migration 045 (no Stripe payment columns). */
const BOOKING_LIST_COLUMNS_LEGACY =
  'id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, cancellation_reason, refund_choice, cancelled_at, acknowledged_at, created_at, start_time, pickup_time';

/** Core columns from early migrations (no ops / schedule fields). */
const BOOKING_CORE_COLUMNS =
  'id, listing_id, guest_email, guest_name, guests, booking_date, status, special_requests, created_at';

function isLikelyMissingColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('unknown column') ||
    (m.includes('column') && m.includes('bookings'))
  );
}

function blankForEmail(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  return t ? t : '—';
}

function extractPlaceOfStayFromNotes(notes: string | null | undefined): string {
  const text = (notes ?? '').trim();
  if (!text) return '';
  const line = text
    .split(/\n+/)
    .map((l) => l.trim())
    .find((l) => /^place of stay:/i.test(l));
  return line ? line.replace(/^place of stay:/i, '').trim() : '';
}

function stripPlaceLineFromNotes(notes: string | null | undefined): string {
  return (notes ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^place of stay:/i.test(l))
    .join('\n')
    .trim();
}

function truncateForEmail(s: string, max: number): string {
  const t = s.trim();
  if (!t || t === '—') return '—';
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function timeForEmail(pg: string | null | undefined): string {
  if (!pg || !String(pg).trim()) return '—';
  return pgTimeToHm(pg) ?? String(pg).slice(0, 5);
}

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
  bookingId?: string;
  listingId: string;
  listingTitle?: string;
  bookingDate: string;
  guests: number;
  customerName?: string;
  customerPhone?: string;
  specialRequests?: string;
  /** Display-only; Stripe amount is computed on the server from listing + discounts. */
  totalAmount?: number;
  currency?: string;
  bookingOptionId?: string;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ success: boolean; checkoutUrl?: string; bookingId?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('create-booking-checkout-session', {
    body: {
      bookingId: params.bookingId,
      listingId: params.listingId,
      listingTitle: params.listingTitle,
      bookingDate: params.bookingDate,
      guests: params.guests,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      specialRequests: params.specialRequests,
      currency: params.currency,
      bookingOptionId: params.bookingOptionId,
      successPath: params.successPath,
      cancelPath: params.cancelPath,
    },
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

export async function resumePendingBookingCheckout(params: {
  bookingId: string;
}): Promise<{ success: boolean; checkoutUrl?: string; bookingId?: string; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data, error } = await supabase.functions.invoke('create-booking-checkout-session', {
    body: {
      bookingId: params.bookingId,
      successPath: '/booking-confirmed',
      cancelPath: '/bookings?payment=cancelled',
    },
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

  const formEmailNorm = (data.customer_email ?? '').trim().toLowerCase() || null;
  const { data: authData } = await supabase.auth.getUser();
  const sessionUser = authData?.user;
  const sessionEmail = sessionUser?.email?.trim().toLowerCase() ?? '';

  /** Logged-in travelers: row always uses account email + user id (RLS + transactional mail). */
  let guestEmailNorm: string | null = null;
  let guest_user_id: string | null = null;
  if (sessionUser?.id && sessionEmail) {
    guestEmailNorm = sessionEmail;
    guest_user_id = sessionUser.id;
  } else if (formEmailNorm) {
    guestEmailNorm = formEmailNorm;
    guest_user_id = null;
  }

  if (!guestEmailNorm) {
    return { success: false, error: 'Sign in to book, or provide a valid email address.' };
  }

  let special_requests = data.special_requests ?? null;
  if (sessionEmail && formEmailNorm && formEmailNorm !== sessionEmail) {
    const line = `Contact email entered on form: ${formEmailNorm}`;
    special_requests = special_requests?.trim() ? `${line}\n\n${special_requests}` : line;
  }

  const { data: inserted, error } = await supabase.from('bookings').insert({
    listing_id: data.tour_id,
    guest_email: guestEmailNorm,
    guest_name: data.customer_name ?? null,
    guests: data.travelers ?? 1,
    booking_date: data.departure_date || null,
    status: data.status ?? 'confirmed',
    special_requests,
    total_amount: totalAmount ?? null,
    currency: data.currency ?? 'USD',
    guest_user_id,
  }).select('id, booking_number').maybeSingle();
  if (error) return { success: false, error: error.message };
  const orderNum =
    typeof inserted?.booking_number === 'number' && Number.isFinite(inserted.booking_number)
      ? Math.floor(inserted.booking_number)
      : undefined;
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
      bookingPaymentStatus: 'none',
      bookingNumber: orderNum,
    });
  }
  if (guestEmailNorm) {
    void supabase.functions.invoke('notify-customer-booking', {
      body: {
        customerEmail: guestEmailNorm,
        customerName: data.customer_name ?? undefined,
        listingTitle: listingData?.title ?? data.tour_title ?? 'Experience',
        bookingId: inserted?.id,
        bookingNumber: orderNum,
        bookingDate: data.departure_date ?? undefined,
        guests: data.travelers ?? undefined,
        totalAmount: totalAmount ?? undefined,
        currency: data.currency ?? 'USD',
        emailKind: 'booking_request',
        publicSiteUrl: publicSiteBaseUrl(),
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

  const { data: prevSnap } = await supabase
    .from('bookings')
    .select('special_requests, guest_email, guest_name, listing_id, booking_date, guests')
    .eq('id', bookingId)
    .maybeSingle();
  const prevNotes = prevSnap?.special_requests ?? null;

  const { data: ok, error: rpcError } = await supabase.rpc('update_guest_booking_special_requests', {
    p_booking_id: bookingId,
    p_special_requests: specialRequests,
  });
  if (rpcError) return { success: false, error: rpcError.message };
  if (!ok) return { success: false, error: 'Could not update this booking.' };

  const { data: row } = await supabase
    .from('bookings')
    .select('id, listing_id, booking_date, guests, guest_name, guest_email, booking_number')
    .eq('id', bookingId)
    .maybeSingle();
  if (!row?.listing_id) return { success: true };

  const { data: listingData } = await supabase
    .from('listings')
    .select('supplier_id, title')
    .eq('id', row.listing_id)
    .maybeSingle();

  const prevPlace = extractPlaceOfStayFromNotes(prevNotes);
  const nextPlace = extractPlaceOfStayFromNotes(specialRequests);
  const prevOther = stripPlaceLineFromNotes(prevNotes);
  const nextOther = stripPlaceLineFromNotes(specialRequests);

  const fieldDiffs: { label: string; before: string; after: string }[] = [];
  if (prevPlace !== nextPlace) {
    fieldDiffs.push({
      label: 'Place of stay / meeting details',
      before: blankForEmail(prevPlace),
      after: blankForEmail(nextPlace),
    });
  }
  if (prevOther !== nextOther) {
    fieldDiffs.push({
      label: 'Other notes for the host',
      before: truncateForEmail(blankForEmail(prevOther), 500),
      after: truncateForEmail(nextOther, 500),
    });
  }

  if (listingData?.supplier_id) {
    const preview =
      specialRequests.trim().length > 400 ? `${specialRequests.trim().slice(0, 400)}…` : specialRequests.trim();
    const ord =
      typeof row.booking_number === 'number' && Number.isFinite(row.booking_number)
        ? Math.floor(row.booking_number)
        : undefined;
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
      fieldDiffs: fieldDiffs.length ? fieldDiffs : undefined,
      bookingNumber: ord,
    });
  }

  const guestEmail = (row.guest_email ?? '').trim().toLowerCase();
  if (guestEmail && fieldDiffs.length > 0) {
    const ord =
      typeof row.booking_number === 'number' && Number.isFinite(row.booking_number)
        ? Math.floor(row.booking_number)
        : undefined;
    void supabase.functions.invoke('notify-customer-booking', {
      body: {
        customerEmail: guestEmail,
        customerName: row.guest_name ?? undefined,
        listingTitle: listingData?.title ?? 'Experience',
        bookingId: row.id,
        bookingNumber: ord,
        bookingDate: row.booking_date ?? undefined,
        guests: row.guests ?? undefined,
        emailKind: 'your_details_updated',
        fieldDiffs,
        publicSiteUrl: publicSiteBaseUrl(),
      },
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

  const columnTiers = [
    BOOKING_PAYMENT_COLUMNS,
    BOOKING_PAYMENT_COLUMNS_LEGACY,
    BOOKING_LIST_COLUMNS_LEGACY,
    BOOKING_CORE_COLUMNS,
  ];
  let lastError: string | null = null;
  for (const columns of columnTiers) {
    const { data, error } = await supabase
      .from('bookings')
      .select(columns)
      .in('listing_id', ids)
      .order('created_at', { ascending: false });
    if (!error) return (data ?? []) as BookingRow[];
    lastError = error.message;
    if (!isLikelyMissingColumnError(error.message)) break;
  }
  throw new Error(lastError ?? 'Could not load bookings');
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

  const { data: prior, error: priorErr } = await supabase
    .from('bookings')
    .select('start_time, pickup_time, guest_email, guest_name, booking_date, listing_id, guests, booking_number')
    .eq('id', bookingId)
    .maybeSingle();
  if (priorErr || !prior) return false;

  const nextStartPg = 'start_time' in params ? hmToPgTime(params.start_time ?? null) : prior.start_time;
  const nextPickupPg = 'pickup_time' in params ? hmToPgTime(params.pickup_time ?? null) : prior.pickup_time;

  const startChanged =
    'start_time' in params && String(prior.start_time ?? '') !== String(nextStartPg ?? '');
  const pickupChanged =
    'pickup_time' in params && String(prior.pickup_time ?? '') !== String(nextPickupPg ?? '');

  const payload: Record<string, unknown> = {};
  if ('start_time' in params) payload.start_time = nextStartPg;
  if ('pickup_time' in params) payload.pickup_time = nextPickupPg;
  if (Object.keys(payload).length === 0) return true;

  const { error } = await supabase.from('bookings').update(payload).eq('id', bookingId);
  if (error) return false;

  if (!startChanged && !pickupChanged) return true;

  const fieldDiffs: { label: string; before: string; after: string }[] = [];
  if (startChanged) {
    fieldDiffs.push({
      label: 'Experience start time',
      before: timeForEmail(prior.start_time),
      after: timeForEmail(nextStartPg),
    });
  }
  if (pickupChanged) {
    fieldDiffs.push({
      label: 'Guest pickup time',
      before: timeForEmail(prior.pickup_time),
      after: timeForEmail(nextPickupPg),
    });
  }

  if (fieldDiffs.length === 0) return true;

  let listingTitle = 'Your experience';
  let supplierId: string | null = null;
  if (prior.listing_id) {
    const { data: lt } = await supabase
      .from('listings')
      .select('title, supplier_id')
      .eq('id', prior.listing_id)
      .maybeSingle();
    if (lt?.title?.trim()) listingTitle = lt.title.trim();
    if (lt?.supplier_id) supplierId = String(lt.supplier_id);
  }

  const ord =
    typeof prior.booking_number === 'number' && Number.isFinite(prior.booking_number)
      ? Math.floor(prior.booking_number)
      : undefined;

  const guestEmail = (prior.guest_email ?? '').trim().toLowerCase();
  if (guestEmail) {
    void supabase.functions.invoke('notify-customer-booking', {
      body: {
        customerEmail: guestEmail,
        customerName: prior.guest_name ?? undefined,
        listingTitle,
        bookingId,
        bookingNumber: ord,
        bookingDate: prior.booking_date ?? undefined,
        emailKind: 'host_updated_schedule',
        fieldDiffs,
        publicSiteUrl: publicSiteBaseUrl(),
      },
    });
  }

  if (supplierId) {
    void notifySupplierEvent({
      supplierId,
      eventType: 'host_schedule_updated',
      listingId: prior.listing_id ?? undefined,
      listingTitle,
      bookingId,
      bookingDate: prior.booking_date ?? undefined,
      guests: typeof prior.guests === 'number' ? prior.guests : undefined,
      guestName: prior.guest_name ?? undefined,
      fieldDiffs,
      portalBaseUrl: supplierPortalPublicBaseUrl(),
      bookingNumber: ord,
    });
  }

  return true;
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
    .select('id, listing_id, booking_date, guests, guest_name, guest_email, refund_choice, booking_number')
    .eq('id', bookingId)
    .maybeSingle();

  let listingTitle = 'Experience';
  const cancelOrd =
    typeof bookingMeta?.booking_number === 'number' && Number.isFinite(bookingMeta.booking_number)
      ? Math.floor(bookingMeta.booking_number)
      : undefined;
  if (bookingMeta?.listing_id) {
    const { data: listingData } = await supabase
      .from('listings')
      .select('supplier_id, title')
      .eq('id', bookingMeta.listing_id)
      .maybeSingle();
    if (listingData?.title?.trim()) listingTitle = listingData.title.trim();
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
        bookingNumber: cancelOrd,
      });
    }
  }

  const guestEmail = (bookingMeta?.guest_email ?? '').trim().toLowerCase();
  if (guestEmail) {
    void supabase.functions.invoke('notify-customer-booking', {
      body: {
        customerEmail: guestEmail,
        customerName: bookingMeta?.guest_name ?? undefined,
        listingTitle,
        bookingId: bookingMeta?.id,
        bookingNumber: cancelOrd,
        bookingDate: bookingMeta?.booking_date ?? undefined,
        guests: bookingMeta?.guests ?? undefined,
        emailKind: 'booking_cancelled',
        fieldDiffs: [
          {
            label: 'Cancellation & refund',
            before: 'Active booking',
            after:
              refundChoice === 'full_refund'
                ? 'Cancelled — full refund per policy where applicable'
                : 'Cancelled — no refund per policy for this date',
          },
        ],
        publicSiteUrl: publicSiteBaseUrl(),
      },
    });
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

/**
 * Fetch the signed-in guest's booking by Stripe Checkout session id (RLS).
 * Used after redirect from Stripe to show the confirmation screen.
 */
export async function fetchMyBookingByCheckoutSessionId(
  checkoutSessionId: string
): Promise<BookingWithPaymentRow | null> {
  if (!supabase) return null;
  const id = checkoutSessionId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_PAYMENT_COLUMNS)
    .eq('checkout_session_id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as BookingWithPaymentRow | null;
}
