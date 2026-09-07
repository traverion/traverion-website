import { describe, expect, it } from 'vitest';
import { USER_ERROR, isTechnicalErrorMessage, userFacingError } from './userFacingError';

describe('userFacingError', () => {
  it('keeps short human copy', () => {
    expect(userFacingError('Incorrect email or password.')).toBe('Incorrect email or password.');
    expect(userFacingError('This date is fully booked. Choose another day.')).toBe(
      'This date is fully booked. Choose another day.'
    );
  });

  it('never shows provider, database, or stack text', () => {
    expect(userFacingError('PGRST116: JSON object requested, multiple (or no) rows returned', USER_ERROR.tours)).toBe(
      USER_ERROR.tours
    );
    expect(userFacingError('new row violates row-level security policy for table bookings', USER_ERROR.trips)).toBe(
      USER_ERROR.trips
    );
    expect(userFacingError('JWT expired', USER_ERROR.auth)).toBe(USER_ERROR.auth);
    expect(userFacingError('Failed to fetch', USER_ERROR.generic)).toBe(USER_ERROR.generic);
    expect(userFacingError('TypeError: Failed to fetch', USER_ERROR.generic)).toBe(USER_ERROR.generic);
    expect(userFacingError('duplicate key value violates unique constraint "listings_pkey"', USER_ERROR.listingSave)).toBe(
      USER_ERROR.listingSave
    );
    expect(userFacingError('Stripe: No such checkout.session: cs_test_abc', USER_ERROR.checkout)).toBe(
      USER_ERROR.checkout
    );
  });

  it('treats empty and overlong messages as technical', () => {
    expect(isTechnicalErrorMessage('')).toBe(true);
    expect(userFacingError('   ')).toBe(USER_ERROR.generic);
    expect(userFacingError('x'.repeat(300), USER_ERROR.tour)).toBe(USER_ERROR.tour);
  });

  it('accepts Error objects', () => {
    expect(userFacingError(new Error('Could not load tours. Check your connection and try again.'))).toBe(
      'Could not load tours. Check your connection and try again.'
    );
    expect(userFacingError(new Error('supabase from().select() failed'), USER_ERROR.listings)).toBe(USER_ERROR.listings);
  });
});
