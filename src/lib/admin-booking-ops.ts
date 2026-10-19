import { isPurchaseSnapshot } from './purchase-snapshot';
import { isCollectedBooking, partnerPaymentLabel, type MoneyBookingRow } from './payment-states';

export type AdminTimelineEvent = {
  id: string;
  at: string | null;
  label: string;
  detail?: string;
};

type PaymentEvent = {
  id: string;
  event_id?: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

type EmailEvent = {
  id: string;
  template_key?: string | null;
  channel?: string | null;
  status?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

type CancelEvent = {
  id: string;
  requested_by?: string | null;
  status?: string | null;
  created_at?: string | null;
  responded_at?: string | null;
};

type HoldEvent = {
  id?: string;
  reason_code?: string | null;
  active?: boolean;
  created_at?: string | null;
  released_at?: string | null;
};

type DisputeEvent = {
  id?: string;
  event_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type RefundInstruction = {
  id?: string;
  kind?: string | null;
  status?: string | null;
  amount_minor?: number | null;
  currency?: string | null;
  created_at?: string | null;
};

function paymentEventLabel(eventType: string): string {
  const type = eventType.trim();
  if (type === 'checkout.session.completed' || type === 'payment_intent.succeeded' || type === 'charge.succeeded') {
    return 'Payment succeeded';
  }
  if (type === 'payment_intent.payment_failed' || type === 'checkout.session.async_payment_failed' || type === 'charge.failed') {
    return 'Payment failed';
  }
  if (type === 'checkout.session.expired') return 'Checkout expired';
  if (type === 'charge.refunded' || type === 'refund.updated' || type === 'refund.created') return 'Refund event recorded';
  if (type.startsWith('charge.dispute')) return 'Dispute event recorded';
  return type || 'Payment event';
}

function emailLabel(row: EmailEvent): string {
  const status = (row.status ?? '').trim().toLowerCase();
  const template = (row.template_key ?? 'email').replace(/_/g, ' ');
  if (status === 'sent') return `${template} accepted by the email provider`;
  if (status === 'failed') return `${template} was not accepted`;
  if (status === 'skipped') return `${template} was skipped`;
  return `${template} recorded`;
}

/** Chronological history from stored rows. Missing timestamps stay unset. */
export function buildAdminBookingTimeline(input: {
  createdAt?: string | null;
  cancelledAt?: string | null;
  status?: string | null;
  paymentEvents?: PaymentEvent[];
  emails?: EmailEvent[];
  cancellations?: CancelEvent[];
  holds?: HoldEvent[];
  disputes?: DisputeEvent[];
  refundInstructions?: RefundInstruction[];
}): AdminTimelineEvent[] {
  const events: AdminTimelineEvent[] = [];
  if (input.createdAt) {
    events.push({ id: 'created', at: input.createdAt, label: 'Booking initiated' });
  }
  for (const row of input.paymentEvents ?? []) {
    events.push({
      id: `pay-${row.id}`,
      at: row.created_at ?? null,
      label: paymentEventLabel(row.event_type ?? ''),
      detail: row.event_id ? `Event ${row.event_id}` : undefined,
    });
  }
  for (const row of input.emails ?? []) {
    const status = (row.status ?? '').trim().toLowerCase();
    events.push({
      id: `mail-${row.id}`,
      at: row.created_at ?? null,
      label: emailLabel(row),
      detail:
        status === 'failed' && row.error_message
          ? row.error_message
          : status === 'sent'
            ? 'Provider acceptance is not proof the guest opened the message.'
            : row.channel
              ? `${row.channel} · ${status || 'recorded'}`
              : undefined,
    });
  }
  for (const row of input.cancellations ?? []) {
    events.push({
      id: `cancel-${row.id}`,
      at: row.created_at ?? null,
      label: `Cancellation requested by ${row.requested_by || 'a party'}`,
      detail: row.status ? `Status ${row.status}` : undefined,
    });
    if (row.responded_at) {
      events.push({
        id: `cancel-response-${row.id}`,
        at: row.responded_at,
        label: 'Cancellation request updated',
        detail: row.status ? `Status ${row.status}` : undefined,
      });
    }
  }
  if (input.cancelledAt) {
    events.push({ id: 'cancelled', at: input.cancelledAt, label: 'Cancellation recorded' });
  }
  for (const row of input.refundInstructions ?? []) {
    events.push({
      id: `refund-${row.id ?? row.created_at ?? 'instruction'}`,
      at: row.created_at ?? null,
      label: 'Refund instruction prepared',
      detail: 'Stripe has not been asked to refund this amount.',
    });
  }
  for (const row of input.disputes ?? []) {
    events.push({
      id: `dispute-${row.id ?? row.created_at ?? row.event_type}`,
      at: row.created_at ?? null,
      label: 'Dispute event recorded',
      detail: [row.event_type, row.status].filter(Boolean).join(' · ') || undefined,
    });
  }
  for (const row of input.holds ?? []) {
    events.push({
      id: `hold-${row.id ?? row.created_at}`,
      at: row.created_at ?? null,
      label: 'Financial hold set',
      detail: row.reason_code ?? undefined,
    });
    if (row.released_at) {
      events.push({
        id: `hold-release-${row.id ?? row.released_at}`,
        at: row.released_at,
        label: 'Financial hold released',
      });
    }
  }
  if ((input.status ?? '').trim().toLowerCase() === 'confirmed' && !events.some((event) => event.label === 'Payment succeeded')) {
    events.push({
      id: 'confirmed-status',
      at: null,
      label: 'Booking status is confirmed',
      detail: 'No separate confirmation timestamp is stored.',
    });
  }
  return events.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
}

export function adminBookingTotalMajor(booking: {
  amount_paid?: number | string | null;
  purchase_snapshot?: unknown;
}): number | null {
  if (isPurchaseSnapshot(booking.purchase_snapshot) && typeof booking.purchase_snapshot.totalAmount === 'number') {
    return booking.purchase_snapshot.totalAmount;
  }
  const paid = Number(booking.amount_paid ?? NaN);
  return Number.isFinite(paid) && paid > 0 ? paid : null;
}

/** Amount caption for the list. Collected money is the only case labeled Paid. */
export function adminBookingAmountCaption(booking: MoneyBookingRow): string {
  const label = partnerPaymentLabel(booking);
  if (label === 'Paid' && isCollectedBooking(booking)) return 'Paid';
  if (label === 'Refund due') return 'Collected · refund due';
  if (label === 'Refunded') return 'Refunded';
  if (label === 'No refund') return 'Collected · no refund';
  if (label === 'Payment failed') return 'Not collected';
  if (label === 'Hold expired' || label === 'Checkout expired') return 'Checkout expired';
  if (label === 'Checkout hold' || label === 'Payment pending') return 'Not collected';
  return label;
}

export function adminPaymentExplanation(booking: MoneyBookingRow): string {
  const label = partnerPaymentLabel(booking);
  if (label === 'Payment failed') {
    return 'Checkout did not collect payment. This is not a confirmed booking and it is not supplier revenue.';
  }
  if (label === 'Hold expired' || label === 'Checkout expired') {
    return 'The Stripe checkout session expired before payment. Instant Book nights were never reserved.';
  }
  if (label === 'Checkout hold' || label === 'Payment pending') {
    return 'Payment is not collected. Instant Book nights are not reserved until payment succeeds.';
  }
  if (label === 'Refund due') {
    return 'Money was collected and a refund is still due. Traverion does not mark this refunded until Stripe records the refund.';
  }
  if (label === 'Refunded') return 'Stripe records this payment as refunded.';
  if (label === 'Paid') return 'Payment was collected. A payout to the supplier is a separate later step.';
  return label;
}
