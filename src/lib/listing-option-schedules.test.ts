import { describe, expect, it } from 'vitest';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { normalizeListingBookingOption } from '../types/listingExtras';
import { quoteBooking } from './booking-quote';
import type { TourPackage } from '../types/tour';
import {
  applyScheduleToOption,
  blankOptionSchedule,
  duplicateOptionSchedule,
  findScheduleOverlap,
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  resolveScheduleForDate,
  scheduleAppliesOnDate,
  scheduleOverlapMessage,
  scheduleWizardIsComplete,
  tourSellingDeparturesOnDate,
  upsertOptionSchedule,
} from './listing-option-schedules';
import { optionScheduleManagementIssues, scheduleCanSaveReady } from './listing-schedule-wizard';
import { defaultAgeDependentCategories } from './price-categories';

const daily = [true, true, true, true, true, true, true];

function option(partial: Partial<ListingBookingOption> = {}): ListingBookingOption {
  return normalizeListingBookingOption(
    {
      id: 'opt-nl',
      name: 'Small Group Northern Lights',
      priceUsd: 0,
      startTime: '',
      duration: '6 hours',
      pickupPlace: 'Rovaniemi city hotels',
      minPersons: 1,
      maxPersons: 8,
      maxSpotsPerSlot: 8,
      optionInfo: 'Pickup included',
      weekdays: daily,
      availabilityDateFrom: '',
      availabilityDateTo: '',
      pricingMode: 'uniform',
      ...partial,
    },
    'opt-nl'
  );
}

function season(partial: Partial<ListingOptionSchedule> & Pick<ListingOptionSchedule, 'id'>): ListingOptionSchedule {
  return {
    name: '',
    availabilityDateFrom: '',
    availabilityDateTo: '',
    weekdays: daily,
    startTime: '20:00',
    pricingMode: 'age_dependent',
    priceUsd: 119,
    priceCategories: defaultAgeDependentCategories(119, 89),
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    status: 'ready',
    ...partial,
  };
}

const september = season({
  id: 'sch-sep',
  name: 'September pricing',
  availabilityDateFrom: '2026-09-01',
  availabilityDateTo: '2026-09-30',
  startTime: '20:00',
  priceCategories: defaultAgeDependentCategories(119, 89),
  priceUsd: 119,
});

const october = season({
  id: 'sch-oct',
  name: 'October pricing',
  availabilityDateFrom: '2026-10-01',
  availabilityDateTo: '2026-10-31',
  startTime: '19:00',
  priceCategories: defaultAgeDependentCategories(149, 109),
  priceUsd: 149,
});

function tourWith(opt: ListingBookingOption): TourPackage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Northern Lights Tour',
    destination: 'Rovaniemi',
    duration: '6 hours',
    style: 'Tour',
    startLocation: 'Rovaniemi',
    endLocation: 'Rovaniemi',
    price: {
      startingFrom: 119,
      currency: 'EUR',
      perPerson: true,
      twinOccupancy: false,
      customQuote: false,
      singleSupplement: 0,
      validity: 'Seasonal',
    },
    category: '3*',
    tourType: 'cultural',
    validity: 'Seasonal',
    image: 'https://example.com/hero.jpg',
    description: 'Small-group aurora hunt with hotel pickup.',
    highlights: [],
    itinerary: [],
    includes: ['Guide'],
    excludes: ['Meals'],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '1-8 People',
    bestTime: 'Autumn',
    rating: 0,
    reviews: 0,
    isPopular: false,
    status: 'published',
    city: 'Rovaniemi',
    country: 'Finland',
    listingExtras: { bookingOptions: [opt] },
  };
}

describe('canonical schedule identity', () => {
  it('upserts the same schedule id instead of inserting another', () => {
    let row = option({ schedules: [] });
    row = upsertOptionSchedule(row, { ...september, status: 'draft' });
    row = upsertOptionSchedule(row, { ...september, status: 'ready', priceUsd: 119 });
    expect(row.schedules).toHaveLength(1);
    expect(row.schedules?.[0]?.id).toBe('sch-sep');
    expect(row.schedules?.[0]?.status).toBe('ready');
  });

  it('keeps one option when two seasonal schedules are saved', () => {
    let row = option({ schedules: [] });
    row = upsertOptionSchedule(row, september);
    row = upsertOptionSchedule(row, october);
    expect(row.id).toBe('opt-nl');
    expect(row.schedules?.map((s) => s.id)).toEqual(['sch-sep', 'sch-oct']);
  });
});

describe('seasonal coverage', () => {
  it('applies September through 30 Sep and October from 1 Oct', () => {
    expect(scheduleAppliesOnDate(september, '2026-09-15')).toBe(true);
    expect(scheduleAppliesOnDate(september, '2026-09-30')).toBe(true);
    expect(scheduleAppliesOnDate(september, '2026-10-01')).toBe(false);
    expect(scheduleAppliesOnDate(october, '2026-10-01')).toBe(true);
    expect(scheduleAppliesOnDate(october, '2026-10-15')).toBe(true);
    expect(scheduleAppliesOnDate(october, '2026-11-15')).toBe(false);
  });

  it('does not count draft schedules as ready', () => {
    const draft = { ...september, status: 'draft' as const };
    const row = option({ schedules: [draft] });
    expect(listingOptionReadySchedules(row)).toHaveLength(0);
    expect(optionScheduleManagementIssues(row)[0]).toMatch(/complete schedule/i);
  });
});

describe('overlap detection', () => {
  it('flags overlapping dates at the same departure time', () => {
    const overlapping = season({
      id: 'sch-overlap',
      name: 'Late September',
      availabilityDateFrom: '2026-09-20',
      availabilityDateTo: '2026-10-10',
      startTime: '20:00',
    });
    const conflict = findScheduleOverlap(overlapping, [september]);
    expect(conflict).not.toBeNull();
    expect(conflict?.from).toBe('2026-09-20');
    expect(conflict?.to).toBe('2026-09-30');
    expect(scheduleOverlapMessage(conflict!)).toContain('September pricing');
    expect(scheduleOverlapMessage(conflict!)).toContain('20:00');
  });

  it('allows adjacent seasons with the same start time when dates do not overlap', () => {
    const octSameTime = { ...october, startTime: '20:00' };
    expect(findScheduleOverlap(octSameTime, [september])).toBeNull();
    expect(
      scheduleCanSaveReady(octSameTime, option({ schedules: [september, octSameTime] })).ok
    ).toBe(true);
    expect(optionScheduleManagementIssues(option({ schedules: [september, octSameTime] }))).toEqual([]);
  });

  it('allows overlapping date windows when departure times differ', () => {
    expect(findScheduleOverlap(october, [september])).toBeNull();
  });

  it('allows the same dates at a different departure time', () => {
    const afternoon = { ...september, id: 'sch-14', startTime: '14:00', name: 'Afternoon' };
    expect(findScheduleOverlap(afternoon, [september])).toBeNull();
  });

  it('does not treat a draft duplicate as a ready overlap', () => {
    const copy = duplicateOptionSchedule(september, 'sch-copy');
    expect(copy.status).toBe('draft');
    expect(copy.id).toBe('sch-copy');
    expect(findScheduleOverlap(copy, [september])).toBeNull();
    const asReady = scheduleCanSaveReady({ ...copy, status: 'ready' }, option({ schedules: [september, copy] }));
    expect(asReady.ok).toBe(false);
    if (!asReady.ok) expect(asReady.error).toMatch(/overlaps/i);
  });
});

describe('traveler quote schedule resolution', () => {
  const today = '2026-08-01';
  const opt = option({
    schedules: [september, october],
    pricingMode: 'age_dependent',
    priceCategories: defaultAgeDependentCategories(119, 89),
  });

  it('quotes September price on 30 Sep and October price on 1 Oct', () => {
    const sep = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-09-30',
      guests: 1,
      bookingOptionId: 'opt-nl',
      todayIso: today,
      participantMix: { [september.priceCategories![0].id]: 1 },
    });
    const oct = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-10-01',
      guests: 1,
      bookingOptionId: 'opt-nl',
      todayIso: today,
      participantMix: { [october.priceCategories![0].id]: 1 },
    });
    expect(sep.ok).toBe(true);
    expect(oct.ok).toBe(true);
    if (sep.ok) expect(sep.totalAmount).toBe(119);
    if (oct.ok) expect(oct.totalAmount).toBe(149);
    expect(resolveScheduleForDate(opt, '2026-09-30')?.id).toBe('sch-sep');
    expect(resolveScheduleForDate(opt, '2026-10-01')?.id).toBe('sch-oct');
  });

  it('does not offer the option outside every schedule', () => {
    const q = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-11-15',
      guests: 2,
      bookingOptionId: 'opt-nl',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('season');
  });

  it('applies the resolved schedule onto the option for mixed adult/child parties', () => {
    const applied = applyScheduleToOption(opt, october);
    expect(applied.startTime).toBe('19:00');
    expect(applied.priceUsd).toBe(149);
    const childId = october.priceCategories!.find((c) => c.kind === 'child')!.id;
    const adultId = october.priceCategories!.find((c) => c.kind === 'adult')!.id;
    const q = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-10-15',
      guests: 3,
      bookingOptionId: 'opt-nl',
      todayIso: today,
      participantMix: { [adultId]: 2, [childId]: 1 },
    });
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.totalAmount).toBe(149 * 2 + 109);
  });
});

describe('wizard completeness', () => {
  it('requires dates, days, time, price, and capacity before a schedule is complete', () => {
    const blank = blankOptionSchedule('sch-new');
    expect(scheduleWizardIsComplete(blank)).toBe(false);
    expect(scheduleWizardIsComplete(september)).toBe(true);
  });

  it('does not treat an empty schedule list as a ready option', () => {
    expect(optionScheduleManagementIssues(option({ schedules: [] }))[0]).toMatch(/complete schedule/i);
    expect(listingOptionHasSchedules(option({ schedules: [] }))).toBe(false);
  });
});

describe('tourSellingDeparturesOnDate', () => {
  it('lists ready schedule departures for the partner calendar day sheet', () => {
    const opt = option({ schedules: [september, october] });
    const sep = tourSellingDeparturesOnDate([opt], '2026-09-15');
    expect(sep).toHaveLength(1);
    expect(sep[0]?.startTime).toBe('20:00');
    expect(sep[0]?.maxSpotsPerSlot).toBe(8);
    expect(sep[0]?.scheduleName).toMatch(/September/i);

    const oct = tourSellingDeparturesOnDate([opt], '2026-10-15');
    expect(oct).toHaveLength(1);
    expect(oct[0]?.startTime).toBe('19:00');
    expect(tourSellingDeparturesOnDate([opt], '2026-11-15')).toEqual([]);
  });
});
