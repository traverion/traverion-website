import { supabase } from '../lib/supabase';
import { userFacingError } from '../lib/userFacingError';
import { snapshotSupplierCancellationPolicy } from '../lib/cancellation-policy';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';
import { supplierPortalPublicBaseUrl } from '../lib/partnerHost';
import { notifySupplierEvent } from './supabase-supplier-messaging';
import { resolveSupplierId } from './supabase-supplier-team';
import { fetchListingSupplierMetaForParty } from './supabase-listings';
import {
  BOOKING_MESSAGE_SUBMIT_ERROR,
  PARTNER_CANCEL_REQUEST_SUBMIT_ERROR,
} from '../lib/booking-confirmation-copy';
import { queryRowsOrThrow } from '../lib/query-rows-or-throw';
import { createInflightCache } from '../lib/inflight-dedupe';
import {
  softNotifyFromEdgePayload,
  softNotifyFromSupplierInvoke,
  softNotifyWarningFromResults,
  type SoftNotifyResult,
} from '../lib/softNotify';

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
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingMessageRow[];
}

/** Short TTL so Dashboard unread + Inbox list share one latest-row fetch per booking. */
const latestMessageCache = createInflightCache<BookingMessageRow | null>({ ttlMs: 8_000 });

export function invalidateLatestBookingMessageCache(bookingId?: string): void {
  latestMessageCache.invalidate(bookingId);
}

/** Inbox list preview — one row per booking instead of the full thread history. */
export async function fetchLatestBookingMessage(
  bookingId: string
): Promise<BookingMessageRow | null> {
  const client = supabase;
  if (!client) return null;
  const id = bookingId.trim();
  if (!id) return null;
  return latestMessageCache.get(id, async () => {
    const { data, error } = await client
      .from('booking_messages')
      .select(
        'id, booking_id, sender_role, sender_user_id, body, created_at, read_by_traveler_at, read_by_supplier_at'
      )
      .eq('booking_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BookingMessageRow | null) ?? null;
  });
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
  // Failure must not look like "no open cancels" (Phase 1084).
  return queryRowsOrThrow(data, error) as CancellationRequestRow[];
}

export async function fetchOpenCancellationRequest(
  bookingId: string
): Promise<CancellationRequestRow | null> {
  const rows = await fetchCancellationRequestsForBookings([bookingId]);
  return rows.find((r) => r.status === 'requested') ?? null;
}

export async function fetchSupplierLedger(supplierId: string): Promise<SupplierLedgerEntry[]> {
  if (!supabase) return [];
  // Phase 1144: team JWT → owner supplier_id (parity with earnings 1140).
  const ownerSupplierId = await resolveSupplierId(supplierId);
  const { data, error } = await supabase
    .from('supplier_ledger_entries')
    .select('id, supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id, created_at')
    .eq('supplier_id', ownerSupplierId)
    .order('created_at', { ascending: false });
  // Failure must not look like "no ledger adjustments" (Phase 1087).
  return queryRowsOrThrow(data, error) as SupplierLedgerEntry[];
}

export async function postBookingMessage(bookingId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: BOOKING_MESSAGE_SUBMIT_ERROR };
  const { data, error } = await supabase.rpc('post_booking_message', {
    p_booking_id: bookingId,
    p_body: body,
  });
  const result = parseRpc(data, error?.message, BOOKING_MESSAGE_SUBMIT_ERROR);
  if (result.ok) invalidateLatestBookingMessageCache(bookingId);
  return result;
}

export async function markBookingMessagesRead(
  bookingId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: false, error: 'Could not mark messages as read.' };
  }
  const { data, error } = await supabase.rpc('mark_booking_messages_read', {
    p_booking_id: bookingId,
  });
  const result = parseRpc(data, error?.message, 'Could not mark messages as read.');
  if (result.ok) invalidateLatestBookingMessageCache(bookingId);
  return result;
}

export async function requestSupplierCancellation(params: {
  bookingId: string;
  reasonCode: string;
  reasonText: string;
  evidenceNote?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  id?: string;
  immediate?: boolean;
  autoRefundQueued?: boolean;
  beforeOfficialStart?: boolean;
  needsCustomerChoice?: boolean;
  isStay?: boolean;
  refundExecution?: { success: boolean; error?: string };
}> {
  if (!supabase) return { ok: false, error: PARTNER_CANCEL_REQUEST_SUBMIT_ERROR };
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
  const parsed = parseRpc(data, error?.message, PARTNER_CANCEL_REQUEST_SUBMIT_ERROR);
  if (!parsed.ok) return parsed;

  const rpc = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const autoRefundQueued = rpc.auto_refund_queued === true;
  // Phase 2/3: execute Stripe only when instruction queued (after-start / stay / traveler).
  // Tour before-start → pending_customer_choice — no execute until customer or deadline.
  let refundExecution: { success: boolean; error?: string } | undefined;
  if (autoRefundQueued) {
    const { executeBookingRefund } = await import('./supabase-bookings');
    refundExecution = await executeBookingRefund(params.bookingId);
  }
  return {
    ...parsed,
    immediate: rpc.immediate === true,
    autoRefundQueued,
    beforeOfficialStart: rpc.before_official_start === true,
    needsCustomerChoice: rpc.needs_customer_choice === true,
    isStay: rpc.is_stay === true,
    refundExecution,
  };
}

/** Phase 3: traveler claims pending_customer_choice → full refund + Stripe execute. */
export async function claimSupplierCancelRefundChoice(bookingId: string): Promise<{
  ok: boolean;
  error?: string;
  alreadyResolved?: boolean;
  refundExecution?: { success: boolean; error?: string };
}> {
  if (!supabase) return { ok: false, error: 'Could not start your refund.' };
  const { data, error } = await supabase.rpc('claim_supplier_cancel_refund_choice', {
    p_booking_id: bookingId,
    p_reason: 'supplier_cancel_customer_chose_refund',
  });
  const parsed = parseRpc(data, error?.message, 'Could not start your refund.');
  if (!parsed.ok) {
    const rpc = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    return {
      ...parsed,
      alreadyResolved: rpc.error === 'already_resolved',
    };
  }
  const { executeBookingRefund } = await import('./supabase-bookings');
  const refundExecution = await executeBookingRefund(bookingId);
  return { ...parsed, refundExecution };
}

/** Phase 3: traveler reschedules a supplier-cancelled tour onto a real departure. */
export async function rescheduleSupplierCancelledBooking(params: {
  bookingId: string;
  newDate: string;
  newStartTimeHm: string;
}): Promise<{
  ok: boolean;
  error?: string;
  newBookingId?: string;
  alreadyResolved?: boolean;
  inventoryUnavailable?: boolean;
  deadlinePassed?: boolean;
}> {
  if (!supabase) return { ok: false, error: 'Could not reschedule this booking.' };
  const { data, error } = await supabase.rpc('reschedule_supplier_cancelled_booking', {
    p_booking_id: params.bookingId,
    p_new_date: params.newDate,
    p_new_start_time: params.newStartTimeHm,
  });
  const parsed = parseRpc(data, error?.message, 'Could not reschedule this booking.');
  const rpc = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (!parsed.ok) {
    return {
      ...parsed,
      alreadyResolved: rpc.error === 'already_resolved',
      inventoryUnavailable: rpc.inventory_unavailable === true,
      deadlinePassed: rpc.deadline_passed === true,
    };
  }
  const newBookingId = typeof rpc.new_booking_id === 'string' ? rpc.new_booking_id : undefined;
  // Soft notify — reschedule already committed; email failure must not undo it.
  if (newBookingId) {
    try {
      const { data: row } = await supabase
        .from('bookings')
        .select(
          'id, listing_id, guest_email, guest_name, booking_date, start_time, booking_number, guests, purchase_snapshot'
        )
        .eq('id', newBookingId)
        .maybeSingle();
      if (row) {
        const title =
          (row.purchase_snapshot as { listingTitle?: string } | null)?.listingTitle ?? 'Booking';
        const newHm = String(rpc.start_time ?? '').trim();
        const newDate = String(rpc.booking_date ?? row.booking_date ?? '').slice(0, 10);
        await supabase.functions.invoke('notify-customer-booking', {
          body: {
            customerEmail: (row.guest_email ?? '').trim() || 'resolve@guest.local',
            customerName: row.guest_name ?? undefined,
            listingTitle: title,
            bookingId: newBookingId,
            bookingNumber: row.booking_number ?? undefined,
            bookingDate: newDate || undefined,
            emailKind: 'host_updated_schedule',
            fieldDiffs: [
              {
                label: 'Status',
                before: 'Cancelled by operator',
                after: 'Rescheduled — confirmed',
              },
              {
                label: 'New departure',
                before: '—',
                after: `${newDate}${newHm ? ` · ${newHm}` : ''}`,
              },
            ],
            publicSiteUrl: publicSiteBaseUrl(),
            idempotencyKey: `customer:reschedule_confirmed:${params.bookingId}:${newBookingId}`,
          },
        });
        const meta = await fetchListingSupplierMetaForParty(row.listing_id);
        const supplierId = meta?.supplier_id ? await resolveSupplierId(meta.supplier_id) : null;
        if (supplierId) {
          await notifySupplierEvent({
            supplierId,
            eventType: 'booking_detail_changed',
            listingId: row.listing_id,
            listingTitle: title,
            bookingId: newBookingId,
            bookingDate: newDate || undefined,
            guests: row.guests ?? undefined,
            guestName: row.guest_name ?? undefined,
            bookingNumber: typeof row.booking_number === 'number' ? row.booking_number : undefined,
            changeSummary: `Traveler rescheduled after operator cancellation to ${newDate}${
              newHm ? ` ${newHm}` : ''
            }. Payment preserved — no new charge.`,
            fieldDiffs: [
              {
                label: 'Departure',
                before: 'Cancelled departure',
                after: `${newDate}${newHm ? ` · ${newHm}` : ''}`,
              },
            ],
            idempotencyKey: `supplier:reschedule_confirmed:${params.bookingId}:${newBookingId}`,
            portalBaseUrl: supplierPortalPublicBaseUrl(),
          });
        }
      }
    } catch {
      // Soft notify only.
    }
  }
  return {
    ...parsed,
    newBookingId,
  };
}

export async function respondToCancellationRequest(
  requestId: string,
  accept: boolean,
  options?: { bookingId?: string | null }
): Promise<{ ok: boolean; error?: string; refundExecution?: { success: boolean; error?: string } }> {
  if (!supabase) return { ok: false, error: 'Could not update this cancellation request.' };
  const { data, error } = await supabase.rpc('respond_cancellation_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  const parsed = parseRpc(data, error?.message, 'Could not update this cancellation request.');
  if (!parsed.ok || !accept) return parsed;

  const bookingId = (options?.bookingId ?? '').trim();
  if (!bookingId) return parsed;

  // Step 2.3: supplier-accepted cancel → full refund for stays (idempotent).
  const { executeBookingRefund } = await import('./supabase-bookings');
  const refundExecution = await executeBookingRefund(bookingId);
  return { ...parsed, refundExecution };
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
  /** Phase 1712: cancellation_requests.id so a re-request after decline is not already_sent. */
  requestId?: string | null;
  /** Phase 3: Tour before start — customer must choose refund or reschedule. */
  needsCustomerChoice?: boolean;
  /** Official start deadline label for email (local activity timezone). */
  choiceDeadlineLabel?: string | null;
  startTimeLabel?: string | null;
}): Promise<SoftNotifyResult> {
  if (!supabase) return { sent: false, error: 'Supabase not configured' };
  const reqSuffix = (params.requestId ?? '').trim() || String(Date.now());
  const choose = params.needsCustomerChoice === true;
  const emailKind = choose
    ? 'supplier_cancelled_choose_resolution'
    : 'cancellation_requested_by_supplier';
  const idempotencyKey = choose
    ? `customer:supplier_cancelled_choose:${params.bookingId}:${reqSuffix}`
    : `customer:cancellation_by_supplier:${params.bookingId}:${reqSuffix}`;
  const fieldDiffs = choose
    ? [
        { label: 'Reason', before: 'Active booking', after: params.reasonLabel },
        {
          label: 'Status',
          before: 'Confirmed',
          after: 'Cancelled by operator — choose a full refund or another departure in Trips',
        },
        ...(params.startTimeLabel
          ? [{ label: 'Original start', before: '—', after: params.startTimeLabel }]
          : []),
        ...(params.choiceDeadlineLabel
          ? [
              {
                label: 'Choose by',
                before: '—',
                after: params.choiceDeadlineLabel,
              },
            ]
          : []),
      ]
    : [
        { label: 'Reason', before: 'Active booking', after: params.reasonLabel },
        {
          label: 'Status',
          before: 'Confirmed',
          after: 'Cancelled by operator — a full refund is due. Open Trips for details.',
        },
      ];
  const { data, error } = await supabase.functions.invoke('notify-customer-booking', {
    body: {
      customerEmail: params.customerEmail,
      customerName: params.customerName ?? undefined,
      listingTitle: params.listingTitle,
      bookingId: params.bookingId,
      bookingNumber: params.bookingNumber,
      bookingDate: params.bookingDate ?? undefined,
      emailKind,
      fieldDiffs,
      publicSiteUrl: publicSiteBaseUrl(),
      idempotencyKey,
    },
  });
  // Phase 1859: return notify outcome — caller must not treat failure as RPC failure.
  return softNotifyFromEdgePayload(data, error);
}

export async function notifyCancellationResolved(params: {
  accepted: boolean;
  customerEmail?: string | null;
  customerName?: string | null;
  listingTitle: string;
  bookingId: string;
  bookingNumber?: number;
  bookingDate?: string | null;
  /** Phase 1707: optional — host notify skipped when unpublished listing hid supplier_id. */
  supplierId?: string | null;
  listingId: string;
  guests?: number;
  /** Phase 1721: cancellation_requests.id so a second Decline/Accept after re-request is not already_sent. */
  requestId?: string | null;
}): Promise<SoftNotifyResult> {
  if (!supabase) return { sent: false, error: 'Supabase not configured' };
  const kind = params.accepted ? 'cancellation_accepted' : 'cancellation_declined';
  const reqSuffix = (params.requestId ?? '').trim() || String(Date.now());
  const guestEmail = (params.customerEmail ?? '').trim().toLowerCase();
  // Phase 1707: traveler self-receipt must not depend on resolving supplier_id.
  // Phase 1788: invoke even when guest_email blank — edge resolves via guest_user_id.
  // Phase 1859: await and report — do not void.
  const customer = await supabase.functions.invoke('notify-customer-booking', {
    body: {
      customerEmail: guestEmail || 'resolve@guest.local',
      customerName: params.customerName ?? undefined,
      listingTitle: params.listingTitle,
      bookingId: params.bookingId,
      bookingNumber: params.bookingNumber,
      bookingDate: params.bookingDate ?? undefined,
      emailKind: kind,
      publicSiteUrl: publicSiteBaseUrl(),
      // Phase 1721: per-request key (parity with 1712 cancel request).
      idempotencyKey: `customer:${kind}:${params.bookingId}:${reqSuffix}`,
    },
  });
  const customerResult = softNotifyFromEdgePayload(customer.data, customer.error);
  const supplierId = (params.supplierId ?? '').trim();
  // Phase 1729: resolve owner via party RPC when Trips ops cache lacked supplier_id
  // (unpublished listing / ops load failure) — parity with Phase 1707 cancel/notes.
  let hostSupplierId = supplierId;
  if (!hostSupplierId && params.listingId) {
    const meta = await fetchListingSupplierMetaForParty(params.listingId);
    hostSupplierId = (meta.supplier_id ?? '').trim();
  }
  let hostResult: SoftNotifyResult = { sent: true, skipped: true };
  if (hostSupplierId) {
    hostResult = softNotifyFromSupplierInvoke(
      await notifySupplierEvent({
        supplierId: hostSupplierId,
        eventType: params.accepted ? 'cancellation_accepted' : 'cancellation_declined',
        listingId: params.listingId,
        listingTitle: params.listingTitle,
        bookingId: params.bookingId,
        bookingDate: params.bookingDate ?? undefined,
        guests: params.guests,
        guestName: params.customerName ?? undefined,
        portalBaseUrl: supplierPortalPublicBaseUrl(),
        bookingNumber: params.bookingNumber,
        idempotencyKey: `supplier:${kind}:${params.bookingId}:${reqSuffix}`,
      })
    );
  }
  const warning = softNotifyWarningFromResults(customerResult, hostResult);
  if (!warning) return { sent: true };
  return { sent: false, error: warning };
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
}): Promise<SoftNotifyResult> {
  if (!supabase) return { sent: false, error: 'Supabase not configured' };
  if (params.fromRole === 'traveler') {
    let supplierId = (params.supplierId ?? '').trim();
    // Phase 1729: Inbox host mail must not depend on Trips ops cache (1707 cancel/notes parity).
    if (!supplierId && params.listingId) {
      const meta = await fetchListingSupplierMetaForParty(params.listingId);
      supplierId = (meta.supplier_id ?? '').trim();
    }
    if (!supplierId) return { sent: false, skipped: true };
    // Phase 1859: await notify outcome for soft UI.
    return softNotifyFromSupplierInvoke(
      await notifySupplierEvent({
        supplierId,
        eventType: 'guest_message',
        listingId: params.listingId,
        listingTitle: params.listingTitle,
        bookingId: params.bookingId,
        bookingDate: params.bookingDate ?? undefined,
        guestName: params.customerName ?? undefined,
        messagePreview: params.preview.slice(0, 280),
        portalBaseUrl: supplierPortalPublicBaseUrl(),
        bookingNumber: params.bookingNumber,
        // Phase 1710: do not share permanent supplier:guest_message:{bookingId} with Trips note updates.
        idempotencyKey: `supplier:guest_message:${params.bookingId}:inbox:${params.preview.slice(0, 80)}`,
      })
    );
  }
  // Phase 1788: invoke even when customerEmail blank — edge resolves via guest_user_id.
  const guestEmail = (params.customerEmail ?? '').trim().toLowerCase();
  const { data, error } = await supabase.functions.invoke('notify-customer-booking', {
    body: {
      customerEmail: guestEmail || 'resolve@guest.local',
      customerName: params.customerName ?? undefined,
      listingTitle: params.listingTitle,
      bookingId: params.bookingId,
      bookingNumber: params.bookingNumber,
      bookingDate: params.bookingDate ?? undefined,
      emailKind: 'new_booking_message',
      fieldDiffs: [{ label: 'Message', before: '—', after: params.preview.slice(0, 280) }],
      publicSiteUrl: publicSiteBaseUrl(),
      // Phase 1710: each host Inbox message must email the traveler (not one-shot per booking).
      idempotencyKey: `customer:new_booking_message:${params.bookingId}:${params.preview.slice(0, 80)}`,
    },
  });
  return softNotifyFromEdgePayload(data, error);
}
