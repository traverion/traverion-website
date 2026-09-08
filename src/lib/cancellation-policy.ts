/**
 * Snapshot-able supplier cancellation fee policy.
 * Amounts are major currency units. Do not scatter €20 through UI.
 */

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
    note: 'Traverion does not auto-accept supplier cancellation requests. If the traveler does not respond, the booking stays active until they accept or Traverion support resolves it.',
  };
}

/** Traveler self-cancel: 24 hours before local start of the activity/check-in date. */
export function travelerSelfCancelRefundChoice(params: {
  bookingDate: string | null;
  startTimeHm?: string | null;
  nowMs?: number;
}): 'full_refund' | 'no_refund' {
  if (!params.bookingDate) return 'no_refund';
  const hm = (params.startTimeHm ?? '00:00').slice(0, 5);
  const startMs = Date.parse(`${params.bookingDate}T${hm}:00`);
  if (!Number.isFinite(startMs)) return 'no_refund';
  const now = params.nowMs ?? Date.now();
  return startMs - now > 24 * 60 * 60 * 1000 ? 'full_refund' : 'no_refund';
}
