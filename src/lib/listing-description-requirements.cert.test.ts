import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MIN_LISTING_DESCRIPTION_LENGTH,
  MIN_SHORT_DESCRIPTION_LENGTH,
  fullDescriptionContinueMessage,
  isListingDescriptionLengthValid,
  isShortDescriptionLengthValid,
  shortDescriptionContinueMessage,
} from './listingQualityScore';
import { isTourIdentitySatisfied } from './listing-creation-scenes';
import { getListingPublishBlockers } from './listingPublishGate';
import {
  RENTAL_SHORT_INTRO_MAX,
  rentalPublishBlockers,
  rentalStageBlocker,
  type RentalOnboardingCheck,
} from './rental-onboarding';
import { emptyRentalDetails } from './rental-details';
import { stayStageBlocker, type StayOnboardingCheck } from './stay-onboarding';

function pad(n: number, ch = 'a'): string {
  return ch.repeat(n);
}

function rentalCheck(overrides: Partial<RentalOnboardingCheck> = {}): RentalOnboardingCheck {
  return {
    title: 'Arctic Fatbike Day Hire',
    subtitle: pad(MIN_SHORT_DESCRIPTION_LENGTH),
    description: pad(MIN_LISTING_DESCRIPTION_LENGTH),
    highlights: ['Helmet included'],
    galleryCount: 3,
    city: 'Rovaniemi',
    country: 'Finland',
    experienceLanguage: 'en',
    rental: {
      ...emptyRentalDetails(),
      category: 'bikes',
      itemType: 'fat_bike',
      shortIntro: pad(MIN_SHORT_DESCRIPTION_LENGTH),
      pickupAddress: 'Koskikatu 1, Rovaniemi',
      returnSameAsPickup: true,
      staffAssisted: true,
      returnStaffAssisted: true,
      cancellationPreset: 'flexible_24h',
      operatingDays: [
        { day: 'mon', open: true, pickupFrom: '09:00', pickupTo: '17:00', returnFrom: '09:00', returnTo: '17:00' },
      ],
      variants: [{ id: 'opt-1', name: 'Standard', quantity: 4, pricingOverride: { pricePerDayMinor: 4500 } }],
    },
    ...overrides,
  };
}

function stayCheck(overrides: Partial<StayOnboardingCheck> = {}): StayOnboardingCheck {
  return {
    city: 'Rovaniemi',
    country: 'Finland',
    hasPlace: true,
    street: 'Koskikatu 1',
    postal: '96200',
    locationConfirmed: true,
    pinReady: true,
    title: 'Lake cabin stay',
    maxTitle: 65,
    subtitle: pad(MIN_SHORT_DESCRIPTION_LENGTH),
    maxSubtitle: 300,
    propertyType: 'cabin',
    areasWithBeds: 1,
    maxGuests: 4,
    minNights: 1,
    maxNights: 14,
    sleepCapacity: 4,
    nightly: 120,
    checkIn: '15:00',
    checkOut: '11:00',
    arrivalMethod: 'self_check_in',
    photoCount: 4,
    address: 'Koskikatu 1, Rovaniemi',
    rulesChosen: true,
    descriptionLength: MIN_LISTING_DESCRIPTION_LENGTH,
    minDescription: MIN_LISTING_DESCRIPTION_LENGTH,
    minTitle: 10,
    exteriorCamera: false,
    cameraLocation: '',
    safetyNote: '',
    ...overrides,
  };
}

describe('listing description requirements (tour / stay / rental)', () => {
  it('rejects 99-character short descriptions and accepts 100', () => {
    expect(isShortDescriptionLengthValid(pad(99))).toBe(false);
    expect(shortDescriptionContinueMessage(pad(99))).toMatch(/at least 100/i);
    expect(isShortDescriptionLengthValid(pad(100))).toBe(true);
    expect(shortDescriptionContinueMessage(pad(100))).toBeNull();
  });

  it('rejects 499-character full descriptions and accepts 500', () => {
    expect(isListingDescriptionLengthValid(pad(499))).toBe(false);
    expect(fullDescriptionContinueMessage(pad(499))).toMatch(/at least 500/i);
    expect(isListingDescriptionLengthValid(pad(500))).toBe(true);
    expect(fullDescriptionContinueMessage(pad(500))).toBeNull();
  });

  it('trims whitespace before counting', () => {
    expect(isShortDescriptionLengthValid(`  ${pad(99)}  `)).toBe(false);
    expect(isShortDescriptionLengthValid(`  ${pad(100)}  `)).toBe(true);
    expect(isListingDescriptionLengthValid(`\n${pad(499)}\n`)).toBe(false);
    expect(isListingDescriptionLengthValid(`\n${pad(500)}\n`)).toBe(true);
  });

  it('blocks tour identity Continue without a 100-character short description', () => {
    expect(
      isTourIdentitySatisfied({
        title: 'Northern Lights tour in Rovaniemi',
        subtitle: pad(99),
      })
    ).toBe(false);
    expect(
      isTourIdentitySatisfied({
        title: 'Northern Lights tour in Rovaniemi',
        subtitle: pad(100),
      })
    ).toBe(true);
  });

  it('blocks stay intro and description Continue at the shared floors', () => {
    expect(stayStageBlocker('property-intro', stayCheck({ subtitle: pad(99) }))).toMatch(/at least 100/i);
    expect(stayStageBlocker('property-intro', stayCheck({ subtitle: pad(100) }))).toBeNull();
    expect(
      stayStageBlocker('description', stayCheck({ descriptionLength: 499, minDescription: 500 }))
    ).toMatch(/at least 500/i);
    expect(
      stayStageBlocker('description', stayCheck({ descriptionLength: 500, minDescription: 500 }))
    ).toBeNull();
  });

  it('blocks rental intro and description Continue at the shared floors', () => {
    expect(
      rentalStageBlocker(
        'basics-title',
        rentalCheck({ subtitle: pad(99), rental: { ...rentalCheck().rental, shortIntro: pad(99) } })
      )
    ).toMatch(/at least 100/i);
    expect(rentalStageBlocker('basics-title', rentalCheck())).toBeNull();
    expect(rentalStageBlocker('basics-description', rentalCheck({ description: pad(499) }))).toMatch(
      /at least 500/i
    );
    expect(rentalStageBlocker('basics-description', rentalCheck())).toBeNull();
    expect(RENTAL_SHORT_INTRO_MAX).toBeGreaterThanOrEqual(MIN_SHORT_DESCRIPTION_LENGTH);
  });

  it('keeps incomplete rentals unpublished while drafts remain saveable', () => {
    const incomplete = rentalPublishBlockers(
      rentalCheck({
        description: pad(40),
        subtitle: pad(12),
        rental: { ...rentalCheck().rental, shortIntro: pad(12) },
      })
    );
    expect(incomplete.some((line) => /short description/i.test(line))).toBe(true);
    expect(incomplete.some((line) => /full description/i.test(line))).toBe(true);
    expect(rentalPublishBlockers(rentalCheck())).toEqual([]);
  });

  it('marks incomplete published listings as needing update without inventing blockers for complete ones', () => {
    const thin = getListingPublishBlockers({
      id: 't1',
      title: 'Northern Lights tour in Rovaniemi',
      subtitle: pad(50),
      description: pad(200),
      status: 'published',
      image: 'https://example.com/cover.jpg',
      city: 'Rovaniemi',
      country: 'Finland',
      price: { startingFrom: 120, currency: 'EUR' },
      listingExtras: {
        inventoryFamily: 'tour',
        bookingOptions: [
          {
            id: 'o1',
            name: 'Evening departure',
            duration: '3 hours',
            startTime: '20:00',
            minPersons: 1,
            maxPersons: 8,
            maxSpotsPerSlot: 8,
            pickupPlace: 'City hotel lobby',
            optionInfo: 'Small group tour',
            travelerStartInstructions: 'Wait outside the lobby doors.',
            weekdays: [true, true, true, true, true, true, true],
            priceCategories: [{ id: 'adult', label: 'Adult', price: 120 }],
          },
        ],
      },
    } as never);
    expect(thin.some((line) => /short description/i.test(line))).toBe(true);
    expect(thin.some((line) => /full description/i.test(line))).toBe(true);
  });

  it('SQL publish guard enforces description floors and leaves drafts writable', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20261114163400_listing_publish_description_minimums.sql'),
      'utf8'
    );
    expect(sql).toContain('char_length(v_short) < 100');
    expect(sql).toContain('char_length(v_description) < 500');
    expect(sql).toContain("if new.status = 'published'");
    expect(sql).toMatch(/Drafts stay writable|draft/i);
  });
});
