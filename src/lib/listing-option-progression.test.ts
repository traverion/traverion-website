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
import { getBookingOptionValidationMessages } from './listing-option-validation';
import { upsertBookingOption } from './listing-option-scenes';

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

const ready = option({
  name: 'Hotel pickup · 20:00',
  duration: '6 hours',
  optionInfo: 'Pickup included',
  pickupPlace: 'Rovaniemi city hotels',
  fulfillment: 'pickup',
  startTime: '20:00',
  priceUsd: 149,
  weekdays: [true, true, true, true, true, true, true],
});

describe('tour option scenes', () => {
  it('uses four supplier-facing steps with availability and pricing together', () => {
    expect(TOUR_OPTION_SCENES.map((s) => s.id)).toEqual([
      'setup',
      'meeting',
      'availability_pricing',
      'review',
    ]);
  });
});

describe('new option forward gating', () => {
  it('locks Meeting until Setup is valid', () => {
    const blank = option();
    expect(isTourOptionSceneSatisfied(0, blank)).toBe(false);
    expect(canVisitTourOptionScene({ targetIndex: 1, isNewOption: true, option: blank })).toBe(false);
    expect(
      tourOptionLockedReason({ targetIndex: 1, option: blank })
    ).toBe('Add an option name to continue.');
  });

  it('unlocks Meeting after Setup fields are valid', () => {
    const setupDone = option({
      name: 'Hotel pickup',
      duration: '6 hours',
      optionInfo: 'Pickup included',
    });
    expect(isTourOptionSceneSatisfied(0, setupDone)).toBe(true);
    expect(canVisitTourOptionScene({ targetIndex: 1, isNewOption: true, option: setupDone })).toBe(true);
    expect(canVisitTourOptionScene({ targetIndex: 2, isNewOption: true, option: setupDone })).toBe(false);
  });

  it('requires a ready availability and pricing block before Review', () => {
    const untilMeeting = option({
      name: 'Hotel pickup',
      duration: '6 hours',
      optionInfo: 'Pickup included',
      pickupPlace: 'Rovaniemi city hotels',
      fulfillment: 'pickup',
    });
    expect(isTourOptionSceneSatisfied(1, untilMeeting)).toBe(true);
    expect(isTourOptionSceneSatisfied(2, untilMeeting)).toBe(false);
    expect(canVisitTourOptionScene({ targetIndex: 3, isNewOption: true, option: untilMeeting })).toBe(
      false
    );
    expect(
      tourOptionSceneContinueHint({
        sceneIndex: 2,
        option: untilMeeting,
        canContinue: canContinueTourOptionScene({ sceneIndex: 2, option: untilMeeting }),
      })
    ).toBe('Add a start time so travelers know when this option begins.');
  });

  it('lets existing options visit any scene even when earlier fields are incomplete', () => {
    expect(canVisitTourOptionScene({ targetIndex: 3, isNewOption: false, option: option() })).toBe(true);
  });

  it('marks locked vs complete on the option rail for a new option', () => {
    const items = tourOptionContextNavItems(0, { isNewOption: true, option: option() });
    expect(items.map((item) => item.state)).toEqual(['current', 'locked', 'locked', 'locked']);
  });
});

describe('legacy meeting without fulfillment', () => {
  it('accepts an existing 8+ character place without a fulfillment mode', () => {
    const legacy = option({
      name: 'Standard',
      duration: '5 hours',
      optionInfo: 'Meet at the gate',
      pickupPlace: 'Santa Claus Village gate',
      startTime: '20:00',
      priceUsd: 149,
    });
    expect(isTourOptionSceneSatisfied(1, legacy)).toBe(true);
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
    expect(getBookingOptionValidationMessages(option())[0]).toBe('Add an option name to continue.');
  });

  it('treats a fully specified option as valid', () => {
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
