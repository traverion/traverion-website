import { describe, expect, it } from 'vitest';
import { PARTNER_AFTER_EMAIL_CONFIRM_PATH } from './partnerPortalPaths';
import {
  adjacentOnboardingScreen,
  initialOnboardingJourney,
  localDraftWouldEraseServer,
  onboardingDraftFlush,
  onboardingPopAction,
  previousOnboardingScreen,
  reconcileOnboardingJourney,
} from './supplier-onboarding-nav';

const visible = ['company', 'documents', 'person', 'bank', 'status'] as const;

describe('onboarding navigation', () => {
  it('gives the first screen no previous step', () => {
    expect(previousOnboardingScreen(visible, 'company')).toBeNull();
    expect(previousOnboardingScreen(visible, 'documents')).toBe('company');
    expect(previousOnboardingScreen(visible, 'person')).toBe('documents');
  });

  it('moves one screen at a time and keeps the screen that was just left', () => {
    const full = ['company', 'documents', 'person', 'others', 'consent', 'bank', 'status'] as const;
    let journey = initialOnboardingJourney(full, 'company');
    for (let index = 0; index < full.length - 1; index += 1) {
      expect(adjacentOnboardingScreen(journey, full[index], 1)).toBe(full[index + 1]);
      expect(previousOnboardingScreen(journey, full[index + 1])).toBe(full[index]);
      journey = reconcileOnboardingJourney(journey, full[index], full);
    }
    const afterUpload = reconcileOnboardingJourney(
      full,
      'person',
      ['company', 'person', 'consent', 'bank', 'status']
    );
    expect(afterUpload).toEqual(['company', 'documents', 'person', 'consent', 'bank', 'status']);
    expect(adjacentOnboardingScreen(afterUpload, 'person', 1)).toBe('consent');
    expect(previousOnboardingScreen(afterUpload, 'person')).toBe('documents');
  });

  it('keeps browser history on the named screen instead of the first screen', () => {
    expect(
      onboardingPopAction({
        pathname: '/partner/onboarding',
        search: '?phase=representative&screen=person',
        visible: ['company', 'status'],
      })
    ).toEqual({ type: 'stay', screen: 'person' });
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
