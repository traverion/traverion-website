import { describe, expect, it } from 'vitest';
import {
  STAY_GUEST_CANCELLATION_POLICY_48H,
  STAY_GUEST_CANCELLATION_POLICY_7D,
  STAY_GUEST_CANCELLATION_POLICY_NON_REFUNDABLE,
  freeCancelHoursForStayPreset,
  inferFreeCancelHoursFromPolicyText,
  resolveStayCancelPolicyFromSnapshot,
  stayGuestCancellationPolicyText,
} from './stay-cancellation-preset';
import { STAY_GUEST_CANCELLATION_POLICY, TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';
import { travelerSelfCancelDeadlineMs, travelerSelfCancelRefundChoice } from './cancellation-policy';
import { wallTimeInZoneToUtcMs } from './tour-departure-cutoff';

describe('stay cancellation presets', () => {
  it('maps all four presets to hours', () => {
    expect(freeCancelHoursForStayPreset('free_24h')).toBe(24);
    expect(freeCancelHoursForStayPreset('free_48h')).toBe(48);
    expect(freeCancelHoursForStayPreset('free_7d')).toBe(168);
    expect(freeCancelHoursForStayPreset('non_refundable')).toBeNull();
  });

  it('resolves structured snapshot preset over live listing text', () => {
    expect(
      resolveStayCancelPolicyFromSnapshot({
        listingTitle: 'Cabin',
        capturedAt: '2026-01-01T00:00:00Z',
        cancellationPreset: 'free_48h',
        freeCancelHours: 48,
        cancellationPolicy: STAY_GUEST_CANCELLATION_POLICY_48H,
      })
    ).toEqual({
      preset: 'free_48h',
      freeCancelHours: 48,
      source: 'snapshot_preset',
    });
  });

  it('treats explicit freeCancelHours null as non-refundable', () => {
    expect(
      resolveStayCancelPolicyFromSnapshot({
        listingTitle: 'Cabin',
        capturedAt: '2026-01-01T00:00:00Z',
        freeCancelHours: null,
      })
    ).toEqual({
      preset: 'non_refundable',
      freeCancelHours: null,
      source: 'snapshot_hours',
    });
  });

  it('infers legacy policy text without rewriting to live listing defaults', () => {
    expect(inferFreeCancelHoursFromPolicyText(TRAVERION_STANDARD_CANCELLATION_POLICY)).toBe(24);
    expect(inferFreeCancelHoursFromPolicyText(STAY_GUEST_CANCELLATION_POLICY)).toBe(24);
    expect(inferFreeCancelHoursFromPolicyText(STAY_GUEST_CANCELLATION_POLICY_48H)).toBe(48);
    expect(inferFreeCancelHoursFromPolicyText(STAY_GUEST_CANCELLATION_POLICY_7D)).toBe(168);
    expect(inferFreeCancelHoursFromPolicyText(STAY_GUEST_CANCELLATION_POLICY_NON_REFUNDABLE)).toBeNull();
    expect(
      resolveStayCancelPolicyFromSnapshot({
        listingTitle: 'Cabin',
        capturedAt: '2026-01-01T00:00:00Z',
        cancellationPolicy: STAY_GUEST_CANCELLATION_POLICY_7D,
      }).freeCancelHours
    ).toBe(168);
  });

  it('defaults legacy empty snapshots to 24h (historical SQL enforcement)', () => {
    expect(
      resolveStayCancelPolicyFromSnapshot({
        listingTitle: 'Cabin',
        capturedAt: '2026-01-01T00:00:00Z',
      })
    ).toEqual({
      preset: 'free_24h',
      freeCancelHours: 24,
      source: 'legacy_default',
    });
  });

  it('enforces exact cutoff boundary: remaining == hours → no_refund', () => {
    const checkInUtc = wallTimeInZoneToUtcMs('2026-09-10', '16:00', 'Europe/Helsinki')!;
    // Exactly 48h before check-in.
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 48 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 48,
      })
    ).toBe('no_refund');
    // 1ms inside the window.
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-09-10',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 48 * 60 * 60 * 1000 - 1,
        paymentStatus: 'paid',
        freeCancelHours: 48,
      })
    ).toBe('full_refund');
  });

  it('denies ordinary guest refund for non_refundable', () => {
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-12-01',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: Date.parse('2026-01-01T00:00:00Z'),
        paymentStatus: 'paid',
        freeCancelHours: null,
      })
    ).toBe('no_refund');
    expect(
      travelerSelfCancelDeadlineMs({
        bookingDate: '2026-12-01',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        freeCancelHours: null,
      })
    ).toBeNull();
  });

  it('uses property timezone across DST spring-forward (Europe/Helsinki)', () => {
    // 2026-03-29 is DST start in Finland; check-in 16:00 EEST = 13:00 UTC.
    const checkInUtc = wallTimeInZoneToUtcMs('2026-03-29', '16:00', 'Europe/Helsinki')!;
    expect(checkInUtc).toBe(Date.parse('2026-03-29T13:00:00.000Z'));
    const deadline = travelerSelfCancelDeadlineMs({
      bookingDate: '2026-03-29',
      startTimeHm: '16:00',
      departureTimezone: 'Europe/Helsinki',
      freeCancelHours: 24,
    });
    expect(deadline).toBe(checkInUtc - 24 * 60 * 60 * 1000);
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-03-29',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: checkInUtc - 25 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 24,
      })
    ).toBe('full_refund');
  });

  it('uses America/New_York wall clock for 7-day policy', () => {
    // 2026-01-15 15:00 EST = 20:00 UTC.
    const checkInUtc = wallTimeInZoneToUtcMs('2026-01-15', '15:00', 'America/New_York')!;
    expect(checkInUtc).toBe(Date.UTC(2026, 0, 15, 20, 0, 0));
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-01-15',
        startTimeHm: '15:00',
        departureTimezone: 'America/New_York',
        nowMs: checkInUtc - 169 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 168,
      })
    ).toBe('full_refund');
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-01-15',
        startTimeHm: '15:00',
        departureTimezone: 'America/New_York',
        nowMs: checkInUtc - 100 * 60 * 60 * 1000,
        paymentStatus: 'paid',
        freeCancelHours: 168,
      })
    ).toBe('no_refund');
  });

  it('does not follow a later listing edit when snapshot is structured', () => {
    const snap = {
      listingTitle: 'Cabin',
      capturedAt: '2026-01-01T00:00:00Z',
      cancellationPreset: 'non_refundable',
      freeCancelHours: null,
      cancellationPolicy: stayGuestCancellationPolicyText('non_refundable'),
    };
    // Live listing may now be free_7d — snapshot still wins.
    expect(resolveStayCancelPolicyFromSnapshot(snap).freeCancelHours).toBeNull();
    expect(
      travelerSelfCancelRefundChoice({
        bookingDate: '2026-06-01',
        startTimeHm: '16:00',
        departureTimezone: 'Europe/Helsinki',
        nowMs: Date.parse('2026-01-01T00:00:00Z'),
        paymentStatus: 'paid',
        freeCancelHours: resolveStayCancelPolicyFromSnapshot(snap).freeCancelHours,
      })
    ).toBe('no_refund');
  });
});
