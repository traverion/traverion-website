/**
 * Canonical rental booking domain — source of truth for lifecycle rules.
 * Maps onto shared `bookings` + `rental_inventory_holds` (not a parallel booking universe).
 *
 * Authoritative money/status columns live on `bookings`.
 * Interval inventory lives on `rental_inventory_holds` (variant qty, half-open + buffer).
 * Listing configuration lives in `listing_extras.rental` (variants, pricing, rules).
 */

export const RENTAL_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export type RentalBookingStatus = (typeof RENTAL_BOOKING_STATUSES)[number];

export const RENTAL_PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'authorized',
] as const;
export type RentalPaymentStatus = (typeof RENTAL_PAYMENT_STATUSES)[number];

/** Operational handover — stored in purchase_snapshot.rentalOpsStatus */
export const RENTAL_OPS_STATUSES = [
  'awaiting_pickup',
  'collected',
  'returned',
  'cancelled',
] as const;
export type RentalOpsStatus = (typeof RENTAL_OPS_STATUSES)[number];

export const RENTAL_HOLD_STATUSES = ['held', 'confirmed', 'released', 'expired'] as const;
export type RentalHoldStatus = (typeof RENTAL_HOLD_STATUSES)[number];

/** Immutable quote fragment frozen onto the booking at claim time. */
export type RentalPurchaseSnapshot = {
  inventoryFamily: 'rental';
  variantId: string;
  quantity: number;
  pickupAt: string;
  returnAt: string;
  durationCount: number;
  durationUnit: 'hour' | 'day';
  unitMinor: number;
  customerTotalMinor: number;
  commissionMinor: number;
  supplierEarningsMinor: number;
  commissionBps: number;
  discountApplied: boolean;
  currency: string;
  rentalOpsStatus: RentalOpsStatus;
  holdId?: string;
  priceBreakdown?: Record<string, unknown>;
  /** Informational only — Traverion does not collect online deposits unless implemented. */
  depositDisclosure?: string | null;
  /** Frozen at purchase so later listing edits do not rewrite the trip. */
  listingTitle?: string | null;
  variantName?: string | null;
  pickupAddress?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupInstructions?: string | null;
  staffAssisted?: boolean | null;
  collectionNotes?: string | null;
  returnAddress?: string | null;
  returnLat?: number | null;
  returnLng?: number | null;
  returnInstructions?: string | null;
  returnStaffAssisted?: boolean | null;
  returnCollectionNotes?: string | null;
  returnSameAsPickup?: boolean;
  cancellationPreset?: string | null;
  cancellationLabel?: string | null;
  depositAmountMinor?: number | null;
};

export type RentalBookingTransition =
  | 'claim_hold'
  | 'mark_paid'
  | 'mark_payment_failed'
  | 'expire_unpaid'
  | 'cancel'
  | 'refund'
  | 'mark_collected'
  | 'mark_returned';

export type RentalBookingView = {
  status: RentalBookingStatus;
  paymentStatus: RentalPaymentStatus;
  opsStatus: RentalOpsStatus;
  holdStatus: RentalHoldStatus | null;
};

export type TransitionResult =
  | { ok: true; next: RentalBookingView }
  | { ok: false; error: string };

function isOps(v: string): v is RentalOpsStatus {
  return (RENTAL_OPS_STATUSES as readonly string[]).includes(v);
}

function rentalSnapshotCoord(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

export function parseRentalPurchaseSnapshot(raw: unknown): RentalPurchaseSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.inventoryFamily !== 'rental') return null;
  if (typeof o.variantId !== 'string' || !o.variantId.trim()) return null;
  const quantity = typeof o.quantity === 'number' ? Math.floor(o.quantity) : NaN;
  if (!(quantity >= 1)) return null;
  if (typeof o.pickupAt !== 'string' || typeof o.returnAt !== 'string') return null;
  if (o.durationUnit !== 'hour' && o.durationUnit !== 'day') return null;
  const durationCount = typeof o.durationCount === 'number' ? o.durationCount : NaN;
  if (!(durationCount > 0)) return null;
  const unitMinor = typeof o.unitMinor === 'number' ? Math.round(o.unitMinor) : NaN;
  const customerTotalMinor =
    typeof o.customerTotalMinor === 'number' ? Math.round(o.customerTotalMinor) : NaN;
  const commissionMinor =
    typeof o.commissionMinor === 'number' ? Math.round(o.commissionMinor) : NaN;
  const supplierEarningsMinor =
    typeof o.supplierEarningsMinor === 'number' ? Math.round(o.supplierEarningsMinor) : NaN;
  const commissionBps = typeof o.commissionBps === 'number' ? Math.round(o.commissionBps) : NaN;
  if (
    ![unitMinor, customerTotalMinor, commissionMinor, supplierEarningsMinor, commissionBps].every(
      (n) => Number.isFinite(n)
    )
  ) {
    return null;
  }
  const ops =
    typeof o.rentalOpsStatus === 'string' && isOps(o.rentalOpsStatus)
      ? o.rentalOpsStatus
      : 'awaiting_pickup';
  return {
    inventoryFamily: 'rental',
    variantId: o.variantId.trim(),
    quantity,
    pickupAt: o.pickupAt,
    returnAt: o.returnAt,
    durationCount,
    durationUnit: o.durationUnit,
    unitMinor,
    customerTotalMinor,
    commissionMinor,
    supplierEarningsMinor,
    commissionBps,
    discountApplied: o.discountApplied === true,
    currency: typeof o.currency === 'string' && o.currency.trim() ? o.currency.trim().toUpperCase() : 'EUR',
    rentalOpsStatus: ops,
    holdId: typeof o.holdId === 'string' ? o.holdId : undefined,
    priceBreakdown:
      o.priceBreakdown && typeof o.priceBreakdown === 'object'
        ? (o.priceBreakdown as Record<string, unknown>)
        : undefined,
    depositDisclosure:
      typeof o.depositDisclosure === 'string'
        ? o.depositDisclosure
        : o.depositDisclosure === null
          ? null
          : undefined,
    listingTitle: typeof o.listingTitle === 'string' ? o.listingTitle : null,
    variantName: typeof o.variantName === 'string' ? o.variantName : null,
    pickupAddress: typeof o.pickupAddress === 'string' ? o.pickupAddress : null,
    pickupLat: rentalSnapshotCoord(o.pickupLat, -90, 90),
    pickupLng: rentalSnapshotCoord(o.pickupLng, -180, 180),
    pickupInstructions: typeof o.pickupInstructions === 'string' ? o.pickupInstructions : null,
    staffAssisted: typeof o.staffAssisted === 'boolean' ? o.staffAssisted : null,
    collectionNotes: typeof o.collectionNotes === 'string' ? o.collectionNotes : null,
    returnAddress: typeof o.returnAddress === 'string' ? o.returnAddress : null,
    returnLat: rentalSnapshotCoord(o.returnLat, -90, 90),
    returnLng: rentalSnapshotCoord(o.returnLng, -180, 180),
    returnInstructions: typeof o.returnInstructions === 'string' ? o.returnInstructions : null,
    returnStaffAssisted: typeof o.returnStaffAssisted === 'boolean' ? o.returnStaffAssisted : null,
    returnCollectionNotes: typeof o.returnCollectionNotes === 'string' ? o.returnCollectionNotes : null,
    returnSameAsPickup: o.returnSameAsPickup === false ? false : o.returnSameAsPickup === true ? true : undefined,
    cancellationPreset: typeof o.cancellationPreset === 'string' ? o.cancellationPreset : null,
    cancellationLabel: typeof o.cancellationLabel === 'string' ? o.cancellationLabel : null,
    depositAmountMinor:
      typeof o.depositAmountMinor === 'number' && Number.isFinite(o.depositAmountMinor)
        ? Math.round(o.depositAmountMinor)
        : null,
  };
}

/**
 * Validate a lifecycle transition. Server must re-check permissions and money separately.
 */
export function validateRentalBookingTransition(
  current: RentalBookingView,
  action: RentalBookingTransition
): TransitionResult {
  const { status, paymentStatus, opsStatus, holdStatus } = current;

  switch (action) {
    case 'claim_hold':
      return {
        ok: true,
        next: {
          status: 'pending',
          paymentStatus: 'pending',
          opsStatus: 'awaiting_pickup',
          holdStatus: 'held',
        },
      };

    case 'mark_paid': {
      if (status === 'cancelled') return { ok: false, error: 'Cannot confirm a cancelled booking.' };
      if (paymentStatus === 'paid') {
        return { ok: true, next: { ...current, status: 'confirmed', opsStatus: opsStatus === 'cancelled' ? 'awaiting_pickup' : opsStatus } };
      }
      if (paymentStatus !== 'pending' && paymentStatus !== 'authorized') {
        return { ok: false, error: 'Payment is not in a confirmable state.' };
      }
      if (holdStatus === 'expired' || holdStatus === 'released') {
        return { ok: false, error: 'Inventory hold is no longer valid — revalidate before confirming.' };
      }
      return {
        ok: true,
        next: {
          status: 'confirmed',
          paymentStatus: 'paid',
          opsStatus: 'awaiting_pickup',
          holdStatus: 'confirmed',
        },
      };
    }

    case 'mark_payment_failed': {
      if (paymentStatus === 'paid' || paymentStatus === 'refunded') {
        return { ok: false, error: 'Cannot mark a settled payment as failed.' };
      }
      return {
        ok: true,
        next: {
          status: status === 'pending' ? 'cancelled' : status,
          paymentStatus: 'failed',
          opsStatus: 'cancelled',
          holdStatus: holdStatus === 'held' ? 'released' : holdStatus,
        },
      };
    }

    case 'expire_unpaid': {
      if (paymentStatus === 'paid') return { ok: false, error: 'Paid bookings cannot expire as unpaid.' };
      if (status === 'cancelled' && (holdStatus === 'released' || holdStatus === 'expired' || holdStatus == null)) {
        return { ok: true, next: current };
      }
      return {
        ok: true,
        next: {
          status: 'cancelled',
          paymentStatus: paymentStatus === 'failed' ? 'failed' : 'pending',
          opsStatus: 'cancelled',
          holdStatus: 'expired',
        },
      };
    }

    case 'cancel': {
      if (status === 'cancelled' && opsStatus === 'cancelled') {
        return { ok: false, error: 'Booking is already cancelled.' };
      }
      if (opsStatus === 'returned') {
        return { ok: false, error: 'Completed rentals cannot be cancelled — use refunds if needed.' };
      }
      return {
        ok: true,
        next: {
          status: 'cancelled',
          paymentStatus,
          opsStatus: 'cancelled',
          holdStatus:
            holdStatus === 'held' || holdStatus === 'confirmed' ? 'released' : holdStatus,
        },
      };
    }

    case 'refund': {
      if (paymentStatus === 'refunded') {
        return { ok: false, error: 'Payment is already refunded.' };
      }
      if (paymentStatus !== 'paid' && paymentStatus !== 'authorized') {
        return { ok: false, error: 'Only paid or authorized bookings can be refunded.' };
      }
      return {
        ok: true,
        next: {
          status: status === 'cancelled' ? 'cancelled' : 'cancelled',
          paymentStatus: 'refunded',
          opsStatus: 'cancelled',
          holdStatus:
            holdStatus === 'held' || holdStatus === 'confirmed' ? 'released' : holdStatus,
        },
      };
    }

    case 'mark_collected': {
      if (status !== 'confirmed' || paymentStatus !== 'paid') {
        return { ok: false, error: 'Only paid confirmed rentals can be handed over.' };
      }
      if (opsStatus === 'returned' || opsStatus === 'cancelled') {
        return { ok: false, error: 'Invalid handover from current ops state.' };
      }
      if (opsStatus === 'collected') return { ok: true, next: current };
      return { ok: true, next: { ...current, opsStatus: 'collected' } };
    }

    case 'mark_returned': {
      if (status !== 'confirmed' || paymentStatus !== 'paid') {
        return { ok: false, error: 'Only paid confirmed rentals can be returned.' };
      }
      if (opsStatus !== 'collected' && opsStatus !== 'returned') {
        return { ok: false, error: 'Mark collected before return.' };
      }
      if (opsStatus === 'returned') return { ok: true, next: current };
      return { ok: true, next: { ...current, opsStatus: 'returned' } };
    }

    default:
      return { ok: false, error: 'Unknown transition.' };
  }
}

/** Column reuse: bookings.guests stores rental unit quantity. */
export function rentalQuantityFromBookingGuests(guests: number | null | undefined): number {
  return guests != null && Number.isFinite(guests) && guests >= 1 ? Math.floor(guests) : 1;
}
