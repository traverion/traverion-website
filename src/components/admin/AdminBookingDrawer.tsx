import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { invokeAdminEdgeFunction } from '../../lib/adminEdgeFunction';
import { formatMoney, appStripeIsTestMode, isStripeTestCheckoutSession } from '../../lib/money';
import { bookingLifecycleLabel } from '../../lib/status-language';
import { partnerPaymentLabel, isPaidPaymentStatus } from '../../lib/payment-states';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import {
  displayBookingContactPhoneFromPurchase,
  displayFulfillmentFromPurchase,
  displayListingTitleFromPurchase,
  displayMeetingPointFromPurchase,
  displayOptionLabelFromPurchase,
  displayPickupInstructionsFromPurchase,
  displayStartTimeFromPurchase,
  formatTravelerDepartureClock,
  displayDepartureTimezoneFromPurchase,
  isPurchaseSnapshot,
} from '../../lib/purchase-snapshot';
import { adminBookingDateLine } from '../../lib/admin-bookings-date-line';
import {
  adminBookingTotalMajor,
  adminPaymentExplanation,
  buildAdminBookingTimeline,
} from '../../lib/admin-booking-ops';
import { fromMinorUnits, toMinorUnits } from '../../lib/commercial-money';
import StatusChip, { toneForPaymentLabel } from '../StatusChip';
import NoticeCallout from '../NoticeCallout';
import type { AdminBookingRow } from './AdminBookingsPanel';

type Detail = {
  booking: AdminBookingRow & {
    special_requests?: string | null;
    cancellation_reason?: string | null;
    cancelled_at?: string | null;
    start_time?: string | null;
    pickup_time?: string | null;
    dispute_status?: string | null;
    dispute_id?: string | null;
  };
  listing: { id: string; title: string | null; image: string | null; city: string | null; supplier_id: string | null } | null;
  supplier: { id: string; display_name: string | null; company_legal_name: string | null } | null;
  paymentEvents: Array<{
    id: string;
    event_id: string | null;
    event_type: string;
    payment_intent_id: string | null;
    checkout_session_id: string | null;
    amount: number | null;
    currency: string | null;
    created_at: string;
  }>;
  emails: Array<{
    id: string;
    template_key: string;
    channel: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
  cancellations: Array<{
    id: string;
    requested_by: string;
    reason_code: string;
    status: string;
    created_at: string;
    responded_at: string | null;
  }>;
  investigation: {
    ok?: boolean;
    snapshot?: {
      gross_minor?: number;
      commission_minor?: number;
      supplier_minor?: number;
      currency?: string;
      commission_bps?: number;
    } | null;
    refund_instructions?: Array<{
      id: string;
      kind: string;
      status: string;
      amount_minor: number;
      currency: string;
      created_at: string;
    }>;
    holds?: Array<{ id: string; reason_code: string; active: boolean; created_at: string; released_at: string | null }>;
    disputes?: Array<{ id: string; event_type: string; status: string; stripe_event_id?: string; created_at: string }>;
    payout_period?: { status?: string; period_key?: string } | null;
  };
};

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function when(value: string | null | undefined): string {
  if (!value) return 'Time not stored';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function moneyMinor(minor: number | null | undefined, currency: string | null | undefined): string {
  if (typeof minor !== 'number' || !Number.isInteger(minor)) return 'Not on file';
  return formatMoney(fromMinorUnits(minor), currency || 'EUR');
}

export default function AdminBookingDrawer({
  bookingId,
  onClose,
}: {
  bookingId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundKind, setRefundKind] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundKey, setRefundKey] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeAdminEdgeFunction<Detail>({ action: 'booking_ops_detail', opsBookingId: bookingId });
      setDetail(data);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : 'Could not load this booking');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const booking = detail?.booking;
  const snapshot = booking?.purchase_snapshot;
  const reference = travelerPublicBookingReference(booking?.public_reference) ?? 'Reference pending';
  const title = booking ? displayListingTitleFromPurchase(snapshot, detail?.listing?.title, 'Listing removed') : '';
  const option = displayOptionLabelFromPurchase(snapshot, null);
  const fulfillment = displayFulfillmentFromPurchase(snapshot);
  const meeting = displayMeetingPointFromPurchase(snapshot, null);
  const pickupInstructions = displayPickupInstructionsFromPurchase(snapshot, null);
  const pickupAddress = isPurchaseSnapshot(snapshot) ? (snapshot.travelerPickupAddress ?? '').trim() : '';
  const showPickup = fulfillment === 'pickup' || Boolean(pickupAddress || pickupInstructions);
  const clock = formatTravelerDepartureClock(
    displayStartTimeFromPurchase(snapshot, booking?.start_time),
    displayDepartureTimezoneFromPurchase(snapshot)
  );
  const phone = booking ? displayBookingContactPhoneFromPurchase(snapshot, booking.payment_status) : null;
  const total = booking ? adminBookingTotalMajor(booking) : null;
  const currency = booking?.currency || (isPurchaseSnapshot(snapshot) ? snapshot.currency : null) || 'EUR';
  const lifecycle = booking
    ? bookingLifecycleLabel(booking.status, booking.payment_status, booking)
    : '';
  const payLabel = booking ? partnerPaymentLabel(booking) : '';
  const paid = booking ? isPaidPaymentStatus(booking.payment_status) : false;
  const timeline = useMemo(() => {
    if (!booking || !detail) return [];
    return buildAdminBookingTimeline({
      createdAt: booking.created_at,
      cancelledAt: booking.cancelled_at,
      status: booking.status,
      paymentEvents: detail.paymentEvents,
      emails: detail.emails,
      cancellations: detail.cancellations,
      holds: detail.investigation?.holds,
      disputes: detail.investigation?.disputes,
      refundInstructions: detail.investigation?.refund_instructions,
    });
  }, [booking, detail]);

  const snap = detail?.investigation?.snapshot;
  const remaining = !booking
    ? null
    : (booking.payment_status ?? '').toLowerCase() === 'refunded'
      ? 0
      : paid
        ? Number(booking.amount_paid ?? 0)
        : 0;
  const stripeUrl = booking?.payment_intent_id
    ? `https://dashboard.stripe.com/${
        isStripeTestCheckoutSession(booking.checkout_session_id) || appStripeIsTestMode() ? 'test/' : ''
      }payments/${encodeURIComponent(booking.payment_intent_id)}`
    : null;
  const mapQuery = pickupAddress || meeting;
  const mapHref = isPurchaseSnapshot(snapshot) && Number.isFinite(snapshot.travelerPickupLat) && Number.isFinite(snapshot.travelerPickupLng)
    ? `https://www.google.com/maps/search/?api=1&query=${snapshot.travelerPickupLat},${snapshot.travelerPickupLng}`
    : mapQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
      : null;

  const openRefund = (kind: 'full' | 'partial') => {
    setRefundKind(kind);
    setRefundAmount('');
    setRefundReason('');
    setRefundError(null);
    setRefundMessage(null);
    setRefundKey(`admin-refund:${bookingId}:${kind}:${crypto.randomUUID()}`);
    setRefundOpen(true);
  };

  const submitRefund = async () => {
    if (!booking || refundSaving) return;
    setRefundError(null);
    setRefundMessage(null);
    if (refundReason.trim().length < 3) {
      setRefundError('Enter a reason of at least 3 characters.');
      return;
    }
    let amountMinor: number | null = null;
    if (refundKind === 'partial') {
      try {
        amountMinor = toMinorUnits(refundAmount);
      } catch {
        setRefundError('Enter a partial amount with up to two decimal places.');
        return;
      }
      if (amountMinor <= 0) {
        setRefundError('Enter a partial amount greater than zero.');
        return;
      }
    }
    setRefundSaving(true);
    try {
      const result = await invokeAdminEdgeFunction<{ ok?: boolean; status?: string; already?: boolean; executes_stripe?: boolean }>({
        action: 'prepare_refund_instruction',
        investigateBookingId: booking.id,
        refundKind,
        refundAmountMinor: amountMinor,
        refundReason: refundReason.trim(),
        refundIdempotencyKey: refundKey,
      });
      setRefundMessage(
        result.already
          ? `This instruction already exists with status ${result.status ?? 'ready'}. Stripe has not been refunded by this action.`
          : `Instruction status: ${result.status ?? 'ready'}. Stripe has not been refunded.`
      );
      setRefundOpen(false);
      await load();
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : 'Could not prepare the refund instruction');
    } finally {
      setRefundSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/30" role="presentation" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Booking details"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#e5e7eb] bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="font-sans text-sm font-bold tracking-wide text-[#073b83]">{reference}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {lifecycle ? <StatusChip tone={toneForPaymentLabel(lifecycle)}>{lifecycle}</StatusChip> : null}
              {payLabel && payLabel !== lifecycle ? <StatusChip tone={toneForPaymentLabel(payLabel)}>{payLabel}</StatusChip> : null}
            </div>
          </div>
          <button type="button" className="tv-btn-ghost h-9 px-2" onClick={onClose} aria-label="Close booking details">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? <p className="text-sm text-[#71717a]">Loading booking…</p> : null}
          {error ? (
            <NoticeCallout title="Could not open this booking" tone="danger">
              {error}
            </NoticeCallout>
          ) : null}
          {booking && !loading ? (
            <div className="space-y-4 font-sans text-[13px] text-[#18181b]">
              {appStripeIsTestMode() || isStripeTestCheckoutSession(booking.checkout_session_id) ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  Stripe TEST. This is not a live charge or a live payout.
                </p>
              ) : null}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Booking</h3>
                <div className="mt-2 flex gap-3">
                  {detail?.listing?.image ? (
                    <img src={detail.listing.image} alt="" className="h-14 w-14 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[#f4f4f5] text-[11px] text-[#71717a]">No photo</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{title}</p>
                    {option ? <p className="text-[#52525b]">{option}</p> : null}
                    <p className="text-[#52525b]">{detail?.supplier?.display_name || detail?.supplier?.company_legal_name || 'Supplier not on file'}</p>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-[11px] text-[#71717a]">Created</dt><dd>{when(booking.created_at)}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Departure</dt><dd>{adminBookingDateLine(booking)}{clock ? ` · ${clock}` : ''}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Participants</dt><dd>{formatBookingParticipantsLabel(booking)}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Reference</dt><dd className="flex items-center gap-2">{reference}<button type="button" className="font-semibold text-[#073b83]" onClick={() => copyText(reference)}>Copy</button></dd></div>
                </dl>
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Customer</h3>
                <dl className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><dt className="text-[#71717a]">Name</dt><dd>{booking.guest_name?.trim() || 'Not provided'}</dd></div>
                  <div className="flex flex-wrap items-center gap-2"><dt className="text-[#71717a]">Email</dt><dd className="break-all">{booking.guest_email || 'Not provided'}</dd>{booking.guest_email ? <button type="button" className="font-semibold text-[#073b83]" onClick={() => copyText(booking.guest_email || '')}>Copy</button> : null}</div>
                  <div><dt className="text-[#71717a]">Phone</dt><dd>{phone || 'Not on file'}</dd></div>
                  <div><dt className="text-[#71717a]">Special requests</dt><dd className="whitespace-pre-wrap">{booking.special_requests?.trim() || 'None'}</dd></div>
                </dl>
              </section>

              {showPickup || meeting ? (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">{showPickup ? 'Pickup' : 'Meeting point'}</h3>
                  <div className="mt-2 space-y-1">
                    {showPickup && pickupAddress ? <p>{pickupAddress}</p> : null}
                    {!showPickup && meeting ? <p>{meeting}</p> : null}
                    {showPickup && meeting && meeting !== pickupAddress ? <p className="text-[#52525b]">Meeting note: {meeting}</p> : null}
                    {pickupInstructions ? <p className="text-[#52525b]">{pickupInstructions}</p> : null}
                    {booking.pickup_time ? <p>Pickup time {booking.pickup_time}</p> : null}
                    {mapHref ? <a className="font-semibold text-[#073b83]" href={mapHref} target="_blank" rel="noreferrer">Open map</a> : null}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Payment</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-[#52525b]">{adminPaymentExplanation(booking)}</p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-[11px] text-[#71717a]">Customer total</dt><dd>{total != null ? formatMoney(total, currency) : 'Not on file'}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Payment status</dt><dd>{payLabel}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Collected</dt><dd>{paid ? formatMoney(Number(booking.amount_paid ?? 0), currency) : 'Not collected'}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Still refundable</dt><dd>{remaining != null ? formatMoney(remaining, currency) : 'Not on file'}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Supplier earnings</dt><dd>{moneyMinor(snap?.supplier_minor, snap?.currency || currency)}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Traverion commission</dt><dd>{moneyMinor(snap?.commission_minor, snap?.currency || currency)}</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Payment method</dt><dd>Not stored</dd></div>
                  <div><dt className="text-[11px] text-[#71717a]">Payout period</dt><dd>{detail.investigation?.payout_period?.period_key || 'Not assigned'}</dd></div>
                </dl>
                {(detail.investigation?.refund_instructions ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[12px] text-[#52525b]">
                    {detail.investigation.refund_instructions?.map((row) => (
                      <li key={row.id}>Prepared {row.kind} instruction · {moneyMinor(row.amount_minor, row.currency)} · {row.status}. Not a completed Stripe refund.</li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Timeline</h3>
                <ol className="mt-2 space-y-2">
                  {timeline.map((event) => (
                    <li key={event.id}>
                      <p className="font-semibold">{event.label}</p>
                      <p className="text-[12px] text-[#71717a]">{when(event.at)}{event.detail ? ` · ${event.detail}` : ''}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {detail.listing?.id ? (
                    <a className="tv-btn-secondary inline-flex h-9 items-center px-3 text-[13px]" href={`/tour/${detail.listing.id}`} target="_blank" rel="noreferrer">View listing</a>
                  ) : (
                    <span className="text-[12px] text-[#71717a]">Listing is not available.</span>
                  )}
                  {stripeUrl ? (
                    <a className="tv-btn-secondary inline-flex h-9 items-center px-3 text-[13px]" href={stripeUrl} target="_blank" rel="noreferrer">Review payment in Stripe</a>
                  ) : null}
                  <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" disabled={!paid} onClick={() => openRefund('full')}>Prepare full refund</button>
                  <button type="button" className="tv-btn-secondary h-9 px-3 text-[13px]" disabled={!paid} onClick={() => openRefund('partial')}>Prepare partial refund</button>
                </div>
                <p className="text-[12px] leading-relaxed text-[#71717a]">
                  Cancel booking is unavailable here. Traveler and supplier cancellation stays on the existing booking flows.
                  Opening the customer’s Trips page or a support thread is unavailable from admin.
                  Preparing a refund does not call Stripe and does not mark the booking refunded.
                </p>
                {refundMessage ? <p className="text-[12px]" role="status">{refundMessage}</p> : null}
              </section>

              <details className="rounded-md border border-[#e5e7eb] px-3 py-2">
                <summary className="cursor-pointer text-[13px] font-semibold">Technical details</summary>
                <dl className="mt-2 space-y-1 break-all text-[12px]">
                  <div className="flex flex-wrap items-center gap-2"><dt>Booking id</dt><dd>{booking.id}</dd><button type="button" className="font-semibold text-[#073b83]" onClick={() => copyText(booking.id)}>Copy</button></div>
                  <div><dt>Checkout session</dt><dd>{booking.checkout_session_id || 'None'}</dd></div>
                  <div><dt>Payment intent</dt><dd>{booking.payment_intent_id || 'None'}</dd></div>
                  <div><dt>Dispute</dt><dd>{booking.dispute_id || booking.dispute_status || 'None'}</dd></div>
                  {(detail.paymentEvents ?? []).map((event) => (
                    <div key={event.id}><dt>{event.event_type}</dt><dd>{event.event_id || event.id}</dd></div>
                  ))}
                </dl>
              </details>
            </div>
          ) : null}
        </div>
        {refundOpen && booking ? (
          <div className="border-t border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
            <p className="text-sm font-semibold">Prepare {refundKind} refund for {reference}</p>
            <p className="mt-1 text-[12px] text-[#52525b]">
              {refundKind === 'full'
                ? `Full collected amount ${formatMoney(Number(booking.amount_paid ?? 0), currency)}.`
                : 'Enter the partial amount in major units.'}{' '}
              This writes an instruction for staff. It does not refund Stripe.
            </p>
            {refundKind === 'partial' ? (
              <label className="mt-2 block text-[12px]">
                Amount
                <input className="tv-input mt-1" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} inputMode="decimal" />
              </label>
            ) : null}
            <label className="mt-2 block text-[12px]">
              Reason
              <textarea className="tv-input mt-1 min-h-16" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            </label>
            {refundError ? <p className="mt-2 text-[12px] text-red-800" role="alert">{refundError}</p> : null}
            <div className="mt-2 flex gap-2">
              <button type="button" className="tv-btn-primary h-9 px-3 text-[13px]" disabled={refundSaving} onClick={() => void submitRefund()}>
                {refundSaving ? 'Preparing…' : 'Confirm instruction'}
              </button>
              <button type="button" className="tv-btn-ghost h-9 px-3 text-[13px]" disabled={refundSaving} onClick={() => setRefundOpen(false)}>Back</button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
