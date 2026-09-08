import { describe, expect, it } from 'vitest';
import {
  FORCE_MAJEURE_FEE_EUR,
  SUPPLIER_RESPONSIBILITY_FEE_EUR,
  isForceMajeureReason,
  snapshotSupplierCancellationPolicy,
  supplierCancellationFeeEur,
  travelerSelfCancelRefundChoice,
} from './cancellation-policy';

describe('supplier cancellation policy', () => {
  it('waives the fee for force majeure reasons', () => {
    expect(isForceMajeureReason('FORCE_MAJEURE')).toBe(true);
    expect(supplierCancellationFeeEur('UNSAFE_WEATHER')).toBe(FORCE_MAJEURE_FEE_EUR);
    expect(supplierCancellationFeeEur('GOVERNMENT_RESTRICTION')).toBe(0);
  });

  it('charges the configured supplier-responsibility fee', () => {
    expect(supplierCancellationFeeEur('SUPPLIER_STAFF_UNAVAILABLE')).toBe(SUPPLIER_RESPONSIBILITY_FEE_EUR);
    expect(supplierCancellationFeeEur('OVERBOOKING')).toBe(20);
    expect(snapshotSupplierCancellationPolicy('SUPPLIER_STAFF_UNAVAILABLE').applied_fee).toBe(20);
    expect(snapshotSupplierCancellationPolicy('FORCE_MAJEURE').auto_accept_hours).toBeNull();
  });

  it('uses activity start time for traveler self-cancel refunds', () => {
    const start = Date.parse('2026-09-10T18:00:00');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        nowMs: start - 25 * 60 * 60 * 1000,
      })
    ).toBe('full_refund');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        nowMs: start - 2 * 60 * 60 * 1000,
      })
    ).toBe('no_refund');
  });
});
