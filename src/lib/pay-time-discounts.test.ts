import { describe, expect, it } from 'vitest';
import { payTimeDiscountsOrBlock } from './pay-time-discounts';

describe('pay-time discount gate (Phase 1090)', () => {
  it('blocks pay when offers cannot be loaded', () => {
    expect(payTimeDiscountsOrBlock({ ok: false })).toEqual({ proceed: false });
  });

  it('allows pay with an explicit empty offer list (no offers is legitimate)', () => {
    expect(payTimeDiscountsOrBlock({ ok: true, discounts: [] })).toEqual({
      proceed: true,
      discounts: [],
    });
  });

  it('allows pay with loaded offers', () => {
    const discounts = [{ id: 'd1' }];
    expect(payTimeDiscountsOrBlock({ ok: true, discounts })).toEqual({
      proceed: true,
      discounts,
    });
  });
});
