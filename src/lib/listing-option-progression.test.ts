import { describe, expect, it } from 'vitest';
import type { ListingBookingOption } from '../types/listingExtras';
import { normalizeListingBookingOption } from '../types/listingExtras';
import {
  TOUR_OPTION_SCENES,
  canContinueTourOptionScene,
  canVisitTourOptionScene,
  isTourOptionSceneSatisfied,
  tourOptionContextNavItems,
  tourOptionLockedReason,
  tourOptionSceneContinueHint,
} from './listing-option-progression';
import {
  bookingOptionPricingSceneIssues,
  bookingOptionSetupIssues,
  getBookingOptionValidationMessages,
} from './listing-option-validation';
import { upsertBookingOption } from './listing-option-scenes';
import { deriveExperienceStartStyleFromOptions } from './listing-option-start-style';
import { blankOptionSchedule } from './listing-option-schedules';

function option(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return normalizeListingBookingOption(
    {
      id: 'opt-1',
      name: '',
      priceUsd: 0,
      startTime: '',
      duration: '',
      pickupPlace: '',
      minPersons: 1,
      maxPersons: 8,
      maxSpotsPerSlot: 8,
      optionInfo: '',
      weekdays: [true, true, true, true, true, false, false],
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform',
      ...partial,
    },
    'opt-1'
  );
}

const readySchedule = {
  ...blankOptionSchedule('sch-1'),
  name: 'Winter',
  availabilityDateFrom: '2099-01-01',
  availabilityDateTo: '2099-03-01',
  weekdays: [true, true, true, true, true, true, true],
  startTime: '20:00',
  priceUsd: 149,
  minPersons: 1,
  maxPersons: 8,
  maxSpotsPerSlot: 8,
  status: 'ready' as const,
};

const ready = option({
  name: 'Hotel pickup · 20:00',
  duration: '6 hours',
  optionInfo: 'Pickup included',
  pickupPlace: 'Rovaniemi city hotels',
  fulfillment: 'pickup',
  travelerStartInstructions: 'Wait outside the hotel lobby 10 minutes early.',
  transportMode: 'minivan',
  startTime: '20:00',
  chargeModel: 'per_person',
  startMode: 'fixed',
  priceUsd: 149,
  weekdays: [true, true, true, true, true, true, true],
  schedules: [readySchedule],
});

describe('tour option scenes', () => {
  it('uses five supplier-facing steps including booking settings', () => {
    expect(TOUR_OPTION_SCENES.map((s) => s.id)).toEqual([
      'setup',
      'meeting',
      'pricing',
      'availability',
      'booking_settings',
    ]);
  });
});

describe('new option forward gating', () => {
  it('locks Meeting until Setup is valid', () => {
    const blank = option({ schedules: [] });
    expect(isTourOptionSceneSatisfied(0, blank)).toBe(false);
    expect(canVisitTourOptionScene({ targetIndex: 1, isNewOption: true, option: blank })).toBe(false);
    expect(tourOptionLockedReason({ targetIndex: 1, option: blank })).toBe(
      'Add an option name to continue.'
    );
  });

  it('unlocks Meeting after Setup fields are valid (charge model not required yet)', () => {
    const setupDone = option({
      name: 'Hotel pickup',
      duration: '6 hours',
      optionInfo: 'Pickup included',
      startMode: 'fixed',
      schedules: [],
    });
    expect(bookingOptionSetupIssues(setupDone)).toEqual([]);
    expect(isTourOptionSceneSatisfied(0, setupDone)).toBe(true);
    expect(canVisitTourOptionScene({ targetIndex: 1, isNewOption: true, option: setupDone })).toBe(true);
    expect(canVisitTourOptionScene({ targetIndex: 2, isNewOption: true, option: setupDone })).toBe(false);
  });

  it('requires Pricing (charge model) before Availability', () => {
    const untilMeeting = option({
      name: 'Hotel pickup',
      duration: '6 hours',
      optionInfo: 'Pickup included',
      pickupPlace: 'Rovaniemi city hotels',
      fulfillment: 'pickup',
      travelerStartInstructions: 'Wait outside the hotel lobby 10 minutes early.',
  transportMode: 'minivan',
      startMode: 'fixed',
      schedules: [],
    });
    expect(isTourOptionSceneSatisfied(1, untilMeeting)).toBe(true);
    expect(isTourOptionSceneSatisfied(2, untilMeeting)).toBe(false);
    expect(bookingOptionPricingSceneIssues(untilMeeting)[0]).toMatch(/charge/i);
    expect(canVisitTourOptionScene({ targetIndex: 3, isNewOption: true, option: untilMeeting })).toBe(
      false
    );
  });

  it('requires travelers per start time on Pricing for schedule-based options', () => {
    const noCapacity = option({
      name: 'Hotel pickup',
      duration: '6 hours',
      optionInfo: 'Pickup included',
      pickupPlace: 'Rovaniemi city hotels',
      fulfillment: 'pickup',
      travelerStartInstructions: 'Wait outside the hotel lobby 10 minutes early.',
  transportMode: 'minivan',
      startMode: 'fixed',
      chargeModel: 'per_person',
      maxSpotsPerSlot: 0,
      schedules: [],
    });
    expect(isTourOptionSceneSatisfied(2, noCapacity)).toBe(false);
    expect(bookingOptionPricingSceneIssues(noCapacity)[0]).toMatch(/start time/i);
  });

  it('requires a ready schedule on Availability before Finish', () => {
    const untilPricing = option({
      name: 'Hotel pickup',
      duration: '6 hours',
      optionInfo: 'Pickup included',
      pickupPlace: 'Rovaniemi city hotels',
      fulfillment: 'pickup',
      travelerStartInstructions: 'Wait outside the hotel lobby 10 minutes early.',
  transportMode: 'minivan',
      startMode: 'fixed',
      chargeModel: 'per_person',
      maxSpotsPerSlot: 12,
      schedules: [],
    });
    expect(isTourOptionSceneSatisfied(2, untilPricing)).toBe(true);
    expect(isTourOptionSceneSatisfied(3, untilPricing)).toBe(false);
    expect(
      tourOptionSceneContinueHint({
        sceneIndex: 3,
        option: untilPricing,
        canContinue: canContinueTourOptionScene({ sceneIndex: 3, option: untilPricing }),
      })
    ).toMatch(/schedule/i);
  });

  it('lets existing options visit any scene even when earlier fields are incomplete', () => {
    expect(canVisitTourOptionScene({ targetIndex: 3, isNewOption: false, option: option() })).toBe(true);
  });

  it('marks locked vs complete on the option rail for a new option', () => {
    const items = tourOptionContextNavItems(0, { isNewOption: true, option: option({ schedules: [] }) });
    expect(items.map((item) => item.state)).toEqual([
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
  });
});

describe('legacy meeting without fulfillment', () => {
  it('accepts an existing 8+ character place without a fulfillment mode', () => {
    const legacy = option({
      name: 'Standard',
      duration: '5 hours',
      optionInfo: 'Meet at the gate',
      pickupPlace: 'Santa Claus Village gate',
      travelerStartInstructions: 'Arrive 15 minutes early at the main gate.',
      startTime: '20:00',
      priceUsd: 149,
      startMode: 'fixed',
    });
    expect(isTourOptionSceneSatisfied(1, legacy)).toBe(true);
  });
});

describe('deriveExperienceStartStyleFromOptions', () => {
  it('maps all pickup / all meeting / mixed fulfillments', () => {
    expect(
      deriveExperienceStartStyleFromOptions([
        option({ fulfillment: 'pickup' }),
        option({ fulfillment: 'pickup' }),
      ])
    ).toBe('operator_pickup');
    expect(
      deriveExperienceStartStyleFromOptions([option({ fulfillment: 'meeting_point' })])
    ).toBe('fixed_meeting_place');
    expect(
      deriveExperienceStartStyleFromOptions([
        option({ fulfillment: 'pickup' }),
        option({ fulfillment: 'meeting_point' }),
      ])
    ).toBe('either_available');
    expect(deriveExperienceStartStyleFromOptions([option()])).toBe('unspecified');
  });
});

describe('canonical option identity', () => {
  it('keeps one option when availability configuration is saved twice', () => {
    const first = option({ id: 'opt-canonical', name: 'Hotel pickup' });
    const afterAvailability = option({
      id: 'opt-canonical',
      name: 'Hotel pickup',
      startTime: '20:00',
      weekdays: [true, true, true, true, true, true, true],
    });
    const rows = upsertBookingOption(upsertBookingOption([], first), afterAvailability);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('opt-canonical');
    expect(rows[0]?.startTime).toBe('20:00');
  });
});

describe('validation copy', () => {
  it('names the first missing Setup field instead of a generic form error', () => {
    expect(getBookingOptionValidationMessages(option({ schedules: [] }))[0]).toBe(
      'Add an option name to continue.'
    );
  });

  it('treats a fully specified schedule-based option as valid', () => {
    expect(getBookingOptionValidationMessages(ready)).toEqual([]);
    expect(isTourOptionSceneSatisfied(3, ready)).toBe(true);
  });

  it('round-trips fulfillment through listing extras without a schema migration', () => {
    const parsed = normalizeListingBookingOption(
      {
        ...ready,
        fulfillment: 'pickup',
      } as unknown as Record<string, unknown>,
      ready.id
    );
    expect(parsed.fulfillment).toBe('pickup');
    expect(parsed.id).toBe(ready.id);
  });
});
