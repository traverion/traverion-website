import { describe, expect, it } from 'vitest';
import { rentalFromPrice, rentalReturnPoint } from './rental-presentation';
import {
  clearRentalDepositAmounts,
  createDefaultRentalVariant,
  applyRentalDayHoursToDays,
  applyRentalStandardHours,
  copyRentalDayHours,
  defaultRentalOperatingDays,
  rentalHourExceptions,
  rentalStandardHours,
  resetRentalHourOverrides,
  setRentalDayHours,
  toggleRentalOperatingDay,
  effectiveVariantPricing,
  emptyRentalDetails,
  ensureRentalHasDefaultVariant,
  groupRentalOperatingHours,
  applyRentalAddressSelection,
  applyRentalCollectionPin,
  normalizeRentalDetails,
  rentalIllustrativeTotalMinor,
  rentalHasDepositInfo,
  rentalCustomerSkillSuitability,
  rentalOperatingHoursIssue,
  rentalSkillConflictsDifficulty,
  rentalStartingFromMajor,
  rentalVariantComplete,
  rentalVariantMetaLine,
  upsertRentalVariant,
} from './rental-details';
import { rentalCategoryConfig, rentalHighlightSuggestions } from './rental-categories';
import { RENTAL_OPTION_STEPS } from '../components/supplier/listing-creation/RentalOptionEditor';
import {
  LEGACY_RENTAL_SCREEN_ALIASES,
  RENTAL_ONBOARDING_SCREENS,
  resolveRentalScreenId,
  rentalPublishBlockers,
  rentalScreenIndex,
  rentalScreenIndexForPublishLine,
  rentalStageBlocker,
} from './rental-onboarding';
import type { RentalDetails } from '../types/rental';

describe('rental details', () => {
  it('assigns stable ids when normalizing variants without ids', () => {
    const normalized = normalizeRentalDetails({
      category: 'winter_clothing',
      variants: [{ name: 'Size M', quantity: 12 }],
    });
    expect(normalized?.variants?.[0]?.id).toMatch(/\S{8,}/);
    expect(normalized?.variants?.[0]?.name).toBe('Size M');
    expect(normalized?.variants?.[0]?.quantity).toBe(12);
  });

  it('preserves variant ids across normalize rounds', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const once = normalizeRentalDetails({
      category: 'bikes',
      variants: [{ id, name: 'Electric', quantity: 5 }],
    });
    const twice = normalizeRentalDetails(once);
    expect(twice?.variants?.[0]?.id).toBe(id);
  });

  it('inherits shared pricing unless override is set', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'both',
      sharedPricing: { pricePerDayMinor: 3000, pricePerHourMinor: 800 },
      variants: [
        { id: 'a', name: 'Standard', quantity: 2, pricingOverride: null },
        {
          id: 'b',
          name: 'Premium',
          quantity: 1,
          pricingOverride: { pricePerDayMinor: 4500 },
        },
      ],
    };
    expect(effectiveVariantPricing(rental, rental.variants![0])).toEqual({
      pricePerDayMinor: 3000,
      pricePerHourMinor: 800,
    });
    expect(effectiveVariantPricing(rental, rental.variants![1]).pricePerDayMinor).toBe(4500);
  });

  it('copies an inherited day price onto options that do not have one', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const normalized = normalizeRentalDetails({
      sharedPricing: { pricePerDayMinor: 3000, pricePerHourMinor: 800 },
      variants: [
        { id, name: 'Standard', quantity: 2, pricingOverride: null },
        { id: 'b', name: 'Premium', quantity: 1, pricingOverride: { pricePerDayMinor: 4500, pricePerHourMinor: 900 } },
        { id: 'c', name: 'Hourly', quantity: 1, pricingOverride: { pricePerHourMinor: 700 } },
      ],
    });
    expect(normalized?.variants?.[0]?.id).toBe(id);
    expect(normalized?.variants?.[0]?.quantity).toBe(2);
    expect(normalized?.variants?.[0]?.pricingOverride?.pricePerDayMinor).toBe(3000);
    expect(normalized?.variants?.[0]?.pricingOverride?.pricePerHourMinor).toBe(800);
    expect(normalized?.variants?.[1]?.pricingOverride?.pricePerDayMinor).toBe(4500);
    expect(normalized?.variants?.[1]?.pricingOverride?.pricePerHourMinor).toBe(900);
    expect(normalized?.variants?.[2]?.pricingOverride?.pricePerDayMinor).toBe(3000);
    expect(normalized?.variants?.[2]?.pricingOverride?.pricePerHourMinor).toBe(700);
    const again = normalizeRentalDetails(normalized);
    expect(again?.variants?.[0]?.pricingOverride?.pricePerDayMinor).toBe(3000);
    expect(again?.variants?.[1]?.pricingOverride?.pricePerDayMinor).toBe(4500);
    expect(rentalStartingFromMajor(normalized!)).toBe(30);
  });

  it('does not invent a day price when the listing has none', () => {
    const normalized = normalizeRentalDetails({
      sharedPricing: { pricePerDayMinor: 0, pricePerHourMinor: 800 },
      variants: [{ id: 'a', name: 'A', quantity: 1, pricingOverride: null }],
    });
    expect(normalized?.variants?.[0]?.id).toBe('a');
    expect(normalized?.variants?.[0]?.pricingOverride?.pricePerHourMinor).toBe(800);
    expect(normalized?.variants?.[0]?.pricingOverride?.pricePerDayMinor).toBeUndefined();
    expect(rentalStartingFromMajor(normalized!)).toBe(0);
  });

  it('ensures a default variant without duplicating', () => {
    const empty = ensureRentalHasDefaultVariant(emptyRentalDetails());
    expect(empty.variants).toHaveLength(1);
    const again = ensureRentalHasDefaultVariant(empty);
    expect(again.variants).toHaveLength(1);
    expect(again.variants![0].id).toBe(empty.variants![0].id);
  });

  it('requires the rates for the listing duration mode', () => {
    const variant = { ...createDefaultRentalVariant('XL'), quantity: 6, pricingOverride: { pricePerHourMinor: 800, pricePerDayMinor: 2500 } };
    const hourly: RentalDetails = { ...emptyRentalDetails(), durationMode: 'hourly', variants: [{ ...variant, pricingOverride: { pricePerDayMinor: 2500 } }] };
    expect(rentalVariantComplete(hourly.variants![0], hourly)).toBe(false);
    hourly.variants![0].pricingOverride = { pricePerHourMinor: 800 };
    expect(rentalVariantComplete(hourly.variants![0], hourly)).toBe(true);
    const daily: RentalDetails = { ...emptyRentalDetails(), durationMode: 'daily', variants: [{ ...variant, pricingOverride: { pricePerHourMinor: 800 } }] };
    expect(rentalVariantComplete(daily.variants![0], daily)).toBe(false);
    daily.variants![0].pricingOverride = { pricePerHourMinor: 800, pricePerDayMinor: 2500 };
    expect(rentalVariantComplete(daily.variants![0], daily)).toBe(true);
    const both: RentalDetails = { ...emptyRentalDetails(), durationMode: 'both', variants: [{ ...variant, pricingOverride: { pricePerDayMinor: 2500 } }] };
    expect(rentalVariantComplete(both.variants![0], both)).toBe(false);
    both.variants![0].pricingOverride = { pricePerHourMinor: 800, pricePerDayMinor: 2500 };
    expect(rentalVariantComplete(both.variants![0], both)).toBe(true);
  });
});

describe('rental display helpers', () => {
  it('starts new listings with every operating day closed', () => {
    expect(defaultRentalOperatingDays().every((day) => day.open === false)).toBe(true);
    expect(emptyRentalDetails().operatingDays?.every((day) => day.open === false)).toBe(true);
  });

  it('groups identical operating hours across consecutive days', () => {
    const days = defaultRentalOperatingDays().map((d) => ({
      ...d,
      open: d.day !== 'sun',
      earliestPickupHm: '09:00',
      latestPickupHm: '17:00',
      earliestReturnHm: '09:00',
      latestReturnHm: '18:00',
    }));
    const lines = groupRentalOperatingHours(days);
    expect(lines.some((l) => l.startsWith('Mon–Sat:'))).toBe(true);
    expect(lines).toHaveLength(1);
  });

  it('keeps a saved mixed schedule and only updates days that still use the standard window', () => {
    const saved = defaultRentalOperatingDays().map((day) =>
      day.day === 'sat'
        ? { ...day, open: true, earliestPickupHm: '10:00', latestPickupHm: '14:00', earliestReturnHm: '10:00', latestReturnHm: '15:00' }
        : day.day === 'sun'
          ? { ...day, open: false, earliestPickupHm: '12:00', latestPickupHm: '16:00' }
          : { ...day, open: true },
    );
    expect(rentalStandardHours(saved)).toMatchObject({ earliestPickupHm: '09:00', latestPickupHm: '17:00' });
    expect(rentalHourExceptions(saved).map((day) => day.day)).toEqual(['sat']);
    const next = applyRentalStandardHours(saved, {
      earliestPickupHm: '08:00',
      latestPickupHm: '16:00',
      earliestReturnHm: '08:00',
      latestReturnHm: '17:00',
    });
    expect(next.find((day) => day.day === 'mon')?.earliestPickupHm).toBe('08:00');
    expect(next.find((day) => day.day === 'sat')?.earliestPickupHm).toBe('10:00');
    expect(next.find((day) => day.day === 'sun')).toMatchObject({ open: false, earliestPickupHm: '12:00' });
    const opened = toggleRentalOperatingDay(next, 'sun');
    expect(opened.find((day) => day.day === 'sun')).toMatchObject({ open: true, earliestPickupHm: '08:00' });
    const copied = copyRentalDayHours(opened, 'sat', 'fri');
    expect(copied.find((day) => day.day === 'fri')?.latestPickupHm).toBe('14:00');
    const applied = applyRentalDayHoursToDays(copied, 'sat', ['thu']);
    expect(applied.find((day) => day.day === 'thu')?.latestPickupHm).toBe('14:00');
    const custom = setRentalDayHours(applied, 'mon', {
      earliestPickupHm: '11:00',
      latestPickupHm: '13:00',
      earliestReturnHm: '11:00',
      latestReturnHm: '14:00',
    });
    const reset = resetRentalHourOverrides(custom);
    expect(rentalHourExceptions(reset)).toEqual([]);
    expect(reset.find((day) => day.day === 'sun')?.open).toBe(true);
    expect(reset.find((day) => day.day === 'mon')?.earliestPickupHm).toBe('08:00');
  });

  it('omits attributes already present in the option name', () => {
    const line = rentalVariantMetaLine(
      { id: '1', name: 'Size M', quantity: 12, attributes: { size: 'M' } },
      [{ key: 'size', label: 'Size' }]
    );
    expect(line).toBe('12 units');
    expect(line).not.toMatch(/\bM\b/);
  });
});

describe('rental pricing derivation', () => {
  it('derives startingFrom from lowest daily variant rate (major units)', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'daily',
      sharedPricing: { pricePerDayMinor: 2000 },
      variants: [
        { id: 'a', name: 'S', quantity: 1 },
        { id: 'b', name: 'XL', quantity: 1, pricingOverride: { pricePerDayMinor: 2500 } },
      ],
    };
    expect(rentalStartingFromMajor(rental)).toBe(20);
  });

  it('uses the lowest option day price and ignores a cheaper hourly rate', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'both',
      sharedPricing: { pricePerHourMinor: 500, pricePerDayMinor: 4000 },
      variants: [
        { id: 'a', name: 'Standard', quantity: 1 },
        { id: 'b', name: 'Premium', quantity: 1, pricingOverride: { pricePerDayMinor: 3000 } },
      ],
    };
    expect(rentalStartingFromMajor(rental)).toBe(30);
    expect(rentalFromPrice(rental)?.label).toBe('€30 / day');
  });

  it('uses the lowest hourly option rate when the listing is hourly', () => {
    const rental: RentalDetails = {
      ...emptyRentalDetails(),
      durationMode: 'hourly',
      sharedPricing: { pricePerHourMinor: 800 },
      variants: [
        { id: 'a', name: 'A', quantity: 1, pricingOverride: { pricePerHourMinor: 900 } },
        { id: 'b', name: 'B', quantity: 1, pricingOverride: { pricePerHourMinor: 800 } },
      ],
    };
    expect(rentalStartingFromMajor(rental)).toBe(8);
    expect(rentalFromPrice(rental)?.label).toBe('€8 / hour');
  });

  it('keeps duration limits and option rates, and does not store 24-hour counting', () => {
    const normalized = normalizeRentalDetails({
      durationMode: 'both',
      minDurationHours: 2,
      maxDurationHours: 6,
      minDurationDays: 1,
      maxDurationDays: 10,
      calendarDayRentals: false,
      sharedPricing: { pricePerHourMinor: 800, pricePerDayMinor: 3000 },
      variants: [{ id: 'a', name: 'A', quantity: 1, pricingOverride: { pricePerHourMinor: 900 } }],
    });
    expect(normalized?.calendarDayRentals).toBe(true);
    expect(normalized?.minDurationHours).toBe(2);
    expect(normalized?.maxDurationHours).toBe(6);
    expect(normalized?.minDurationDays).toBe(1);
    expect(normalized?.maxDurationDays).toBe(10);
    expect(normalized?.variants?.[0]?.id).toBe('a');
    expect(normalized?.variants?.[0]?.pricingOverride?.pricePerHourMinor).toBe(900);
    expect(normalized?.variants?.[0]?.pricingOverride?.pricePerDayMinor).toBe(3000);
    const again = normalizeRentalDetails(normalized);
    expect(again?.variants?.[0]?.pricingOverride?.pricePerHourMinor).toBe(900);
    expect(again?.maxDurationHours).toBe(6);
    const base = {
      title: '',
      description: '',
      city: '',
      country: '',
      galleryCount: 0,
      experienceLanguage: 'en',
    };
    expect(
      rentalStageBlocker('duration', {
        ...base,
        rental: { ...emptyRentalDetails(), durationMode: 'hourly', minDurationHours: 4, maxDurationHours: 2 },
      }),
    ).toMatch(/Maximum hours/);
    expect(
      rentalStageBlocker('duration', {
        ...base,
        rental: { ...emptyRentalDetails(), durationMode: 'daily', minDurationDays: 1, maxDurationDays: 7 },
      }),
    ).toBeNull();
    expect(
      rentalStageBlocker('duration', {
        ...base,
        rental: { ...emptyRentalDetails(), durationMode: 'hourly', minDurationHours: 1, maxDurationHours: 8 },
      }),
    ).toBeNull();
    expect(
      rentalStageBlocker('options', {
        ...base,
        rental: {
          ...emptyRentalDetails(),
          durationMode: 'both',
          variants: [{ id: 'a', name: 'A', quantity: 1, pricingOverride: { pricePerDayMinor: 2000 } }],
        },
      }),
    ).toMatch(/name, quantity, and pricing|price per hour and a price per day/i);
    expect(
      rentalStageBlocker('options', {
        ...base,
        rental: {
          ...emptyRentalDetails(),
          durationMode: 'both',
          variants: [
            {
              id: 'ready',
              name: 'Ready',
              quantity: 1,
              pricingOverride: { pricePerHourMinor: 800, pricePerDayMinor: 2000 },
            },
            { id: 'a', name: 'A', quantity: 1, pricingOverride: { pricePerDayMinor: 2000 } },
          ],
        },
      }),
    ).toMatch(/price per hour and a price per day/);
  });

  it('applies multi-day discount on illustrative totals only for daily mode', () => {
    expect(
      rentalIllustrativeTotalMinor({
        unitMinor: 2000,
        units: 2,
        durationCount: 3,
        mode: 'day',
        multiDayDiscountPercent: 10,
        multiDayDiscountMinDays: 3,
      })
    ).toBe(10800);
    expect(
      rentalIllustrativeTotalMinor({
        unitMinor: 800,
        units: 1,
        durationCount: 5,
        mode: 'hour',
        multiDayDiscountPercent: 10,
        multiDayDiscountMinDays: 3,
      })
    ).toBe(4000);
  });

  it('keeps deposit amounts when no deposit is selected so they can be restored', () => {
    const cleared = clearRentalDepositAmounts();
    expect(cleared.depositRequired).toBe(false);
    expect(cleared.depositAmountMinor).toBeUndefined();
    const normalized = normalizeRentalDetails({
      depositRequired: false,
      depositAmountMinor: 5000,
      depositCollectionMethod: 'cash_at_pickup',
      depositCurrency: 'EUR',
      depositDisclosure: 'Bring cash',
      accessibilityStatus: 'details_provided',
      accessibilityFeatures: ['Step-free pickup access'],
      difficulty: 'not_applicable',
      restrictions: ['No subletting'],
      suitableFor: 'Adults who can ride',
    });
    expect(normalized?.depositAmountMinor).toBe(5000);
    expect(normalized?.depositCollectionMethod).toBe('cash_at_pickup');
    expect(normalized?.depositDisclosure).toBe('Bring cash');
    expect(normalized?.accessibilityFeatures).toEqual(['Step-free pickup access']);
    expect(normalized?.difficulty).toBe('not_applicable');
    expect(normalized?.restrictions).toEqual(['No subletting']);
    expect(rentalHasDepositInfo(normalized!)).toBe(true);
  });

  it('flags invalid pickup windows', () => {
    const days = defaultRentalOperatingDays().map((d) => ({
      ...d,
      open: d.day === 'mon',
      earliestPickupHm: '17:00',
      latestPickupHm: '09:00',
    }));
    expect(rentalOperatingHoursIssue(days)).toMatch(/Pickup/i);
  });
});

describe('skill suitability', () => {
  it('lifts the old specification into one guest field and hides contradictions', () => {
    const normalized = normalizeRentalDetails({
      category: 'skis_snowboards',
      difficulty: 'moderate',
      specifications: { brand: 'Atomic', skillLevel: 'Beginner to intermediate' },
    });
    expect(normalized?.specifications?.skillLevel).toBeUndefined();
    expect(normalized?.specifications?.brand).toBe('Atomic');
    expect(normalized?.skillSuitability).toBe('Beginner to intermediate');
    expect(rentalCustomerSkillSuitability(normalized!)).toBe('Beginner to intermediate');
    expect(rentalSkillConflictsDifficulty('easy', 'Advanced riders')).toBe(true);
    expect(rentalCustomerSkillSuitability({ ...normalized!, difficulty: 'easy', skillSuitability: 'Advanced' })).toBeNull();
    expect(rentalCustomerSkillSuitability({ ...normalized!, difficulty: 'easy', skillSuitability: 'Easy' })).toBeNull();
  });
});

describe('legacy rental screen aliases', () => {
  it('maps retired 33-step and interim 26-step ids onto the 23-screen journey', () => {
    expect(RENTAL_ONBOARDING_SCREENS).toHaveLength(23);
    expect(resolveRentalScreenId('gallery')).toBe('photos');
    expect(resolveRentalScreenId('buffers')).toBe('booking-rules');
    expect(resolveRentalScreenId('availability-summary')).toBe('duration');
    expect(resolveRentalScreenId('basics-title')).toBe('basics-title');
    expect(resolveRentalScreenId('pickup-handover')).toBe('pickup-handover');
    expect(resolveRentalScreenId('return-handover')).toBe('return-handover');
    expect(resolveRentalScreenId('item-type')).toBe('basics-item');
    expect(resolveRentalScreenId('basics-item')).toBe('basics-item');
    expect(resolveRentalScreenId('daily-rules')).toBe('duration');
    expect(resolveRentalScreenId('daily-counting')).toBe('duration');
    expect(resolveRentalScreenId('collection')).toBe('pickup-handover');
    expect(resolveRentalScreenId('handover')).toBe('pickup-handover');
    expect(resolveRentalScreenId('highlights')).toBe('basics-highlights');
    expect(resolveRentalScreenId('basics-highlights')).toBe('basics-highlights');
    expect(resolveRentalScreenId('return-location')).toBe('return-location');
    expect(resolveRentalScreenId('return')).toBe('return-location');
    expect(resolveRentalScreenId('accessibility')).toBe('requirements');
    expect(resolveRentalScreenId('suitability')).toBe('requirements');
    expect(resolveRentalScreenId('restrictions')).toBe('inclusions');
    expect(resolveRentalScreenId('pricing')).toBe('options');
    expect(resolveRentalScreenId('multi-day')).toBe('options');
    expect(resolveRentalScreenId('earnings')).toBe('options');
    expect(RENTAL_ONBOARDING_SCREENS.some((screen) => screen.id === 'pricing')).toBe(false);
    expect(Object.keys(LEGACY_RENTAL_SCREEN_ALIASES).length).toBeGreaterThan(10);
  });

  it('keeps a seven-step Basics group with description and highlights separated', () => {
    const ids = RENTAL_ONBOARDING_SCREENS.filter((screen) => screen.group === 'Basics').map((screen) => screen.id);
    expect(ids).toEqual([
      'basics-category',
      'basics-item',
      'basics-location',
      'basics-title',
      'basics-description',
      'basics-highlights',
      'basics-specs',
    ]);
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('basics-description')].part).toBe('5 of 7');
    expect(RENTAL_ONBOARDING_SCREENS[rentalScreenIndex('basics-highlights')].part).toBe('6 of 7');
    const check = {
      title: 'Thermal overall rental',
      subtitle: 'Warm overalls for a day outside.',
      description: 'Short',
      highlights: ['Several sizes'],
      galleryCount: 3,
      city: 'Rovaniemi',
      country: 'Finland',
      experienceLanguage: 'en',
      rental: emptyRentalDetails(),
    };
    expect(rentalStageBlocker('basics-description', check)).toMatch(/40/);
    expect(
      rentalStageBlocker('basics-description', {
        ...check,
        description: 'Warm thermal overalls for Arctic conditions, sized for a full day outside.',
      })
    ).toBeNull();
    expect(rentalStageBlocker('basics-highlights', { ...check, highlights: [] })).toBeNull();
    expect(rentalScreenIndexForPublishLine('Add a highlight')).toBe(rentalScreenIndex('basics-highlights'));
    expect(rentalHighlightSuggestions('bikes')).toContain('Helmet included');
    expect(rentalHighlightSuggestions('cameras_electronics')).toContain('Battery included');
    expect(rentalHighlightSuggestions('bikes').join(' ')).not.toMatch(/family friendly/i);
    expect(rentalHighlightSuggestions(undefined)).toEqual([]);
  });
});

describe('rental collection points', () => {
  it('keeps a saved address when coordinates are missing or invalid', () => {
    const rental = normalizeRentalDetails({
      pickupAddress: '  Rovaniemi depot, Main Street 1  ',
      pickupInstructions: 'Blue door by the sauna',
      pickupLat: '66.5',
      pickupLng: Number.NaN,
      returnAddress: 'Airport desk',
      returnSameAsPickup: false,
    });
    expect(rental.pickupAddress).toBe('Rovaniemi depot, Main Street 1');
    expect(rental.pickupInstructions).toBe('Blue door by the sauna');
    expect(rental.pickupLat).toBeUndefined();
    expect(rental.pickupLng).toBeUndefined();
    expect(rental.returnAddress).toBe('Airport desk');
    expect(rentalStageBlocker('pickup-location', { rental, title: '', description: '', city: '', country: '', galleryCount: 0, experienceLanguage: 'en' })).toBeNull();
    expect(rentalStageBlocker('return-location', { rental, title: '', description: '', city: '', country: '', galleryCount: 0, experienceLanguage: 'en' })).toBeNull();
    expect(
      rentalStageBlocker('return-location', {
        rental: { ...rental, returnAddress: '' },
        title: '',
        description: '',
        city: '',
        country: '',
        galleryCount: 0,
        experienceLanguage: 'en',
      })
    ).toMatch(/return address/i);
  });

  it('sets the address and pin together, then lets the marker move without rewriting the address', () => {
    const selected = applyRentalAddressSelection(emptyRentalDetails(), 'pickup', {
      address: 'Siljotie 2, 96900 Rovaniemi, Finland',
      lat: 66.5039,
      lng: 25.7294,
    });
    expect(selected.pickupAddress).toBe('Siljotie 2, 96900 Rovaniemi, Finland');
    expect(selected.pickupInstructions).toBeUndefined();
    const moved = applyRentalCollectionPin(selected, 'pickup', { lat: 66.5042, lng: 25.73 });
    expect(moved.pickupAddress).toBe(selected.pickupAddress);
    expect(moved.pickupLat).toBe(66.5042);
    expect(moved.pickupLng).toBe(25.73);
    expect(applyRentalCollectionPin(moved, 'pickup', { lat: 120, lng: 25 }).pickupLat).toBe(66.5042);

    const returned = applyRentalAddressSelection(
      { ...emptyRentalDetails(), returnInstructions: 'Leave it with the desk' },
      'return',
      { address: 'Rovaniemi Airport', lat: 66.5648, lng: 25.8304 },
    );
    expect(returned.returnSameAsPickup).toBe(false);
    expect(returned.returnAddress).toBe('Rovaniemi Airport');
    expect(returned.returnInstructions).toBe('Leave it with the desk');
    const returnMoved = applyRentalCollectionPin(returned, 'return', { lat: 66.565, lng: 25.831 });
    expect(returnMoved.returnAddress).toBe('Rovaniemi Airport');
    expect(returnMoved.returnLat).toBe(66.565);
  });

  it('keeps a separate return place when switching back to the pickup location', () => {
    const pickup = applyRentalAddressSelection(emptyRentalDetails(), 'pickup', {
      address: 'Siljotie 2, Rovaniemi',
      lat: 66.5,
      lng: 25.73,
    });
    const different = applyRentalAddressSelection(
      { ...pickup, returnInstructions: 'Side door' },
      'return',
      { address: 'Rovaniemi Airport', lat: 66.56, lng: 25.83 },
    );
    const same = { ...different, returnSameAsPickup: true };
    expect(same.returnAddress).toBe('Rovaniemi Airport');
    expect(same.returnLat).toBe(66.56);
    expect(same.returnInstructions).toBe('Side door');
    expect(rentalReturnPoint(same)).toMatchObject({
      sameAsPickup: true,
      address: 'Siljotie 2, Rovaniemi',
      lat: 66.5,
      lng: 25.73,
    });
    const again = { ...same, returnSameAsPickup: false };
    expect(rentalReturnPoint(again)).toMatchObject({
      sameAsPickup: false,
      address: 'Rovaniemi Airport',
      lat: 66.56,
      lng: 25.83,
    });
  });
});

describe('rental publish readiness', () => {
  it('requires category, photos, pickup, and at least one complete option', () => {
    const blockers = rentalPublishBlockers({
      title: '',
      description: '',
      city: '',
      country: '',
      galleryCount: 0,
      experienceLanguage: 'en',
      rental: emptyRentalDetails(),
    });
    expect(blockers.some((b) => /category/i.test(b))).toBe(true);
    expect(blockers.some((b) => /photo/i.test(b))).toBe(true);
    expect(blockers.some((b) => /pickup/i.test(b))).toBe(true);
  });

  it('accepts a thermal-overall style listing for creator completeness checks', () => {
    const rental = normalizeRentalDetails({
      category: 'winter_clothing',
      itemType: 'thermal_overall',
      durationMode: 'daily',
      pickupAddress: 'Rovaniemi depot, Main Street 1',
      staffAssisted: true,
      returnStaffAssisted: false,
      cancellationPreset: 'flexible_24h',
      sharedPricing: { pricePerDayMinor: 2000 },
      variants: [
        { id: 's', name: 'S', quantity: 8 },
        { id: 'm', name: 'M', quantity: 12 },
        { id: 'l', name: 'L', quantity: 10 },
        {
          id: 'xl',
          name: 'XL',
          quantity: 6,
          pricingOverride: { pricePerDayMinor: 2500 },
        },
      ],
    });
    expect(rental?.variants?.find((variant) => variant.id === 's')?.pricingOverride?.pricePerDayMinor).toBe(2000);
    expect(rental?.variants?.find((variant) => variant.id === 'xl')?.pricingOverride?.pricePerDayMinor).toBe(2500);
    const blockers = rentalPublishBlockers({
      title: 'Premium Thermal Overall Rental',
      description: 'Warm thermal overalls for Arctic conditions, sized S through XL.',
      city: 'Rovaniemi',
      country: 'Finland',
      galleryCount: 4,
      experienceLanguage: 'en',
      rental: rental!,
    });
    expect(blockers).toEqual([]);
    expect(rentalStartingFromMajor(rental!)).toBe(20);
  });
});

describe('rental option save', () => {
  it('keeps four option steps and category-specific fields', () => {
    expect(RENTAL_OPTION_STEPS).toEqual(['identity', 'inventory', 'pricing', 'review']);
    expect(rentalCategoryConfig('bikes')?.variantAttributeKeys.map((key) => key.key)).toEqual(['size', 'power']);
    expect(rentalCategoryConfig('winter_clothing')?.variantAttributeKeys.map((key) => key.key)).toEqual(['size']);
    expect(rentalCategoryConfig('skis_snowboards')?.variantAttributeKeys.map((key) => key.key)).toEqual(['length', 'bootSize']);
    expect(rentalCategoryConfig('cameras_electronics')?.variantAttributeKeys.map((key) => key.key)).toEqual(['kit']);
    expect(rentalCategoryConfig('vehicles')?.variantAttributeKeys.map((key) => key.key)).not.toContain('bootSize');
  });

  it('adds a new option and edits one without changing the others', () => {
    const medium = { id: 'm', name: 'Medium', quantity: 10, attributes: { size: 'M' } };
    const large = { id: 'l', name: 'Large', quantity: 4, pricingOverride: { pricePerDayMinor: 3000 } };
    const created = upsertRentalVariant([medium], large);
    expect(created.map((row) => row.id)).toEqual(['m', 'l']);
    const edited = upsertRentalVariant(created, { ...medium, quantity: 8, description: 'Adult frame' });
    expect(edited.find((row) => row.id === 'm')).toMatchObject({ quantity: 8, description: 'Adult frame' });
    expect(edited.find((row) => row.id === 'l')).toEqual(large);
  });
});
