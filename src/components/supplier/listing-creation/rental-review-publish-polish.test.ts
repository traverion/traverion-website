/**
 * Merged Review & Publish rental creator screen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RENTAL_ONBOARDING_SCREENS,
  resolveRentalScreenId,
  rentalPublishBlockers,
  rentalScreenIndex,
} from '../../../lib/rental-onboarding';
import { emptyRentalDetails } from '../../../lib/rental-details';

const here = dirname(fileURLToPath(import.meta.url));
const flowSrc = readFileSync(join(here, 'RentalOnboardingFlow.tsx'), 'utf8');

describe('rental review & publish polish', () => {
  it('keeps one final Review & Publish screen and aliases legacy publish', () => {
    expect(RENTAL_ONBOARDING_SCREENS).toHaveLength(23);
    expect(RENTAL_ONBOARDING_SCREENS.at(-1)?.id).toBe('preview');
    expect(RENTAL_ONBOARDING_SCREENS.at(-1)?.title).toBe('Review & Publish');
    expect(RENTAL_ONBOARDING_SCREENS.some((s) => s.id === 'publish')).toBe(false);
    expect(resolveRentalScreenId('publish')).toBe('preview');
    expect(rentalScreenIndex('preview')).toBe(RENTAL_ONBOARDING_SCREENS.length - 1);
    expect(flowSrc).toContain('ReviewPublishStage');
    expect(flowSrc).not.toContain('function PublishStage');
    expect(flowSrc).not.toContain("case 'publish':");
    expect(flowSrc).toContain('Supplier preview');
    expect(flowSrc).toContain('rental-review-supplier-label');
    expect(flowSrc).toContain('Ready to publish');
    expect(flowSrc).toContain('rental-review-ready');
    expect(flowSrc).not.toContain('Preview only');
    expect(flowSrc).not.toContain('rental-review-ready__actions');
    expect(flowSrc).not.toContain('Travelers cannot');
    expect(flowSrc).not.toContain('not a live bookable');
    expect(flowSrc).toContain('rentalVariantComplete');
    expect(flowSrc).toContain('Incomplete');
    expect(flowSrc).toContain('Back to review');
  });

  it('still blocks incomplete options and missing publish requirements', () => {
    const incomplete = {
      title: 'Arctic Fatbike',
      subtitle: 'Fatbikes ready for snow trails.',
      description: 'Guided-ready fatbikes for a full day on prepared winter trails around Rovaniemi.',
      galleryCount: 3,
      city: 'Rovaniemi',
      country: 'Finland',
      experienceLanguage: 'en',
      rental: {
        ...emptyRentalDetails(),
        category: 'bikes' as const,
        itemType: 'fat_bike',
        shortIntro: 'Fatbikes ready for snow trails.',
        pickupAddress: 'Koskikatu 1',
        returnSameAsPickup: true,
        staffAssisted: true,
        returnStaffAssisted: true,
        cancellationPreset: 'flexible_24h' as const,
        variants: [{ id: 'x', name: 'Standard', quantity: 2 }],
      },
    };
    const issues = rentalPublishBlockers(incomplete);
    expect(issues.some((line) => /option|pricing|duration/i.test(line))).toBe(true);
    expect(issues.every((line) => !/complete option/i.test(line))).toBe(true);
  });
});
