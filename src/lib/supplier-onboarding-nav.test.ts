import { describe, expect, it } from 'vitest';
import { PARTNER_AFTER_EMAIL_CONFIRM_PATH } from './partnerPortalPaths';
import { localDraftWouldEraseServer, onboardingDraftFlush, onboardingPopAction, previousOnboardingScreen } from './supplier-onboarding-nav';

const visible = ['company', 'documents', 'person', 'bank', 'status'] as const;

describe('onboarding navigation', () => {
  it('gives the first screen no previous step', () => {
    expect(previousOnboardingScreen(visible, 'company')).toBeNull();
    expect(previousOnboardingScreen(visible, 'documents')).toBe('company');
    expect(previousOnboardingScreen(visible, 'person')).toBe('documents');
  });

  it('keeps browser history on onboarding steps and away from email confirmation', () => {
    expect(
      onboardingPopAction({ pathname: '/partner/onboarding', search: '?phase=documents&screen=documents', visible })
    ).toEqual({ type: 'stay', screen: 'documents' });
    expect(onboardingPopAction({ pathname: '/partner', search: '', visible })).toEqual({ type: 'leave' });
    expect(onboardingPopAction({ pathname: '/email-verified', search: '', visible })).toEqual({ type: 'ignore-email' });
  });

  it('sends a confirmed email to supplier home', () => {
    expect(PARTNER_AFTER_EMAIL_CONFIRM_PATH).toBe('/partner');
    expect(PARTNER_AFTER_EMAIL_CONFIRM_PATH.includes('onboarding')).toBe(false);
  });

  it('skips a draft write that is already saved', () => {
    expect(onboardingDraftFlush('same', 'same', false)).toBe('skip');
    expect(onboardingDraftFlush('saved', 'edited', false)).toBe('write');
    expect(onboardingDraftFlush('saved', 'empty', true)).toBe('skip');
  });

  it('refuses to replace a saved representative with an empty local draft', () => {
    expect(localDraftWouldEraseServer({ firstName: '', lastName: '' }, { rep: { first_name: 'Aino' } })).toBe(true);
    expect(localDraftWouldEraseServer({ firstName: 'Aino', lastName: '' }, { rep: { first_name: 'Aino' } })).toBe(false);
    expect(localDraftWouldEraseServer({ firstName: '', lastName: '' }, null)).toBe(false);
  });
});
