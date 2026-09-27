import { describe, expect, it } from 'vitest';
import {
  bookingPartyAllowsCustomerNotify,
  isServiceRoleBearer,
} from './notify-customer-booking-auth';

describe('notify-customer-booking auth (Phase 1092)', () => {
  it('recognizes the service_role bearer', () => {
    expect(isServiceRoleBearer('Bearer secret-key', 'secret-key')).toBe(true);
    expect(isServiceRoleBearer('bearer secret-key', 'secret-key')).toBe(true);
    expect(isServiceRoleBearer('Bearer other', 'secret-key')).toBe(false);
    expect(isServiceRoleBearer(null, 'secret-key')).toBe(false);
    expect(isServiceRoleBearer('Bearer secret-key', '')).toBe(false);
  });

  it('allows the booking guest by user id or email', () => {
    expect(
      bookingPartyAllowsCustomerNotify({
        callerUserId: 'u1',
        guestUserId: 'u1',
        guestEmail: 'a@b.com',
      })
    ).toBe(true);
    expect(
      bookingPartyAllowsCustomerNotify({
        callerEmail: 'A@B.com',
        guestEmail: 'a@b.com',
      })
    ).toBe(true);
  });

  it('allows the listing supplier owner', () => {
    expect(
      bookingPartyAllowsCustomerNotify({
        callerUserId: 'sup',
        guestUserId: 'guest',
        callerIsListingSupplier: true,
      })
    ).toBe(true);
  });

  it('rejects anonymous and unrelated callers', () => {
    expect(bookingPartyAllowsCustomerNotify({})).toBe(false);
    expect(
      bookingPartyAllowsCustomerNotify({
        callerUserId: 'stranger',
        guestUserId: 'guest',
        guestEmail: 'g@x.com',
        callerEmail: 's@x.com',
        callerIsListingSupplier: false,
      })
    ).toBe(false);
  });
});
