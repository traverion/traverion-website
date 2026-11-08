import { describe, expect, it } from 'vitest';
import { buildRentalCheckoutHref, parseRentalCheckoutSearch } from './rentalCheckoutUrl';
import { nextRentalCheckoutSearchAfterAuth } from './rentalCheckoutAuthResume';

const LISTING = 'ea1a4945-b4bd-4b8a-bcab-f065f5a06934';
const VARIANT = '8d7baf63-696d-42a3-b9cf-2c2523ec945a';

const checkoutState = {
  variantId: VARIANT,
  quantity: 1,
  durationUnit: 'day' as const,
  startDate: '2026-11-23',
  endDate: '2026-11-24',
  pickupHm: '09:00',
  returnHm: '18:00',
  paymentCancelled: false,
};

describe('nextRentalCheckoutSearchAfterAuth', () => {
  const windowSearch = buildRentalCheckoutHref(LISTING, checkoutState).split('?')[1]!;
  const withQ = `?${windowSearch}`;

  it('returns null when logged out', () => {
    expect(nextRentalCheckoutSearchAfterAuth('', withQ, false)).toBeNull();
  });

  it('returns null when window search is not an active rental checkout', () => {
    expect(nextRentalCheckoutSearchAfterAuth('', '?variant=x', true)).toBeNull();
    expect(nextRentalCheckoutSearchAfterAuth('', '', true)).toBeNull();
  });

  it('returns null when React search already matches the window', () => {
    expect(nextRentalCheckoutSearchAfterAuth(withQ, withQ, true)).toBeNull();
  });

  it('syncs book=1 selection after login (dates, option, qty preserved)', () => {
    const next = nextRentalCheckoutSearchAfterAuth('', withQ, true);
    expect(next).toBe(withQ);
    const parsed = parseRentalCheckoutSearch(next!);
    expect(parsed).toEqual({
      variantId: VARIANT,
      quantity: 1,
      durationUnit: 'day',
      startDate: '2026-11-23',
      endDate: '2026-11-24',
      pickupHm: '09:00',
      returnHm: '18:00',
      paymentCancelled: false,
    });
  });
});
