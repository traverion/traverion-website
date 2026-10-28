/**
 * Notice/preparation Custom presets + guest-info screen split polish.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  evaluateRentalAvailability,
  occupiedWindowWithBuffer,
} from '../../../lib/rental-availability';
import {
  RENTAL_ONBOARDING_SCREENS,
  resolveRentalScreenId,
  rentalScreenIndex,
  rentalStageBlocker,
} from '../../../lib/rental-onboarding';
import { emptyRentalDetails } from '../../../lib/rental-details';

const here = dirname(fileURLToPath(import.meta.url));
const flowSrc = readFileSync(join(here, 'RentalOnboardingFlow.tsx'), 'utf8');

describe('rental booking rules and guest polish', () => {
  it('shows Custom only when selected for preparation and notice', () => {
    expect(flowSrc).toContain('function PresetNumber');
    expect(flowSrc).toContain('Custom');
    expect(flowSrc).toContain('showCustom');
    expect(flowSrc).toContain('customSelected');
    expect(flowSrc).toContain('Custom preparation time');
    expect(flowSrc).toContain('Custom notice');
    expect(flowSrc).toContain('rental-booking-rules');
    // Custom field is gated — not always rendered beside presets.
    expect(flowSrc).toMatch(/showCustom \? \([\s\S]*?StayField label=\{customLabel\}/);
  });

  it('splits guest requirements, accessibility, and suitability into separate screens', () => {
    expect(RENTAL_ONBOARDING_SCREENS).toHaveLength(23);
    expect(rentalScreenIndex('requirements')).toBeLessThan(rentalScreenIndex('accessibility'));
    expect(rentalScreenIndex('accessibility')).toBeLessThan(rentalScreenIndex('suitability'));
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('requirements')].title).toBe('Guest requirements');
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('accessibility')].title).toBe('Accessibility');
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('suitability')].title).toBe('Suitability');
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('requirements')].part).toBe('1 of 7');
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('deposit-info')].part).toBe('7 of 7');

    expect(flowSrc).toMatch(/case 'requirements':\s*body = <RequirementsStage/);
    expect(flowSrc).toMatch(/case 'accessibility':\s*body = <AccessibilityStage/);
    expect(flowSrc).toMatch(/case 'suitability':\s*body = <SuitabilityStage/);
    expect(flowSrc).not.toMatch(
      /case 'requirements':\s*body = \(\s*<div className="space-y-8">\s*<RequirementsStage/,
    );

    expect(resolveRentalScreenId('accessibility')).toBe('accessibility');
    expect(resolveRentalScreenId('suitability')).toBe('suitability');
    expect(resolveRentalScreenId('who-can-book')).toBe('requirements');
  });

  it('keeps vehicle licence validation on guest requirements only', () => {
    const base = {
      title: 'Snowmobile day',
      subtitle: 'Guided ready machines.',
      description: 'A full day snowmobile rental with briefing at pickup for winter trails.',
      galleryCount: 3,
      city: 'Rovaniemi',
      country: 'Finland',
      experienceLanguage: 'en',
      rental: {
        ...emptyRentalDetails(),
        category: 'snowmobiles' as const,
        itemType: 'snowmobile',
        cancellationPreset: 'flexible' as const,
      },
    };
    expect(rentalStageBlocker('requirements', base)).toMatch(/licence|driver/i);
    expect(rentalStageBlocker('accessibility', base)).toBeNull();
    expect(rentalStageBlocker('suitability', base)).toBeNull();
    expect(
      rentalStageBlocker('requirements', {
        ...base,
        rental: {
          ...base.rental,
          requirements: { license: 'Valid A or B licence' },
        },
      }),
    ).toBeNull();
  });

  it('enforces booking notice and preparation buffer against overlapping inventory', () => {
    const now = Date.parse('2026-12-01T08:00:00Z');
    const late = evaluateRentalAvailability({
      variantId: 'v1',
      stock: 2,
      requestedQty: 1,
      pickupReturn: { startMs: now + 30 * 60_000, endMs: now + 4 * 3_600_000 },
      bufferMinutes: 0,
      bookingNoticeHours: 2,
      nowMs: now,
      blocks: [],
      occupancies: [],
    });
    expect(late.ok).toBe(false);

    const enoughNotice = evaluateRentalAvailability({
      variantId: 'v1',
      stock: 2,
      requestedQty: 1,
      pickupReturn: { startMs: now + 3 * 3_600_000, endMs: now + 6 * 3_600_000 },
      bufferMinutes: 0,
      bookingNoticeHours: 2,
      nowMs: now,
      blocks: [],
      occupancies: [],
    });
    expect(enoughNotice.ok).toBe(true);

    const holdEnd = Date.parse('2026-12-01T14:00:00Z');
    const buffered = occupiedWindowWithBuffer({ startMs: Date.parse('2026-12-01T09:00:00Z'), endMs: holdEnd }, 90);
    expect(buffered.endMs).toBe(holdEnd + 90 * 60_000);

    const blockedByPrep = evaluateRentalAvailability({
      variantId: 'v1',
      stock: 1,
      requestedQty: 1,
      pickupReturn: {
        startMs: holdEnd + 30 * 60_000,
        endMs: holdEnd + 3 * 3_600_000,
      },
      bufferMinutes: 90,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [
        {
          variantId: 'v1',
          quantity: 1,
          // Occupancy already includes preparation after return.
          interval: buffered,
        },
      ],
    });
    expect(blockedByPrep.ok).toBe(false);
    expect(blockedByPrep.available).toBe(0);

    const afterPrep = evaluateRentalAvailability({
      variantId: 'v1',
      stock: 1,
      requestedQty: 1,
      pickupReturn: {
        startMs: buffered.endMs,
        endMs: buffered.endMs + 2 * 3_600_000,
      },
      bufferMinutes: 90,
      bookingNoticeHours: 0,
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
      blocks: [],
      occupancies: [
        {
          variantId: 'v1',
          quantity: 1,
          interval: buffered,
        },
      ],
    });
    expect(afterPrep.ok).toBe(true);
  });
});
