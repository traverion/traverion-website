import { describe, expect, it } from 'vitest';
import { parsePathname } from './appRouting';
import { sanitizeTravelerAuthNext, travelerLoginHref } from './travelerAuthLinks';

describe('consumer path aliases', () => {
  it('sends /tours to the live catalog and /trips to bookings', () => {
    expect(parsePathname('/tours').page).toBe('packages');
    expect(parsePathname('/trips').page).toBe('bookings');
    expect(parsePathname('/packages').page).toBe('packages');
    expect(parsePathname('/stays')).toEqual({ page: 'inventory-reserved', destinationSlug: 'stay' });
    expect(parsePathname('/experiences')).toEqual({ page: 'inventory-reserved', destinationSlug: 'experience' });
    expect(parsePathname('/bookings').page).toBe('bookings');
  });
});

describe('travelerLoginHref', () => {
  it('keeps Log in on /log-in and returns to the page that asked', () => {
    expect(travelerLoginHref('bookings')).toBe('/log-in?next=bookings');
    expect(travelerLoginHref('wishlist')).toBe('/log-in?next=wishlist');
    expect(travelerLoginHref('cart')).toBe('/log-in?next=cart');
    expect(travelerLoginHref('account')).toBe('/log-in?next=account');
  });

  it('does not honor unknown next targets', () => {
    expect(sanitizeTravelerAuthNext('admin')).toBe('home');
    expect(sanitizeTravelerAuthNext('')).toBe('home');
    expect(travelerLoginHref('../login')).toBe('/log-in?next=home');
  });
});
