import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tour onboarding full-screen unification', () => {
  const formSrc = readFileSync(resolve(__dirname, 'SupplierListingForm.tsx'), 'utf8');
  const flowSrc = readFileSync(
    resolve(__dirname, '../../components/supplier/listing-creation/TourOnboardingFlow.tsx'),
    'utf8'
  );
  const libSrc = readFileSync(resolve(__dirname, '../../lib/tour-onboarding.ts'), 'utf8');

  it('lazy-loads TourOnboardingFlow like Stay and Rental', () => {
    expect(formSrc).toMatch(/lazy\(\(\) => import\('\.\.\/\.\.\/components\/supplier\/listing-creation\/TourOnboardingFlow'\)\)/);
    expect(formSrc).toContain('isTourForm');
    expect(formSrc).toMatch(/isFocusedCreator = isStayForm \|\| isRentalForm \|\| isTourForm/);
  });

  it('reuses TourBasicsGuidedScenes and ListingInformationStage inside the focused flow', () => {
    expect(flowSrc).toContain('TourBasicsGuidedScenes');
    expect(flowSrc).toContain('ListingInformationStage');
    expect(flowSrc).toContain('hideProgress="all"');
    expect(flowSrc).toContain('extraPanel');
  });

  it('keeps option / schedule overlays outside the focused body', () => {
    expect(formSrc).toContain('TourOptionWorkspace');
    expect(formSrc).toContain('tourOptionGuided');
    expect(libSrc).toContain("id: 'options'");
    expect(libSrc).toContain('tourStageBlocker');
  });
});
