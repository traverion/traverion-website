import { describe, expect, it } from 'vitest';
import {
  travelerCheckoutIdentitySyncPatch,
  travelerOwnsCheckoutBooking,
} from '../../supabase/functions/_shared/booking-traveler-ownership.ts';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const ATTACKER = '22222222-2222-4222-8222-222222222222';

describe('travelerOwnsCheckoutBooking', () => {
  it('allows bound account even when email no longer matches row', () => {
    expect(
      travelerOwnsCheckoutBooking({
        authUserId: VICTIM,
        verifiedEmail: 'new@example.com',
        guestUserId: VICTIM,
        guestEmail: 'old@example.com',
      })
    ).toBe(true);
  });

  it('rejects recycled email when guest_user_id is bound to someone else', () => {
    expect(
      travelerOwnsCheckoutBooking({
        authUserId: ATTACKER,
        verifiedEmail: 'old@example.com',
        guestUserId: VICTIM,
        guestEmail: 'old@example.com',
      })
    ).toBe(false);
  });

  it('allows verified email match only when guest_user_id is null', () => {
    expect(
      travelerOwnsCheckoutBooking({
        authUserId: ATTACKER,
        verifiedEmail: 'old@example.com',
        guestUserId: null,
        guestEmail: 'old@example.com',
      })
    ).toBe(true);
    expect(
      travelerOwnsCheckoutBooking({
        authUserId: ATTACKER,
        verifiedEmail: 'other@example.com',
        guestUserId: null,
        guestEmail: 'old@example.com',
      })
    ).toBe(false);
  });
});

describe('travelerCheckoutIdentitySyncPatch', () => {
  it('never reassigns guest_user_id away from a bound account', () => {
    expect(
      travelerCheckoutIdentitySyncPatch({
        authUserId: ATTACKER,
        verifiedEmail: 'old@example.com',
        guestUserId: VICTIM,
        guestEmail: 'old@example.com',
      })
    ).toBeNull();
  });

  it('binds uid on unbound email-owned hold and refreshes email for owner', () => {
    expect(
      travelerCheckoutIdentitySyncPatch({
        authUserId: VICTIM,
        verifiedEmail: 'new@example.com',
        guestUserId: null,
        guestEmail: 'new@example.com',
      })
    ).toEqual({ guest_user_id: VICTIM });

    expect(
      travelerCheckoutIdentitySyncPatch({
        authUserId: VICTIM,
        verifiedEmail: 'new@example.com',
        guestUserId: VICTIM,
        guestEmail: 'old@example.com',
      })
    ).toEqual({ guest_email: 'new@example.com' });
  });
});
