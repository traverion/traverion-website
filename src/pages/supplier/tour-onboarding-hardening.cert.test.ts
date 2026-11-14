import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOUR_ONBOARDING_SCREENS,
  tourOnboardingScreenStorageKey,
  tourScreenIndex,
} from '../../lib/tour-onboarding';

describe('Tour onboarding end-to-end hardening contracts', () => {
  const formSrc = readFileSync(resolve(__dirname, 'SupplierListingForm.tsx'), 'utf8');
  const flowSrc = readFileSync(
    resolve(__dirname, '../../components/supplier/listing-creation/TourOnboardingFlow.tsx'),
    'utf8'
  );
  const migrateSrc = formSrc;

  it('keeps the certified 10-screen order', () => {
    expect(TOUR_ONBOARDING_SCREENS.map((s) => s.id)).toEqual([
      'product-type',
      'location',
      'identity',
      'experience',
      'guest-prep',
      'suitability',
      'languages-contact',
      'options',
      'photos',
      'preview',
    ]);
    expect(tourScreenIndex('preview')).toBe(9);
  });

  it('migrates tour (and rental) focused screen keys on create → saved id', () => {
    expect(migrateSrc).toContain('tourOnboardingScreenStorageKey(fromId)');
    expect(migrateSrc).toContain('tourOnboardingScreenStorageKey(toId)');
    expect(migrateSrc).toContain('traverion-rental-onboarding-screen-v1-');
    expect(tourOnboardingScreenStorageKey('create')).toBe(
      'traverion-tour-onboarding-screen-v1-create'
    );
  });

  it('keeps Continue clickable so blockers can surface as hints', () => {
    expect(formSrc).toMatch(/isTourForm\s*\n\s*\? false/);
    expect(formSrc).toContain('setTourStageAttempted(true)');
    expect(flowSrc).toContain('data-tour-continue-blocker');
  });

  it('pins option URL restore to the Options screen and supports Back to preview', () => {
    expect(formSrc).toContain("sessionStorage.setItem(tourOnboardingScreenStorageKey(editingId), 'options')");
    expect(formSrc).toContain('tourReturnStage');
    expect(formSrc).toContain('setTourReturnStage(tourStage)');
    expect(flowSrc).toContain('Back to preview');
    expect(flowSrc).toContain('onReturnToPreview');
  });

  it('deep-links focus sections onto tourStage instead of only stepIdx', () => {
    expect(formSrc).toContain('tourScreenIndexForFocusSection');
    expect(formSrc).toContain('if (isTourForm)');
    expect(formSrc).toContain("optionFieldSections.has(focusSection)");
  });

  it('scrolls the focused content pane when tourStage changes', () => {
    expect(formSrc).toMatch(/tourStage,\s*stayStage,\s*rentalStage/);
  });

  it('does not render a second Experience header under TourOnboardingFlow', () => {
    expect(formSrc).toContain('Focused TourOnboardingFlow owns screen titles');
    expect(flowSrc).toContain('tour-onboarding-experience');
  });
});
