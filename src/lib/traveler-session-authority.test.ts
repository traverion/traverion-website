import { describe, expect, it } from 'vitest';
import { travelerSessionIsPartnerOnly } from './traveler-session-authority';

describe('travelerSessionIsPartnerOnly (Phase 1082)', () => {
  it('blocks supplier-only on traveler surfaces', () => {
    expect(
      travelerSessionIsPartnerOnly({ hasSupplierProfile: true, hasConsumerProfile: false })
    ).toBe(true);
  });

  it('allows traveler-only and dual-role', () => {
    expect(
      travelerSessionIsPartnerOnly({ hasSupplierProfile: false, hasConsumerProfile: true })
    ).toBe(false);
    expect(
      travelerSessionIsPartnerOnly({ hasSupplierProfile: true, hasConsumerProfile: true })
    ).toBe(false);
    expect(
      travelerSessionIsPartnerOnly({ hasSupplierProfile: false, hasConsumerProfile: false })
    ).toBe(false);
  });

  it('never blocks admin', () => {
    expect(
      travelerSessionIsPartnerOnly({
        hasSupplierProfile: true,
        hasConsumerProfile: false,
        isAdmin: true,
      })
    ).toBe(false);
  });
});
