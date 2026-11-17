import { describe, expect, it } from 'vitest';
import { isSupplierBusinessIdentityLocked } from './supplierVerificationLocks';

describe('isSupplierBusinessIdentityLocked', () => {
  it('locks verified and pending+submitted+typed profiles', () => {
    expect(isSupplierBusinessIdentityLocked('verified', null, 'company')).toBe(true);
    expect(isSupplierBusinessIdentityLocked('pending', '2026-11-17T00:00:00Z', 'company')).toBe(true);
    expect(isSupplierBusinessIdentityLocked('pending', null, 'company')).toBe(false);
    expect(isSupplierBusinessIdentityLocked('rejected', '2026-11-17T00:00:00Z', 'company')).toBe(false);
  });

  it('must not receive a profile object (P9.16.1 crash regression)', () => {
    expect(() =>
      // @ts-expect-error intentional misuse — objects are not status strings
      isSupplierBusinessIdentityLocked({ verification_status: 'pending' })
    ).toThrow();
  });
});
