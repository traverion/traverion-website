import { describe, expect, it } from 'vitest';
import {
  promotePaidCheckoutOutcome,
  promotePaidRequiresAtomicAssertUpdate,
} from './promote-paid-checkout';

describe('promotePaidCheckoutOutcome', () => {
  it('treats assert RAISE messages as inventory conflict', () => {
    expect(promotePaidCheckoutOutcome(null, 'Those nights are already booked.')).toEqual({
      kind: 'inventory_conflict',
      message: 'Those nights are already booked.',
    });
  });

  it('maps structured RPC reasons', () => {
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
  it('Phase 1513: separate assert then update is unsafe under claim_pending races', () => {
    expect(promotePaidRequiresAtomicAssertUpdate({ assertAndUpdateSameTransaction: false })).toBe(
      false
    );
    expect(promotePaidRequiresAtomicAssertUpdate({ assertAndUpdateSameTransaction: true })).toBe(
      true
    );
  });
});
