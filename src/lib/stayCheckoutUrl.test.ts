import { describe, expect, it } from 'vitest';
import {
  buildStayCheckoutHref,
  buildStayListingHref,
  clearStayCheckoutSearch,
  parseStayCheckoutSearch,
} from './stayCheckoutUrl';

const STAY_ID = 'e21b231b-392a-4912-ba7f-07f7b181a564';

describe('stayCheckoutUrl', () => {
  it('requires book=1 and a valid night range', () => {
    expect(parseStayCheckoutSearch(`stay=${STAY_ID}&checkIn=2026-10-26&checkOut=2026-10-28`)).toBeNull();
    expect(parseStayCheckoutSearch(`book=1&checkIn=2026-10-28&checkOut=2026-10-26`)).toBeNull();
    expect(parseStayCheckoutSearch(`book=1&checkIn=2026-10-26&checkOut=2026-10-28&adults=2`)).toEqual({
      checkIn: '2026-10-26',
      checkOut: '2026-10-28',
      adults: 2,
      children: 0,
      infants: 0,
      paymentCancelled: false,
    });
  });

  it('builds checkout and listing hrefs that round-trip', () => {
    const href = buildStayCheckoutHref(STAY_ID, {
      checkIn: '2026-10-26',
      checkOut: '2026-10-28',
      adults: 2,
      children: 1,
      infants: 0,
      paymentCancelled: false,
    });
    expect(href).toContain('book=1');
    expect(parseStayCheckoutSearch(href.slice(href.indexOf('?')))).toMatchObject({
      checkIn: '2026-10-26',
      checkOut: '2026-10-28',
      adults: 2,
      children: 1,
    });
    const listing = buildStayListingHref(STAY_ID, {
      checkIn: '2026-10-26',
      checkOut: '2026-10-28',
      adults: 2,
    });
    expect(listing).not.toContain('book=');
    expect(parseStayCheckoutSearch(listing.slice(listing.indexOf('?')))).toBeNull();
  });

  it('clears book flag while preserving stay id', () => {
    const next = clearStayCheckoutSearch(new URLSearchParams('stay=x&book=1&payment=cancelled'));
    expect(next.get('book')).toBeNull();
    expect(next.get('payment')).toBeNull();
    expect(next.get('stay')).toBe('x');
  });
});
