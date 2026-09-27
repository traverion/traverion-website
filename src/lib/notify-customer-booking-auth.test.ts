import { describe, expect, it } from 'vitest';
import {
  bookingPartyAllowsCustomerNotify,
  customerEmailKindRequiresServiceRole,
  guestMayInvokeCustomerEmailKind,
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

  it('Phase 1130: allows supplier team members', () => {
    expect(
      bookingPartyAllowsCustomerNotify({
        callerUserId: 'teammate',
        guestUserId: 'guest',
        callerIsSupplierTeamMember: true,
      })
    ).toBe(true);
  });

  it('rejects email ownership when callerEmail is empty (callers must pass confirmed email only — Phase 1120)', () => {
    expect(
      bookingPartyAllowsCustomerNotify({
        callerEmail: null,
        guestEmail: 'a@b.com',
      })
    ).toBe(false);
    expect(
      bookingPartyAllowsCustomerNotify({
        callerEmail: '',
        guestEmail: 'a@b.com',
      })
    ).toBe(false);
  });

  it('Phase 1128: guest may only invoke guest-originated customer email kinds', () => {
    expect(guestMayInvokeCustomerEmailKind('your_details_updated')).toBe(true);
    expect(guestMayInvokeCustomerEmailKind('booking_cancelled')).toBe(true);
    expect(guestMayInvokeCustomerEmailKind('host_updated_schedule')).toBe(false);
    expect(guestMayInvokeCustomerEmailKind('pickup_confirmed')).toBe(false);
    expect(guestMayInvokeCustomerEmailKind('cancellation_requested_by_supplier')).toBe(false);
    expect(guestMayInvokeCustomerEmailKind('review_request')).toBe(false);
  });

  it('Phase 1131: paid/refund/reminder kinds require service-role', () => {
    expect(customerEmailKindRequiresServiceRole('booking_confirmed_paid')).toBe(true);
    expect(customerEmailKindRequiresServiceRole('refund_completed')).toBe(true);
    expect(customerEmailKindRequiresServiceRole('experience_reminder')).toBe(true);
    expect(customerEmailKindRequiresServiceRole('review_request')).toBe(true);
    expect(customerEmailKindRequiresServiceRole('host_updated_schedule')).toBe(false);
    expect(customerEmailKindRequiresServiceRole('booking_cancelled')).toBe(false);
  });
});
