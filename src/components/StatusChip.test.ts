import { describe, expect, it } from 'vitest';
import { toneForTravelerTripCard } from './StatusChip';

describe('toneForTravelerTripCard', () => {
  it('uses Refund due warn accent instead of Cancelled rose (Phase 1390)', () => {
    expect(toneForTravelerTripCard('Cancelled', 'Refund due')).toBe('warn');
  });

  it('prefers Refunded info when lifecycle is still Cancelled', () => {
    expect(toneForTravelerTripCard('Cancelled', 'Refunded')).toBe('info');
  });

  it('uses lifecycle when payment matches (cancelled unpaid)', () => {
    expect(toneForTravelerTripCard('Cancelled', 'Cancelled')).toBe('bad');
  });

  it('host cancellation request overrides to warn', () => {
    expect(
      toneForTravelerTripCard('Confirmed', 'Paid', { hostCancellation: true })
    ).toBe('warn');
  });
});
