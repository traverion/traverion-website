import { describe, expect, it } from 'vitest';
import {
  promotePaidCheckoutOutcome,
  promotePaidRequiresAtomicAssertUpdate,
  paidPromotionShouldRefusePastDepartureCutoff,
  promotePaidAssertStartTimeHm,
  promotePaidStayColumnBackfill,
} from './promote-paid-checkout';

describe('promotePaidCheckoutOutcome', () => {
  it('maps inventory conflict errors and paid outcomes', () => {
    expect(promotePaidCheckoutOutcome(null, 'Those nights are already booked.')).toEqual({
      kind: 'inventory_conflict',
      message: 'Those nights are already booked.',
    });
    expect(promotePaidCheckoutOutcome({ ok: true, booking_id: 'b1' })).toEqual({ kind: 'promoted' });
    expect(promotePaidCheckoutOutcome({ ok: false, reason: 'already_paid' })).toEqual({
      kind: 'already_paid',
    });
    expect(promotePaidCheckoutOutcome({ ok: false, reason: 'update_race' })).toEqual({
      kind: 'unpromoted',
      reason: 'update_race',
    });
  });
});

describe('promotePaidRequiresAtomicAssertUpdate', () => {
  it('requires assert and update in one transaction', () => {
    expect(promotePaidRequiresAtomicAssertUpdate({ assertAndUpdateSameTransaction: false })).toBe(
      false
    );
    expect(promotePaidRequiresAtomicAssertUpdate({ assertAndUpdateSameTransaction: true })).toBe(
      true
    );
  });
});

describe('paidPromotionShouldRefusePastDepartureCutoff', () => {
  it('Phase 1532: refuses tour departures past cutoff; stays skip', () => {
    expect(
      paidPromotionShouldRefusePastDepartureCutoff({
        isStay: false,
        startTimeHm: '20:00',
        cutoffStillBookable: false,
      })
    ).toBe(true);
    expect(
      paidPromotionShouldRefusePastDepartureCutoff({
        isStay: false,
        startTimeHm: '20:00',
        cutoffStillBookable: true,
      })
    ).toBe(false);
    expect(
      paidPromotionShouldRefusePastDepartureCutoff({
        isStay: true,
        startTimeHm: '16:00',
        cutoffStillBookable: false,
      })
    ).toBe(false);
    expect(
      paidPromotionShouldRefusePastDepartureCutoff({
        isStay: false,
        startTimeHm: '',
        cutoffStillBookable: false,
      })
    ).toBe(false);
    // Phase 1533: option.startTime fills empty frozen HM
    expect(
      paidPromotionShouldRefusePastDepartureCutoff({
        isStay: false,
        startTimeHm: '',
        optionStartTimeHm: '20:00',
        cutoffStillBookable: false,
      })
    ).toBe(true);
  });
});

describe('promotePaidAssertStartTimeHm', () => {
  it('Phase 1535: prefers frozen HM, else resolved option HM', () => {
    expect(
      promotePaidAssertStartTimeHm({
        frozenStartTimeHm: '',
        resolvedCutoffStartTimeHm: '09:00',
      })
    ).toBe('09:00');
    expect(
      promotePaidAssertStartTimeHm({
        frozenStartTimeHm: '14:00',
        resolvedCutoffStartTimeHm: '09:00',
      })
    ).toBe('14:00');
  });
});

describe('promotePaidStayColumnBackfill', () => {
  it('Phase 1542: snapshot-only stay gets check_out and nights', () => {
    expect(
      promotePaidStayColumnBackfill({
        isStayNight: true,
        existingCheckOut: null,
        existingNights: null,
        stayExclusiveCheckOut: '2026-12-05',
        bookingDate: '2026-12-01',
      })
    ).toEqual({ check_out: '2026-12-05', nights: 4 });
  });

  it('Phase 1553: stale nights column yields to exclusive range', () => {
    expect(
      promotePaidStayColumnBackfill({
        isStayNight: true,
        existingCheckOut: '2026-12-05',
        existingNights: 2,
        stayExclusiveCheckOut: '2026-12-05',
        bookingDate: '2026-12-01',
      })
    ).toEqual({ check_out: '2026-12-05', nights: 4 });
  });

  it('Phase 1542: tours unchanged', () => {
    expect(
      promotePaidStayColumnBackfill({
        isStayNight: false,
        existingCheckOut: null,
        existingNights: null,
        stayExclusiveCheckOut: '2026-12-05',
        bookingDate: '2026-12-01',
      })
    ).toEqual({ check_out: null, nights: null });
  });
});
