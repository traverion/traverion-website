import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  onboardingGroupProgress,
  requirementFlags,
  screenFromOnboardingUrl,
  visibleSupplierOnboardingScreens,
} from './supplier-onboarding-steps';

const open = {
  isCompany: true,
  hasRegistrationFile: true,
  businessRejected: false,
  identityOpen: true,
  owns: false,
  share: null as number | null,
  others: null as boolean | null,
  hasExtraOwner: false,
  bankOpen: true,
  termsOpen: true,
};

describe('supplier onboarding screens', () => {
  it('skips a stored registration document and unneeded owner questions', () => {
    expect(visibleSupplierOnboardingScreens(open)).toEqual([
      'company',
      'person',
      'dob',
      'director',
      'ownership',
      'others',
      'consent',
      'bank',
      'terms',
      'status',
    ]);
  });

  it('asks for a share, and skips other owners at 100 percent', () => {
    expect(
      visibleSupplierOnboardingScreens({ ...open, owns: true, share: 100, others: false }).includes('share')
    ).toBe(true);
    expect(
      visibleSupplierOnboardingScreens({ ...open, owns: true, share: 100 }).includes('others')
    ).toBe(false);
  });

  it('shows another owner only after the supplier says yes', () => {
    expect(visibleSupplierOnboardingScreens({ ...open, others: true })).toContain('owner');
    expect(visibleSupplierOnboardingScreens(open)).not.toContain('owner');
  });

  it('skips identity once Stripe has no person requirements', () => {
    const screens = visibleSupplierOnboardingScreens({
      ...open,
      identityOpen: false,
      bankOpen: false,
      termsOpen: false,
    });
    expect(screens).toEqual(['company', 'status']);
  });

  it('resumes the requested screen', () => {
    const visible = visibleSupplierOnboardingScreens(open);
    expect(screenFromOnboardingUrl('?phase=representative&screen=dob', visible)).toBe('dob');
    expect(screenFromOnboardingUrl('?phase=payout', visible)).toBe('bank');
  });

  it('sends a reset visit to Company even when the link is a later screen', () => {
    const visible = visibleSupplierOnboardingScreens(open);
    expect(
      screenFromOnboardingUrl('?phase=status&screen=status', visible, { forceCompany: true })
    ).toBe('company');
    expect(
      screenFromOnboardingUrl('?phase=representative&screen=dob', visible, { forceCompany: true })
    ).toBe('company');
  });

  it('numbers screens inside their group', () => {
    const visible = visibleSupplierOnboardingScreens(open);
    expect(onboardingGroupProgress(visible, 'dob')).toEqual({ group: 'Identity', index: 2, total: 6 });
  });

  it('reads open Stripe requirements', () => {
    expect(
      requirementFlags(
        ['directors.dob.day', 'external_account', 'tos_acceptance.date'],
        true
      )
    ).toEqual({ identityOpen: true, bankOpen: true, termsOpen: true });
    expect(requirementFlags(['external_account'], true).identityOpen).toBe(false);
  });

  it('asks Stripe for at most 20 people per page', () => {
    const src = readFileSync('supabase/functions/connect-supplier-onboarding/index.ts', 'utf8');
    expect(src).not.toMatch(/persons\?limit=100/);
    expect(src).toMatch(/limit: '20'/);
  });
});
