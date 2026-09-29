import { describe, expect, it } from 'vitest';
import {
  guestMayInvokeSupplierEvent,
  isServiceRoleBearer,
  supplierEventPartyAllowsNotify,
} from './notify-supplier-event-auth';

describe('notify-supplier-event auth (Phase 1093)', () => {
  it('recognizes the service_role bearer', () => {
    expect(isServiceRoleBearer('Bearer secret-key', 'secret-key')).toBe(true);
    expect(isServiceRoleBearer('Bearer other', 'secret-key')).toBe(false);
  });

  it('requires claimed supplierId to match listing owner', () => {
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'sup',
        listingSupplierId: 'sup',
        claimedSupplierId: 'other',
      })
    ).toBe(false);
  });

  it('allows listing owner and team member', () => {
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'sup',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
      })
    ).toBe(true);
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'teammate',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        callerIsTeamMember: true,
      })
    ).toBe(true);
  });

  it('allows booking guest and review author', () => {
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'guest',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        guestUserId: 'guest',
      })
    ).toBe(true);
    expect(
      supplierEventPartyAllowsNotify({
        callerEmail: 'G@X.com',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        guestEmail: 'g@x.com',
        guestUserId: null,
      })
    ).toBe(true);
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'author',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        reviewAuthorUserId: 'author',
      })
    ).toBe(true);
  });

  it('Phase 1349: rejects recycled email when guest_user_id is bound', () => {
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'attacker',
        callerEmail: 'g@x.com',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        guestUserId: 'victim',
        guestEmail: 'g@x.com',
      })
    ).toBe(false);
  });

  it('rejects anonymous and unrelated callers', () => {
    expect(
      supplierEventPartyAllowsNotify({
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
      })
    ).toBe(false);
    expect(
      supplierEventPartyAllowsNotify({
        callerUserId: 'stranger',
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        guestUserId: 'guest',
        callerIsTeamMember: false,
      })
    ).toBe(false);
  });

  it('rejects email ownership when callerEmail is empty (confirmed email only — Phase 1120)', () => {
    expect(
      supplierEventPartyAllowsNotify({
        callerEmail: null,
        listingSupplierId: 'sup',
        claimedSupplierId: 'sup',
        guestEmail: 'g@x.com',
      })
    ).toBe(false);
  });

  it('Phase 1127/1705: guest may invoke guest-originated booking events including cancel responses', () => {
    expect(guestMayInvokeSupplierEvent('guest_message')).toBe(true);
    expect(guestMayInvokeSupplierEvent('booking_detail_changed')).toBe(true);
    expect(guestMayInvokeSupplierEvent('booking_cancelled')).toBe(true);
    expect(guestMayInvokeSupplierEvent('cancellation_accepted')).toBe(true);
    expect(guestMayInvokeSupplierEvent('cancellation_declined')).toBe(true);
    expect(guestMayInvokeSupplierEvent('host_schedule_updated')).toBe(false);
    expect(guestMayInvokeSupplierEvent('new_booking')).toBe(false);
    expect(guestMayInvokeSupplierEvent('cancellation_requested')).toBe(false);
  });
});
