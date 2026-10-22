import { bookingPaymentWasCollected, isPaidPaymentStatus, normalizePaymentStatus } from './payment-states';
import { resolveDepartureTimezone, wallTimeInZoneToUtcMs } from './tour-departure-cutoff';
import type { PurchaseFulfillment, PurchaseSnapshot } from './purchase-snapshot';
import { isPurchaseSnapshot } from './purchase-snapshot';

/**
 * Snapshot-able supplier cancellation fee policy.
 * Amounts are major currency units. Do not scatter €20 through UI.
 */

/** SQL cancel_booking_as_traveler code when free-cancel window is closed. */
export const TRAVELER_SELF_CANCEL_DEADLINE_PASSED_CODE = 'deadline_passed';

export const TRAVELER_SELF_CANCEL_DEADLINE_PASSED =
  'The free-cancellation deadline has passed. Contact the operator from Messages to discuss your booking.';

export const TRAVELER_SELF_CANCEL_NON_REFUNDABLE =
  'This booking is non-refundable for guest-initiated cancellations. Contact the operator from Messages to discuss your booking.';

/**
 * Authoritative cancel start wall clock (HH:MM).
 * Tours / future Rentals: official booked start only (cancelReferenceStartHm / startTimeHm).
 * Pickup times never determine cancellation eligibility.
 * Stays: snapshotted check-in (default 16:00).
 */
export function travelerSelfCancelStartHm(params: {
  isStay: boolean;
  checkInHm?: string | null;
  /** Official tour/rental start or meeting time from purchase snapshot. */
  startTimeHm?: string | null;
  /** Frozen cancel reference from purchase (same as official start at checkout). */
  cancelReferenceStartHm?: string | null;
  /** @deprecated Ignored — pickup must not affect cancel deadlines (Phase 1). */
  fulfillment?: PurchaseFulfillment | null;
  /** @deprecated Ignored — pickup must not affect cancel deadlines (Phase 1). */
  confirmedPickupHm?: string | null;
  /** @deprecated Prefer cancelReferenceStartHm; legacy alias. */
  selfCancelStartHm?: string | null;
}): string {
  if (params.isStay) {
    const cin = (params.checkInHm ?? '').trim().slice(0, 5);
    return cin || '16:00';
  }
  const ref = (params.cancelReferenceStartHm ?? params.selfCancelStartHm ?? '').trim().slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(ref)) return ref;
  const start = (params.startTimeHm ?? '').trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(start) ? start : '00:00';
}

/**
 * @deprecated Phase 1: pickup must not freeze or change the cancel clock.
 * Official start is snapshotted as cancelReferenceStartHm / startTimeHm at purchase.
 */
export function withFrozenSelfCancelStartHm(
  snapshot: unknown,
  _confirmedPickupHm?: string | null | undefined
): PurchaseSnapshot | null {
  if (!isPurchaseSnapshot(snapshot)) return null;
  return snapshot;
}

export const SUPPLIER_CANCELLATION_POLICY_ID = 'traverion_supplier_cancel_v1';

export const SUPPLIER_CANCELLATION_REASON_CODES = [
  'FORCE_MAJEURE',
  'UNSAFE_WEATHER',
  'GOVERNMENT_RESTRICTION',
  'SUPPLIER_STAFF_UNAVAILABLE',
  'VEHICLE_OR_EQUIPMENT_FAILURE',
  'OVERBOOKING',
  'MINIMUM_PARTICIPATION_NOT_MET',
  'OPERATIONAL_ERROR',
  'TRAVELER_REQUESTED_DIRECTLY',
  'OTHER',
] as const;

export type SupplierCancellationReasonCode = (typeof SUPPLIER_CANCELLATION_REASON_CODES)[number];

const FORCE_MAJEURE = new Set<SupplierCancellationReasonCode>([
  'FORCE_MAJEURE',
  'UNSAFE_WEATHER',
  'GOVERNMENT_RESTRICTION',
]);

export const SUPPLIER_RESPONSIBILITY_FEE_EUR = 20;
export const FORCE_MAJEURE_FEE_EUR = 0;

export function supplierCancellationReasonLabel(code: string): string {
  switch (code) {
    case 'FORCE_MAJEURE':
      return 'Force majeure';
    case 'UNSAFE_WEATHER':
      return 'Unsafe weather';
    case 'GOVERNMENT_RESTRICTION':
      return 'Government restriction';
    case 'SUPPLIER_STAFF_UNAVAILABLE':
      return 'Staff unavailable';
    case 'VEHICLE_OR_EQUIPMENT_FAILURE':
      return 'Vehicle or equipment failure';
    case 'OVERBOOKING':
      return 'Overbooking';
    case 'MINIMUM_PARTICIPATION_NOT_MET':
      return 'Minimum participation not met';
    case 'OPERATIONAL_ERROR':
      return 'Operational error';
    case 'TRAVELER_REQUESTED_DIRECTLY':
      return 'Traveler asked us directly';
    case 'OTHER':
      return 'Other';
    default:
      return code;
  }
}

export function isForceMajeureReason(code: string): boolean {
  return FORCE_MAJEURE.has(code as SupplierCancellationReasonCode);
}

export function supplierCancellationFeeEur(reasonCode: string): number {
  return isForceMajeureReason(reasonCode) ? FORCE_MAJEURE_FEE_EUR : SUPPLIER_RESPONSIBILITY_FEE_EUR;
}

export type CancellationPolicySnapshot = {
  policy_id: string;
  currency: 'EUR';
  force_majeure_fee: number;
  supplier_responsibility_fee: number;
  reason_code: string;
  applied_fee: number;
  traveler_refund: 'full_refund';
  auto_accept_hours: null;
  note: string;
};

export function snapshotSupplierCancellationPolicy(reasonCode: string): CancellationPolicySnapshot {
  const applied_fee = supplierCancellationFeeEur(reasonCode);
  return {
    policy_id: SUPPLIER_CANCELLATION_POLICY_ID,
    currency: 'EUR',
    force_majeure_fee: FORCE_MAJEURE_FEE_EUR,
    supplier_responsibility_fee: SUPPLIER_RESPONSIBILITY_FEE_EUR,
    reason_code: reasonCode,
    applied_fee,
    traveler_refund: 'full_refund',
    auto_accept_hours: null,
    note: 'Supplier-caused cancellation cancels the booking immediately with a full traveler refund entitlement. Tour Stripe refund execution is Phase 2; Stay auto-refund remains active.',
  };
}

/**
 * Traveler self-cancel refund eligibility (only meaningful when self-cancel is open).
 * Unpaid / failed checkouts never owe a refund.
 * SQL cancel_booking_as_traveler is authoritative; this mirrors eligibility UI.
 *
 * Cutoff: free while startMs - now > freeCancelHours (exact boundary → closed / no self-cancel).
 * freeCancelHours null = non-refundable (no ordinary guest free cancel).
 * Default 24 when omitted (legacy / tours).
 */
export function travelerSelfCancelRefundChoice(params: {
  bookingDate: string | null;
  startTimeHm?: string | null;
  /** purchase_snapshot.departureTimezone or listing extras; invalid → Helsinki. */
  departureTimezone?: string | null;
  nowMs?: number;
  paymentStatus?: string | null;
  /**
   * Hours before local start/check-in. null = non-refundable.
   * Omit / undefined → 24 (legacy default).
   */
  freeCancelHours?: number | null;
}): 'full_refund' | 'no_refund' {
  if (!bookingPaymentWasCollected(params.paymentStatus)) return 'no_refund';
  if (!params.bookingDate) return 'no_refund';
  const hours =
    params.freeCancelHours === undefined ? 24 : params.freeCancelHours;
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return 'no_refund';
  const tz = resolveDepartureTimezone(params.departureTimezone);
  const hm = (params.startTimeHm ?? '00:00').slice(0, 5);
  const startMs = wallTimeInZoneToUtcMs(params.bookingDate, hm, tz);
  if (startMs == null || !Number.isFinite(startMs)) return 'no_refund';
  const now = params.nowMs ?? Date.now();
  return startMs - now > hours * 60 * 60 * 1000 ? 'full_refund' : 'no_refund';
}

/**
 * Whether ordinary traveler self-cancel is available.
 * Unpaid checkouts: always (release hold). Paid: only inside free-cancel window.
 * SQL rejects with code deadline_passed when this is false for paid trips.
 */
export function travelerSelfCancelAvailable(params: {
  bookingDate: string | null;
  startTimeHm?: string | null;
  departureTimezone?: string | null;
  nowMs?: number;
  paymentStatus?: string | null;
  freeCancelHours?: number | null;
}): boolean {
  if (!bookingPaymentWasCollected(params.paymentStatus)) return true;
  return travelerSelfCancelRefundChoice(params) === 'full_refund';
}

export function travelerSelfCancelUnavailableMessage(params: {
  freeCancelHours?: number | null;
}): string {
  if (params.freeCancelHours == null) return TRAVELER_SELF_CANCEL_NON_REFUNDABLE;
  return TRAVELER_SELF_CANCEL_DEADLINE_PASSED;
}

/** Instant when the free-cancellation window closes in the experience zone. null if non-refundable. */
export function travelerSelfCancelDeadlineMs(params: {
  bookingDate: string | null;
  startTimeHm?: string | null;
  departureTimezone?: string | null;
  /** Hours before local start. null = non-refundable (no deadline). Omit → 24. */
  freeCancelHours?: number | null;
}): number | null {
  if (!params.bookingDate) return null;
  const hours =
    params.freeCancelHours === undefined ? 24 : params.freeCancelHours;
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null;
  const tz = resolveDepartureTimezone(params.departureTimezone);
  const hm = (params.startTimeHm ?? '00:00').slice(0, 5);
  const startMs = wallTimeInZoneToUtcMs(params.bookingDate, hm, tz);
  if (startMs == null || !Number.isFinite(startMs)) return null;
  return startMs - hours * 60 * 60 * 1000;
}

/** True when Trips Cancel removes an unpaid checkout (no Stripe money collected). */
export function travelerSelfCancelIsUnpaidCheckout(row: {
  payment_status?: string | null;
}): boolean {
  return !bookingPaymentWasCollected(row.payment_status);
}

/** SQL is the authority; these strings match request_supplier_cancellation. */
export const SUPPLIER_CANCEL_ALREADY_REFUNDED = 'This booking is already refunded.';
export const SUPPLIER_CANCEL_ALREADY_CANCELLED = 'This booking is already cancelled.';
export const SUPPLIER_CANCEL_UNPAID = 'Only paid bookings can go through this cancellation request.';

export type SupplierPaidCancellationBlock = 'none' | 'refunded' | 'cancelled' | 'unpaid';

export function supplierPaidCancellationBlock(row: {
  status?: string | null;
  payment_status?: string | null;
}): SupplierPaidCancellationBlock {
  const pay = normalizePaymentStatus(row.payment_status);
  const status = (row.status ?? '').trim().toLowerCase();
  if (pay === 'refunded') return 'refunded';
  if (status === 'cancelled') return 'cancelled';
  if (!isPaidPaymentStatus(pay)) return 'unpaid';
  return 'none';
}

export function supplierPaidCancellationError(block: SupplierPaidCancellationBlock): string {
  if (block === 'refunded') return SUPPLIER_CANCEL_ALREADY_REFUNDED;
  if (block === 'cancelled') return SUPPLIER_CANCEL_ALREADY_CANCELLED;
  if (block === 'unpaid') return SUPPLIER_CANCEL_UNPAID;
  return '';
}

/**
 * Pickup planner may force-cancel unpaid holds only.
 * Paid trips must use Cancel booking in Bookings (immediate supplier cancel + Refund due).
 */
export function partnerPickupAllowsForceCancel(row: {
  status?: string | null;
  payment_status?: string | null;
}): boolean {
  return supplierPaidCancellationBlock(row) === 'unpaid';
}

export type TravelerSelfCancelBlock = 'none' | 'refunded' | 'cancelled';

export function travelerSelfCancelBlock(row: {
  status?: string | null;
  payment_status?: string | null;
}): TravelerSelfCancelBlock {
  const pay = normalizePaymentStatus(row.payment_status);
  const status = (row.status ?? '').trim().toLowerCase();
  if (pay === 'refunded') return 'refunded';
  if (status === 'cancelled') return 'cancelled';
  return 'none';
}

export function travelerSelfCancelError(block: TravelerSelfCancelBlock): string {
  if (block === 'refunded') return SUPPLIER_CANCEL_ALREADY_REFUNDED;
  if (block === 'cancelled') return SUPPLIER_CANCEL_ALREADY_CANCELLED;
  return '';
}

/** Partners must not manually confirm unpaid Stripe holds as if money was collected. */
export const PARTNER_CONFIRM_UNPAID =
  'Only paid bookings can be confirmed. Unpaid checkouts stay pending until the traveler pays or the hold is released.';

export type PartnerManualConfirmBlock = 'none' | 'unpaid';

export function partnerManualConfirmBlock(row: {
  payment_status?: string | null;
}): PartnerManualConfirmBlock {
  if (isPaidPaymentStatus(row.payment_status)) return 'none';
  return 'unpaid';
}

export function partnerManualConfirmError(block: PartnerManualConfirmBlock): string {
  if (block === 'unpaid') return PARTNER_CONFIRM_UNPAID;
  return '';
}

/** Partner status rewrite: refunded trips are closed even if status is still confirmed. */
export function partnerBookingStatusRewriteBlock(
  row: {
    status?: string | null;
    payment_status?: string | null;
  },
  nextStatus: string
): TravelerSelfCancelBlock {
  const pay = normalizePaymentStatus(row.payment_status);
  if (pay === 'refunded') return 'refunded';
  const status = (row.status ?? '').trim().toLowerCase();
  if (status === 'cancelled' && nextStatus.trim().toLowerCase() === 'cancelled') return 'cancelled';
  return 'none';
}
