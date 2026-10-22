import { describe, expect, it } from 'vitest';
import {
  FORCE_MAJEURE_FEE_EUR,
  SUPPLIER_CANCEL_ALREADY_REFUNDED,
  SUPPLIER_CANCEL_UNPAID,
  SUPPLIER_RESPONSIBILITY_FEE_EUR,
  TRAVELER_SELF_CANCEL_DEADLINE_PASSED,
  TRAVELER_SELF_CANCEL_NON_REFUNDABLE,
  isForceMajeureReason,
  snapshotSupplierCancellationPolicy,
  supplierCancellationFeeEur,
  supplierPaidCancellationBlock,
  supplierPaidCancellationError,
  partnerPickupAllowsForceCancel,
  travelerSelfCancelBlock,
  travelerSelfCancelError,
  travelerSelfCancelRefundChoice,
  travelerSelfCancelDeadlineMs,
  travelerSelfCancelAvailable,
  travelerSelfCancelUnavailableMessage,
  travelerSelfCancelStartHm,
  withFrozenSelfCancelStartHm,
  partnerBookingStatusRewriteBlock,
  partnerManualConfirmBlock,
  partnerManualConfirmError,
  PARTNER_CONFIRM_UNPAID,
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
        departureTimezone: 'Europe/Helsinki',
        nowMs: start - 25 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe('full_refund');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: start - 2 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe('no_refund');
  });

  it('interprets the 24h window in the experience timezone, not the browser zone', () => {
    // 20:00 in America/New_York on 2026-01-15 is 01:00 UTC next day (EST).
    // 30h before that UTC instant is still full_refund; 10h before is no_refund.
    const startUtc = Date.UTC(2026, 0, 16, 1, 0, 0);
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-01-15',
        startTimeHm: '20:00',
        departureTimezone: 'America/New_York',
        nowMs: startUtc - 30 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe('full_refund');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-01-15',
        startTimeHm: '20:00',
        departureTimezone: 'America/New_York',
        nowMs: startUtc - 10 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe('no_refund');
  });

  it('stay free-cancel window uses check-in wall clock not midnight (Phase 1074)', () => {
    // Check-in 16:00 Helsinki on 2026-09-10 = 13:00 UTC.
    const checkInUtc = Date.parse('2026-09-10T13:00:00.000Z');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 25 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe('full_refund');
    // 12h before check-in — no free cancel (midnight-based would still be full_refund).
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 12 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe('no_refund');
  });

  it('places a 24-hour deadline on the experience clock', () => {
    const deadline = travelerSelfCancelDeadlineMs({
      bookingDate: '2026-10-23',
      startTimeHm: '18:30',
      departureTimezone: 'Europe/Helsinki',
    });
    expect(deadline).not.toBeNull();
    const label = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Helsinki',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(deadline!));
    expect(label).toContain('22');
    expect(label).toContain('18:30');
  });

  it('never offers a refund for unpaid or failed checkouts', () => {
    const start = Date.parse('2026-09-10T18:00:00');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        nowMs: start - 25 * 60 * 60 * 1000,
        paymentStatus: 'pending',
      })
    ).toBe('no_refund');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        nowMs: start - 25 * 60 * 60 * 1000,
        paymentStatus: 'failed',
      })
    ).toBe('no_refund');
  });

  it('allows unpaid self-cancel anytime; paid only inside free window', () => {
    const startUtc = Date.parse('2026-09-10T15:00:00.000Z'); // 18:00 Helsinki
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: startUtc - 2 * 60 * 60 * 1000,
        paymentStatus: 'pending',
      })
    ).toBe(true);
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: startUtc - 25 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe(true);
    // Exact 24h boundary → closed
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: startUtc - 24 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe(false);
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '18:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: startUtc - 2 * 60 * 60 * 1000,
        paymentStatus: 'paid',
      })
    ).toBe(false);
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: startUtc - 100 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: null,
      })
    ).toBe(false);
    expect(travelerSelfCancelUnavailableMessage({ freeCancelHours: null })).toBe(
      TRAVELER_SELF_CANCEL_NON_REFUNDABLE
    );
    expect(travelerSelfCancelUnavailableMessage({ freeCancelHours: 24 })).toBe(
      TRAVELER_SELF_CANCEL_DEADLINE_PASSED
    );
  });

  it('uses confirmed pickup for tour cancel start, frozen over later changes', () => {
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '20:00',
        fulfillment: 'pickup',
        confirmedPickupHm: '18:30',
      })
    ).toBe('18:30');
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '20:00',
        fulfillment: 'meeting_point',
        confirmedPickupHm: '18:30',
      })
    ).toBe('20:00');
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '20:00',
        fulfillment: 'pickup',
        confirmedPickupHm: null,
      })
    ).toBe('20:00');
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '20:00',
        fulfillment: 'pickup',
        confirmedPickupHm: '17:00',
        selfCancelStartHm: '18:30',
      })
    ).toBe('18:30');
    // Blank purchased clock → caller should pass live start_time (SQL fallback parity).
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '',
        fulfillment: 'meeting_point',
        confirmedPickupHm: null,
      })
    ).toBe('00:00');
    expect(
      travelerSelfCancelStartHm({
        isStay: false,
        startTimeHm: '09:15',
        fulfillment: 'meeting_point',
        confirmedPickupHm: '07:00',
      })
    ).toBe('09:15');
    const snap = {
      listingTitle: 'Aurora',
      capturedAt: '2026-01-01T00:00:00Z',
      startTimeHm: '20:00',
      optionLabel: null,
      meetingPoint: null,
      pickupInstructions: null,
      fulfillment: 'pickup' as const,
    };
    const frozen = withFrozenSelfCancelStartHm(snap, '18:30');
    expect(frozen?.selfCancelStartHm).toBe('18:30');
    expect(withFrozenSelfCancelStartHm(frozen, '17:00')?.selfCancelStartHm).toBe('18:30');
    expect(withFrozenSelfCancelStartHm({ ...snap, fulfillment: 'meeting_point' }, '18:30')?.selfCancelStartHm).toBeUndefined();
  });

  it('honours stay presets 48h / 7d / non_refundable for self-cancel availability', () => {
    const checkInUtc = Date.parse('2026-09-10T13:00:00.000Z'); // 16:00 Helsinki
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 49 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 48,
      })
    ).toBe(true);
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 48 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 48,
      })
    ).toBe(false);
    expect(
      travelerSelfCancelAvailable({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 169 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 168,
      })
    ).toBe(true);
  });

  it('rejects refunded bookings as already refunded, not unpaid', () => {
    expect(supplierPaidCancellationBlock({ status: 'confirmed', payment_status: 'refunded' })).toBe(
      'refunded'
    );
    expect(
      supplierPaidCancellationError(
        supplierPaidCancellationBlock({ status: 'confirmed', payment_status: 'refunded' })
      )
    ).toBe(SUPPLIER_CANCEL_ALREADY_REFUNDED);
    expect(supplierPaidCancellationBlock({ status: 'pending', payment_status: 'pending' })).toBe(
      'unpaid'
    );
    expect(
      supplierPaidCancellationError(
        supplierPaidCancellationBlock({ status: 'pending', payment_status: 'failed' })
      )
    ).toBe(SUPPLIER_CANCEL_UNPAID);
    expect(supplierPaidCancellationBlock({ status: 'confirmed', payment_status: 'paid' })).toBe(
      'none'
    );
    expect(partnerPickupAllowsForceCancel({ status: 'confirmed', payment_status: 'paid' })).toBe(false);
    expect(partnerPickupAllowsForceCancel({ status: 'pending', payment_status: 'pending' })).toBe(true);
  });

  it('blocks partner manual confirm while Stripe payment is unpaid', () => {
    expect(partnerManualConfirmBlock({ payment_status: 'pending' })).toBe('unpaid');
    expect(partnerManualConfirmBlock({ payment_status: 'failed' })).toBe('unpaid');
    expect(partnerManualConfirmBlock({ payment_status: 'paid' })).toBe('none');
    expect(partnerManualConfirmError('unpaid')).toBe(PARTNER_CONFIRM_UNPAID);
    expect(PARTNER_CONFIRM_UNPAID.toLowerCase()).toContain('only paid');
    expect(PARTNER_CONFIRM_UNPAID.toLowerCase()).not.toContain('refund due');
  });

  it('rejects traveler self-cancel on refunded bookings as already refunded', () => {
    expect(travelerSelfCancelBlock({ status: 'confirmed', payment_status: 'refunded' })).toBe(
      'refunded'
    );
    expect(
      travelerSelfCancelError(travelerSelfCancelBlock({ status: 'confirmed', payment_status: 'refunded' }))
    ).toBe(SUPPLIER_CANCEL_ALREADY_REFUNDED);
    expect(travelerSelfCancelBlock({ status: 'cancelled', payment_status: 'paid' })).toBe('cancelled');
    expect(travelerSelfCancelBlock({ status: 'confirmed', payment_status: 'paid' })).toBe('none');
  });

  it('skips partner status rewrite on refunded bookings as already refunded', () => {
    expect(
      partnerBookingStatusRewriteBlock({ status: 'confirmed', payment_status: 'refunded' }, 'cancelled')
    ).toBe('refunded');
    expect(
      travelerSelfCancelError(
        partnerBookingStatusRewriteBlock({ status: 'confirmed', payment_status: 'refunded' }, 'cancelled')
      )
    ).toBe(SUPPLIER_CANCEL_ALREADY_REFUNDED);
    expect(
      partnerBookingStatusRewriteBlock({ status: 'confirmed', payment_status: 'refunded' }, 'confirmed')
    ).toBe('refunded');
    expect(
      partnerBookingStatusRewriteBlock({ status: 'confirmed', payment_status: 'paid' }, 'cancelled')
    ).toBe('none');
    expect(travelerSelfCancelBlock({ status: 'confirmed', payment_status: 'refunded' })).toBe(
      'refunded'
    );
  });
});
