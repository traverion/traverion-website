import { supabase } from '../lib/supabase';
import { userFacingError } from '../lib/userFacingError';
import { snapshotSupplierCancellationPolicy } from '../lib/cancellation-policy';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { notifySupplierEvent } from './supabase-supplier-messaging';

export type BookingMessageRow = {
  id: string;
  booking_id: string;
  sender_role: 'traveler' | 'supplier' | 'system';
  sender_user_id: string | null;
  body: string;
  created_at: string;
  read_by_traveler_at: string | null;
  read_by_supplier_at: string | null;
};

export type CancellationRequestRow = {
  id: string;
  booking_id: string;
  requested_by: 'traveler' | 'supplier';
  requester_user_id: string | null;
  reason_code: string;
  reason_text: string;
  evidence_note: string | null;
  status: string;
  policy_snapshot: Record<string, unknown> | null;
  applied_fee: number;
  fee_currency: string;
  traveler_refund_expectation: string;
  created_at: string;
  expires_at: string | null;
  responded_at: string | null;
};

export type SupplierLedgerEntry = {
  id: string;
  supplier_id: string;
  booking_id: string | null;
  kind: string;
  amount: number;
  currency: string;
  reason: string;
  source_id: string;
  policy_id: string | null;
  created_at: string;
};

type RpcOk = { ok: boolean; error?: string; id?: string; already?: boolean; status?: string };

function parseRpc(data: unknown, errorMessage: string | undefined, fallback: string): RpcOk {
  if (errorMessage) return { ok: false, error: userFacingError(errorMessage, fallback) };
  if (!data || typeof data !== 'object') return { ok: false, error: fallback };
  const row = data as RpcOk;
  if (row.ok) return row;
  return { ok: false, error: userFacingError(row.error, fallback) };
}

export async function fetchBookingMessages(bookingId: string): Promise<BookingMessageRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('booking_messages')
    .select(
      'id, booking_id, sender_role, sender_user_id, body, created_at, read_by_traveler_at, read_by_supplier_at'
    )
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as BookingMessageRow[];
}

export async function fetchCancellationRequestsForBookings(
  bookingIds: string[]
): Promise<CancellationRequestRow[]> {
  if (!supabase || bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cancellation_requests')
    .select(
      'id, booking_id, requested_by, requester_user_id, reason_code, reason_text, evidence_note, status, policy_snapshot, applied_fee, fee_currency, traveler_refund_expectation, created_at, expires_at, responded_at'
    )
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as CancellationRequestRow[];
}

export async function fetchOpenCancellationRequest(
  bookingId: string
): Promise<CancellationRequestRow | null> {
  const rows = await fetchCancellationRequestsForBookings([bookingId]);
  return rows.find((r) => r.status === 'requested') ?? null;
}

export async function fetchSupplierLedger(supplierId: string): Promise<SupplierLedgerEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('supplier_ledger_entries')
    .select('id, supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id, created_at')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as SupplierLedgerEntry[];
}

export async function postBookingMessage(bookingId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Could not send that message.' };
  const { data, error } = await supabase.rpc('post_booking_message', {
    p_booking_id: bookingId,
    p_body: body,
  });
  return parseRpc(data, error?.message, 'Could not send that message.');
}

export async function markBookingMessagesRead(bookingId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('mark_booking_messages_read', { p_booking_id: bookingId });
}

export async function requestSupplierCancellation(params: {
  bookingId: string;
  reasonCode: string;
  reasonText: string;
  evidenceNote?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!supabase) return { ok: false, error: 'Could not send the cancellation request.' };
  const snap = snapshotSupplierCancellationPolicy(params.reasonCode);
  const { data, error } = await supabase.rpc('request_supplier_cancellation', {
    p_booking_id: params.bookingId,
    p_reason_code: params.reasonCode,
    p_reason_text: params.reasonText,
    p_evidence_note: params.evidenceNote ?? null,
    p_policy_snapshot: snap,
    p_applied_fee: snap.applied_fee,
    p_fee_currency: snap.currency,
  });
  return parseRpc(data, error?.message, 'Could not send the cancellation request.');
}

export async function respondToCancellationRequest(
  requestId: string,
  accept: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Could not update this cancellation request.' };
  const { data, error } = await supabase.rpc('respond_cancellation_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  return parseRpc(data, error?.message, 'Could not update this cancellation request.');
}

export { bookingAllowsMessaging, messagingComposeBlock } from '../lib/messaging-authorization';

export async function notifyTravelerCancellationRequest(params: {
  customerEmail: string;
  customerName?: string | null;
  listingTitle: string;
  bookingId: string;
  bookingNumber?: number;
  bookingDate?: string | null;
  reasonLabel: string;
}): Promise<void> {
  if (!supabase) return;
  await supabase.functions.invoke('notify-customer-booking', {
    body: {
      customerEmail: params.customerEmail,
      customerName: params.customerName ?? undefined,
      listingTitle: params.listingTitle,
      bookingId: params.bookingId,
      bookingNumber: params.bookingNumber,
      bookingDate: params.bookingDate ?? undefined,
      emailKind: 'cancellation_requested_by_supplier',
      fieldDiffs: [
        { label: 'Reason', before: 'Active booking', after: params.reasonLabel },
        { label: 'What you should do', before: '—', after: 'Open Trips and respond to the cancellation request.' },
      ],
      publicSiteUrl: publicSiteBaseUrl(),
    },
  });
}

export async function notifyCancellationResolved(params: {
  accepted: boolean;
  customerEmail: string;
  customerName?: string | null;
  listingTitle: string;
  bookingId: string;
  bookingNumber?: number;
  bookingDate?: string | null;
  supplierId: string;
  listingId: string;
  guests?: number;
}): Promise<void> {
  if (!supabase) return;
  const kind = params.accepted ? 'cancellation_accepted' : 'cancellation_declined';
  void supabase.functions.invoke('notify-customer-booking', {
    body: {
      customerEmail: params.customerEmail,
      customerName: params.customerName ?? undefined,
      listingTitle: params.listingTitle,
      bookingId: params.bookingId,
      bookingNumber: params.bookingNumber,
      bookingDate: params.bookingDate ?? undefined,
      emailKind: kind,
      publicSiteUrl: publicSiteBaseUrl(),
    },
  });
  void notifySupplierEvent({
    supplierId: params.supplierId,
    eventType: params.accepted ? 'cancellation_accepted' : 'cancellation_declined',
    listingId: params.listingId,
    listingTitle: params.listingTitle,
    bookingId: params.bookingId,
    bookingDate: params.bookingDate ?? undefined,
    guests: params.guests,
    guestName: params.customerName ?? undefined,
    portalBaseUrl: supplierPortalPublicBaseUrl(),
    bookingNumber: params.bookingNumber,
  });
}

export async function notifyNewBookingMessage(params: {
  fromRole: 'traveler' | 'supplier';
  preview: string;
  customerEmail?: string | null;
  customerName?: string | null;
  listingTitle: string;
  bookingId: string;
  bookingNumber?: number;
  bookingDate?: string | null;
  supplierId: string;
  listingId: string;
}): Promise<void> {
  if (!supabase) return;
  if (params.fromRole === 'traveler') {
    void notifySupplierEvent({
      supplierId: params.supplierId,
      eventType: 'guest_message',
      listingId: params.listingId,
      listingTitle: params.listingTitle,
      bookingId: params.bookingId,
      bookingDate: params.bookingDate ?? undefined,
      guestName: params.customerName ?? undefined,
      messagePreview: params.preview.slice(0, 280),
      portalBaseUrl: supplierPortalPublicBaseUrl(),
      bookingNumber: params.bookingNumber,
    });
  } else if (params.customerEmail) {
    void supabase.functions.invoke('notify-customer-booking', {
      body: {
        customerEmail: params.customerEmail,
        customerName: params.customerName ?? undefined,
        listingTitle: params.listingTitle,
        bookingId: params.bookingId,
        bookingNumber: params.bookingNumber,
        bookingDate: params.bookingDate ?? undefined,
        emailKind: 'new_booking_message',
        fieldDiffs: [{ label: 'Message', before: '—', after: params.preview.slice(0, 280) }],
        publicSiteUrl: publicSiteBaseUrl(),
      },
    });
  }
}
