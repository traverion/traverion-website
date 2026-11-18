import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  onboardingCompletionCopy,
  resolveOnboardingCompletionState,
  suggestRepresentativeNameFromDirectors,
  supplierFacingLiveCreateBlockReason,
  PAYOUT_WIZARD_RETURN_HREF,
} from './payout-setup-wizard';

describe('P9.44 one-form onboarding + LIVE Connect readiness', () => {
  it('returns suppliers to the unified onboarding status shell', () => {
    expect(PAYOUT_WIZARD_RETURN_HREF).toBe('/partner/onboarding?phase=status');
    const edge = readFileSync(
      'supabase/functions/connect-supplier-onboarding/index.ts',
      'utf8'
    );
    expect(edge).toContain('/partner/onboarding?phase=status&connect=return');
    expect(edge).toContain('/partner/onboarding?phase=status&connect=refresh');
    expect(edge).toContain("PARTNER_PORTAL_ORIGIN = 'https://partner.traverion.com'");
    expect(edge).not.toMatch(
      /return_url: `\$\{origin\}\/partner\/money\?tab=settings&connect=return`/
    );
  });

  it('soft-suggests a single director name without inventing DOB', () => {
    expect(suggestRepresentativeNameFromDirectors('Miro Vesterinen')).toEqual({
      first_name: 'Miro',
      last_name: 'Vesterinen',
    });
    expect(suggestRepresentativeNameFromDirectors('Miro Vesterinen\nOther Person')).toBeNull();
  });

  it('maps technical LIVE blocks to short supplier instructions', () => {
    expect(
      supplierFacingLiveCreateBlockReason('LIVE payout account creation is turned off.')
    ).toMatch(/not open yet/i);
    expect(
      supplierFacingLiveCreateBlockReason('This supplier is not approved for LIVE payout account creation.')
    ).toMatch(/being prepared/i);
  });

  it('distinguishes setup submitted, verification pending, and ready to receive', () => {
    expect(
      resolveOnboardingCompletionState({
        hasConnectedAccount: false,
        canReceiveTransfers: false,
        wizardCompleted: true,
      })
    ).toBe('setup_submitted');
    expect(
      resolveOnboardingCompletionState({
        hasConnectedAccount: true,
        canReceiveTransfers: false,
      })
    ).toBe('verification_pending');
    expect(
      resolveOnboardingCompletionState({
        hasConnectedAccount: true,
        canReceiveTransfers: true,
        connectLivemode: true,
      })
    ).toBe('ready_to_receive');
    expect(onboardingCompletionCopy('verification_pending').title).toMatch(/pending/i);
    expect(onboardingCompletionCopy('ready_to_receive').title).toMatch(/receive/i);
  });

  it('status shell syncs Stripe return inside PartnerOnboarding', () => {
    const page = readFileSync('src/pages/supplier/PartnerOnboarding.tsx', 'utf8');
    expect(page).toContain("connect !== 'return'");
    expect(page).toContain('Continue verification');
    expect(page).toContain('fetchConnectAccountLink');
    expect(page).toContain('onboardingCompletionCopy');
  });
});
