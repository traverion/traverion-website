import { describe, expect, it } from 'vitest';
import { partnerPayoutVerifiedStatusNote } from './supplierOnboarding';

describe('partner payout-verified status copy', () => {
  it('does not say business verification is still required when business is already verified', () => {
    const bothVerified = partnerPayoutVerifiedStatusNote(true);
    const payoutOnly = partnerPayoutVerifiedStatusNote(false);
    expect(bothVerified.toLowerCase()).toContain('bank details approved');
    expect(bothVerified.toLowerCase()).not.toContain('still required');
    expect(payoutOnly.toLowerCase()).toContain('bank details approved');
    expect(payoutOnly.toLowerCase()).toContain('business verification is still required');
  });
});
