import { describe, expect, it } from 'vitest';
import { parsePathname } from './appRouting';
import { sanitizeTravelerAuthNext, travelerLoginHref, parseTravelerReturnStay, serializeTravelerReturnStay } from './travelerAuthLinks';

describe('consumer path aliases', () => {
  it('sends /tours to the live catalog and /trips to bookings', () => {
    expect(parsePathname('/tours').page).toBe('packages');
    expect(parsePathname('/trips').page).toBe('bookings');
    expect(parsePathname('/packages').page).toBe('packages');
    expect(parsePathname('/stays')).toEqual({ page: 'stays', destinationSlug: null });
    expect(parsePathname('/experiences')).toEqual({ page: 'inventory-reserved', destinationSlug: 'experience' });
    expect(parsePathname('/bookings').page).toBe('bookings');
  });
});

describe('travelerLoginHref', () => {
  it('keeps Log in on /log-in and returns to the page that asked', () => {
    expect(travelerLoginHref('bookings')).toBe('/log-in?next=bookings');
    expect(travelerLoginHref('wishlist')).toBe('/log-in?next=wishlist');
    expect(travelerLoginHref('cart')).toBe('/log-in?next=bookings');
    expect(travelerLoginHref('account')).toBe('/log-in?next=account');
    expect(travelerLoginHref('stays')).toBe('/log-in?next=stays');
    expect(travelerLoginHref('packages')).toBe('/log-in?next=packages');
    expect(travelerLoginHref('partner')).toBe('/log-in?next=home');
    expect(travelerLoginHref('signup')).toBe('/log-in?next=home');
  });

  it('does not honor unknown next targets', () => {
    expect(sanitizeTravelerAuthNext('admin')).toBe('home');
    expect(sanitizeTravelerAuthNext('')).toBe('home');
    expect(travelerLoginHref('../login')).toBe('/log-in?next=home');
  });
});

describe('traveler return stay nights', () => {
  it('round-trips nights and guests, and accepts legacy plain uuid', () => {
    const id = '83f88255-63ef-4824-93a2-89cc13244567';
    expect(parseTravelerReturnStay(id)).toEqual({ id });
    const raw = serializeTravelerReturnStay({
      id,
      checkIn: '2026-09-20',
      checkOut: '2026-09-22',
      guests: 2,
    });
    expect(parseTravelerReturnStay(raw)).toEqual({
      id,
      checkIn: '2026-09-20',
      checkOut: '2026-09-22',
      guests: 2,
    });
    expect(parseTravelerReturnStay('{"id":"not-a-uuid"}')).toBe(null);
  });
});
