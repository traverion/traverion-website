import { describe, expect, it } from 'vitest';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { normalizeListingBookingOption } from '../types/listingExtras';
import { blankOptionSchedule } from './listing-option-schedules';
import { scheduleBlockedExplanation, tourOptionCardModel } from './listing-option-card';

const fmt = (n: number) => `€${n}`;

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

const configured = {
  name: 'Hotel pickup',
  duration: '6 hours',
  optionInfo: 'Pickup included',
  pickupPlace: 'Rovaniemi city hotels',
  fulfillment: 'pickup' as const,
  travelerStartInstructions: 'Wait outside the hotel lobby 10 minutes early.',
  chargeModel: 'per_person' as const,
  startMode: 'fixed' as const,
};

function readySchedule(): ListingOptionSchedule {
  return {
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
    status: 'ready',
  };
}

describe('tourOptionCardModel', () => {
  it('shows Continue setup at Setup when name / charge model are missing', () => {
    const model = tourOptionCardModel(option({ name: 'Bus' }), fmt);
    expect(model.cta.kind).toBe('continue_setup');
    expect(model.cta.kind === 'continue_setup' && model.cta.sceneIndex).toBe(0);
    expect(model.rows.map((r) => r.id)).toEqual(['duration', 'pricing', 'meeting', 'availability']);
    expect(model.rows.every((r) => !r.ok)).toBe(true);
    expect(model.missingSummary).toContain('duration');
  });

  it('shows Continue setup at Meeting when setup is done but meeting is missing', () => {
    const model = tourOptionCardModel(option({ ...configured, pickupPlace: '', fulfillment: undefined }), fmt);
    expect(model.cta.kind).toBe('continue_setup');
    expect(model.cta.kind === 'continue_setup' && model.cta.sceneIndex).toBe(1);
    expect(model.rows.find((r) => r.id === 'duration')?.ok).toBe(true);
    expect(model.rows.find((r) => r.id === 'meeting')?.ok).toBe(false);
  });

  it('shows Add schedule when setup + meeting are complete but there is no schedule', () => {
    const model = tourOptionCardModel(option({ ...configured, schedules: [] }), fmt);
    expect(model.cta.kind).toBe('add_schedule');
    expect(model.cta.kind === 'add_schedule' && model.cta.sceneIndex).toBe(2);
    expect(model.rows.find((r) => r.id === 'meeting')?.ok).toBe(true);
    expect(model.rows.find((r) => r.id === 'availability')?.text).toMatch(/No schedule yet/);
    expect(model.missingSummary).toBe('Missing: pricing, schedule');
  });

  it('shows Finish schedule when only a draft schedule exists', () => {
    const draft = { ...readySchedule(), status: 'draft' as const };
    const model = tourOptionCardModel(option({ ...configured, schedules: [draft] }), fmt);
    expect(model.cta.kind).toBe('finish_schedule');
    expect(model.cta.kind === 'finish_schedule' && model.cta.scheduleId).toBe('sch-1');
    expect(model.draftSchedules).toBe(1);
  });

  it('has no primary CTA and all rows ok when a ready schedule exists', () => {
    const model = tourOptionCardModel(option({ ...configured, schedules: [readySchedule()] }), fmt);
    expect(model.cta.kind).toBe('none');
    expect(model.rows.every((r) => r.ok)).toBe(true);
    expect(model.missingSummary).toBeNull();
    expect(model.rows.find((r) => r.id === 'pricing')?.text).toContain('€149');
  });
});

describe('scheduleBlockedExplanation', () => {
  it('explains why schedules are blocked and includes each prerequisite', () => {
    expect(scheduleBlockedExplanation([])).toBeNull();
    const text = scheduleBlockedExplanation(['Choose pricing in Setup before adding a schedule.']) ?? '';
    expect(text).toContain('Schedules depend on');
    expect(text).toContain('Choose pricing in Setup');
  });
});
