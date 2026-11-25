import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  companyOnboardingPresentation,
  onboardingGroupProgress,
  onboardingOverallStep,
  canRevisitOnboardingPhase,
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
      'address',
      'person',
      'director',
      'others',
      'bank',
      'status',
    ]);
  });

  it('keeps ownership on the representative screen and skips other owners at 100 percent', () => {
    expect(visibleSupplierOnboardingScreens({ ...open, owns: true, share: 100 }).includes('share')).toBe(false);
    expect(visibleSupplierOnboardingScreens({ ...open, owns: true, share: 100 }).includes('others')).toBe(false);
    expect(visibleSupplierOnboardingScreens({ ...open, owns: true, share: 40 }).includes('others')).toBe(true);
  });

  it('opens payouts after representative details even when no payout account exists', () => {
    const screens = visibleSupplierOnboardingScreens({
      ...open,
      bankOpen: false,
      termsOpen: false,
      owns: true,
      share: 100,
    });
    expect(screens[screens.indexOf('person') + 1]).toBe('director');
    expect(screens[screens.indexOf('director') + 1]).toBe('bank');
    expect(screens).not.toContain('consent');
    expect(screenFromOnboardingUrl('?phase=representative&screen=consent', screens)).toBe('bank');
  });

  it('keeps an extra owner on the other-owners screen', () => {
    expect(visibleSupplierOnboardingScreens({ ...open, others: true })).not.toContain('owner');
    expect(visibleSupplierOnboardingScreens({ ...open, others: true })).toContain('others');
  });

  it('skips identity once Stripe has no person requirements', () => {
    const screens = visibleSupplierOnboardingScreens({
      ...open,
      identityOpen: false,
      bankOpen: false,
      termsOpen: false,
    });
    expect(screens).toEqual(['company', 'address', 'status']);
  });

  it('resumes the requested screen', () => {
    const visible = visibleSupplierOnboardingScreens(open);
    expect(screenFromOnboardingUrl('?phase=representative&screen=dob', visible)).toBe('person');
    expect(screenFromOnboardingUrl('?phase=representative&screen=ownership', visible)).toBe('director');
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
    expect(onboardingGroupProgress(visible, 'person')).toEqual({ group: 'Identity', index: 1, total: 3 });
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

  it('saves the representative draft without opening a payout account', () => {
    const flow = readFileSync('src/components/supplier/SupplierOnboardingFlow.tsx', 'utf8');
    const person = flow.slice(flow.indexOf("if (screen === 'person')"), flow.indexOf("if (screen === 'others')"));
    const others = flow.slice(flow.indexOf("if (screen === 'others')"), flow.indexOf("if (screen === 'bank')"));
    expect(person).toMatch(/advance\('person'/);
    expect(person).toMatch(/advance\('director'/);
    expect(flow).not.toContain("requested === 'director'");
    expect(flow).toContain("import { validateIsoDob } from '../../lib/date-of-birth'");
    expect(others).toMatch(/advance\('others'/);
    expect(`${person}\n${others}`).not.toMatch(/ensure_account|submitIdentity|completeSetup|submit_business/);
    const edge = readFileSync('supabase/functions/connect-supplier-onboarding/index.ts', 'utf8');
    const draftSave = edge.slice(edge.indexOf("action === 'save_wizard_draft'"), edge.indexOf("action === 'status'"));
    expect(draftSave).not.toMatch(/ensureConnectedAccount|syncAccount/);
    expect(draftSave).toMatch(/success: true, action: 'save_wizard_draft'/);
  });

  it('asks Stripe for at most 20 people per page', () => {
    const src = readFileSync('supabase/functions/connect-supplier-onboarding/index.ts', 'utf8');
    expect(src).not.toMatch(/persons\?limit=100/);
    expect(src).toMatch(/limit: '20'/);
  });

  it('does not describe an empty company as verified', () => {
    expect(companyOnboardingPresentation({ verified: false, pendingReview: false, hasCompany: false })).toMatchObject({
      mode: 'form',
    });
    expect(
      companyOnboardingPresentation({ verified: false, pendingReview: false, hasCompany: false }).body
    ).not.toMatch(/verified company record/i);
    expect(companyOnboardingPresentation({ verified: true, pendingReview: false, hasCompany: true }).mode).toBe(
      'verified'
    );
    expect(companyOnboardingPresentation({ verified: false, pendingReview: true, hasCompany: true }).mode).toBe(
      'pending'
    );
  });

  it('lets a supplier reopen an earlier phase and not a later one', () => {
    const visible = visibleSupplierOnboardingScreens(open);
    expect(canRevisitOnboardingPhase('business', 'representative', visible)).toBe(true);
    expect(canRevisitOnboardingPhase('documents', 'representative', visible)).toBe(false);
    expect(canRevisitOnboardingPhase('payout', 'representative', visible)).toBe(false);
    expect(canRevisitOnboardingPhase('representative', 'payout', ['company', 'bank', 'status'])).toBe(false);
    expect(onboardingOverallStep(visible, 'person')).toEqual({ index: 3, total: visible.length });
    expect(onboardingOverallStep(['company', 'address', 'bank', 'status'], 'documents')).toEqual({
      index: 3,
      total: 5,
    });
    expect(onboardingOverallStep(['company', 'address', 'person', 'bank', 'status'], 'documents').index).toBe(3);
  });
});
