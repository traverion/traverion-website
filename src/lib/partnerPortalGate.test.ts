import { describe, expect, it } from 'vitest';
import {
  PARTNER_PORTAL_ACCESS_FALSE_STREAK_TO_BLOCK,
  PARTNER_PORTAL_ACCESS_MIN_ATTEMPT_TO_BLOCK,
  partnerPortalAccessFalseShouldBlock,
  partnerPortalBlockedShouldSignOut,
} from './partnerPortalGate';

describe('partnerPortalGate', () => {
  it('Phase 1857: does not block on the first two cold false reads', () => {
    expect(partnerPortalAccessFalseShouldBlock({ falseStreak: 2, attempt: 1 })).toBe(false);
    expect(
      partnerPortalAccessFalseShouldBlock({
        falseStreak: PARTNER_PORTAL_ACCESS_FALSE_STREAK_TO_BLOCK - 1,
        attempt: PARTNER_PORTAL_ACCESS_MIN_ATTEMPT_TO_BLOCK,
      })
    ).toBe(false);
  });

  it('Phase 1857: blocks only after sustained false streak', () => {
    expect(
      partnerPortalAccessFalseShouldBlock({
        falseStreak: PARTNER_PORTAL_ACCESS_FALSE_STREAK_TO_BLOCK,
        attempt: PARTNER_PORTAL_ACCESS_MIN_ATTEMPT_TO_BLOCK,
      })
    ).toBe(true);
  });

  it('Phase 1857: partner signup metadata must not auto-sign-out on gate block', () => {
    expect(partnerPortalBlockedShouldSignOut({ hasPartnerSignupMetadata: true })).toBe(false);
    expect(partnerPortalBlockedShouldSignOut({ hasPartnerSignupMetadata: false })).toBe(true);
  });
});
