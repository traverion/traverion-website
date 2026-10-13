import { describe, expect, it } from 'vitest';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { normalizeListingBookingOption, normalizeListingOptionSchedule } from '../types/listingExtras';
import { quoteBooking } from './booking-quote';
import type { TourPackage } from '../types/tour';
import {
  applyScheduleToOption,
  blankOptionSchedule,
  duplicateOptionSchedule,
  LISTING_OPTION_SCHEDULES_MAX,
  departureTimesOnDate,
  findScheduleOverlap,
  formatScheduleDepartureSummary,
  listingOptionHasSchedules,
  listingOptionReadySchedules,
  maxWholeGroupsForSlot,
  resolveScheduleForDate,
  scheduleAppliesOnDate,
  scheduleCapacityValid,
  scheduleHasFixedDepartures,
  scheduleOverlapMessage,
  scheduleWizardIsComplete,
  syncScheduleDeparturesFromWeekdayTimes,
  optionCapacityForDepartureTime,
  tourSellingDeparturesOnDate,
  ensureExplicitSchedules,
  isImplicitScheduleId,
  upsertOptionSchedule,
} from './listing-option-schedules';
import {
  optionScheduleManagementIssues,
  scheduleCanSaveReady,
  scheduleCapacityCeilings,
  scheduleCapacityIssues,
} from './listing-schedule-wizard';
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
      chargeModel: 'per_person',
      startMode: 'fixed',
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

  it('Phase 1258: rejects when every ready schedule season has already ended', () => {
    const row = option({ schedules: [september] });
    expect(optionScheduleManagementIssues(row, '2026-10-15')[0]).toMatch(/already ended/i);
    expect(optionScheduleManagementIssues(row, '2026-09-15')).toEqual([]);
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
    const nowMs = Date.parse('2026-08-01T12:00:00Z');
    const sep = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-09-30',
      guests: 1,
      bookingOptionId: 'opt-nl',
      todayIso: today,
      nowMs,
      participantMix: { [september.priceCategories![0].id]: 1 },
    });
    const oct = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-10-01',
      guests: 1,
      bookingOptionId: 'opt-nl',
      todayIso: today,
      nowMs,
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

  it('refuses net-new schedule inserts beyond LISTING_OPTION_SCHEDULES_MAX', () => {
    let row = option({ schedules: [] });
    for (let i = 0; i < LISTING_OPTION_SCHEDULES_MAX; i++) {
      row = upsertOptionSchedule(row, {
        ...blankOptionSchedule(`sch-${i}`),
        name: `Season ${i}`,
        availabilityDateFrom: '2099-01-01',
        startTime: '10:00',
        priceUsd: 100,
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        status: 'draft',
      });
    }
    expect(row.schedules).toHaveLength(LISTING_OPTION_SCHEDULES_MAX);
    const blocked = upsertOptionSchedule(row, {
      ...blankOptionSchedule('sch-overflow'),
      name: 'Overflow',
      status: 'draft',
    });
    expect(blocked.schedules).toHaveLength(LISTING_OPTION_SCHEDULES_MAX);
    const updated = upsertOptionSchedule(row, {
      ...(row.schedules![0] as ListingOptionSchedule),
      name: 'Renamed',
    });
    expect(updated.schedules).toHaveLength(LISTING_OPTION_SCHEDULES_MAX);
    expect(updated.schedules?.[0]?.name).toBe('Renamed');
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

  it('exposes a day-level slot for flexible schedules without a clock time', () => {
    const flexibleSeason = {
      ...september,
      id: 'sch-flex',
      startTime: '',
    };
    const opt = option({
      startMode: 'flexible',
      chargeModel: 'per_person',
      schedules: [flexibleSeason],
    });
    expect(departureTimesOnDate(opt, '2026-09-15')).toEqual(['00:00']);
    const rows = tourSellingDeparturesOnDate([opt], '2026-09-15');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.startTime).toBe('00:00');
    expect(resolveScheduleForDate(opt, '2026-09-15', '00:00')?.id).toBe('sch-flex');
  });

  it('does not invent capacity 8 for legacy options without spots (Phase 1173)', () => {
    // Bypass normalizeListingBookingOption — it backfills maxPersons/spots for editor forms.
    const legacy = {
      id: 'opt-legacy',
      name: 'Legacy',
      priceUsd: 100,
      startTime: '10:00',
      duration: '2 hours',
      pickupPlace: '',
      minPersons: 1,
      maxPersons: 0,
      maxSpotsPerSlot: 0,
      optionInfo: '',
      weekdays: [true, true, true, true, true, true, true],
      availabilityDateFrom: '2026-01-01',
      availabilityDateTo: '2026-12-31',
      pricingMode: 'uniform' as const,
    };
    expect(tourSellingDeparturesOnDate([legacy], '2026-09-15')).toEqual([]);
  });

  it('Phase 1212: does not treat maxPersons as slot cap for legacy departures', () => {
    const legacy = {
      id: 'opt-legacy',
      name: 'Legacy',
      priceUsd: 100,
      startTime: '10:00',
      duration: '2 hours',
      pickupPlace: '',
      minPersons: 1,
      maxPersons: 12,
      maxSpotsPerSlot: 0,
      optionInfo: '',
      weekdays: daily,
      availabilityDateFrom: '2026-01-01',
      availabilityDateTo: '2026-12-31',
      pricingMode: 'uniform' as const,
    };
    expect(tourSellingDeparturesOnDate([legacy], '2026-09-15')).toEqual([]);
  });
});

describe('optionCapacityForDepartureTime (Phase 1207)', () => {
  it('fails closed for legacy options without valid maxSpotsPerSlot', () => {
    const legacy = {
      id: 'opt-legacy',
      name: 'Legacy',
      priceUsd: 100,
      startTime: '10:00',
      duration: '2 hours',
      pickupPlace: '',
      minPersons: 1,
      maxPersons: 12,
      maxSpotsPerSlot: 0,
      optionInfo: '',
      weekdays: daily,
      availabilityDateFrom: '2026-01-01',
      availabilityDateTo: '2026-12-31',
      pricingMode: 'uniform' as const,
    };
    expect(optionCapacityForDepartureTime(legacy, '2026-09-15', '10:00')).toBeNull();
  });

  it('returns floored spots when legacy option has a real slot cap', () => {
    const legacy = option({ startTime: '10:00', maxSpotsPerSlot: 6, maxPersons: 12, schedules: undefined });
    expect(optionCapacityForDepartureTime(legacy, '2026-09-15', '10:00')).toEqual({
      maxSpotsPerSlot: 6,
      maxPersons: 12,
    });
  });
});

describe('ensureExplicitSchedules implicit id remap', () => {
  it('replaces ${optionId}-implicit with a stable explicit UUID so Finish schedule can open', () => {
    const legacy = option({
      id: 'opt-legacy',
      schedules: undefined,
      availabilityDateFrom: '2026-09-01',
      availabilityDateTo: '2026-09-30',
      startTime: '20:00',
      priceUsd: 149,
      weekdays: daily,
      chargeModel: 'per_person',
      startMode: 'fixed',
    });
    const implicitId = `${legacy.id}-implicit`;
    expect(isImplicitScheduleId(implicitId)).toBe(true);

    const prepared = ensureExplicitSchedules(legacy);
    expect(prepared.schedules).toHaveLength(1);
    const remapped = prepared.schedules![0]!;
    expect(isImplicitScheduleId(remapped.id)).toBe(false);
    expect(remapped.id).not.toBe(implicitId);

    // Simulate Finish schedule: CTA still carries the old implicit id.
    let resolved = prepared.schedules!.find((s) => s.id === implicitId);
    if (!resolved && isImplicitScheduleId(implicitId) && prepared.schedules!.length === 1) {
      resolved = prepared.schedules![0];
    }
    expect(resolved?.id).toBe(remapped.id);
  });

  it('is a no-op when schedules are already explicit', () => {
    const withSchedules = option({ schedules: [september] });
    const prepared = ensureExplicitSchedules(withSchedules);
    expect(prepared.schedules?.[0]?.id).toBe('sch-sep');
  });
});

describe('per-weekday multiple start times', () => {
  const multi = season({
    id: 'sch-multi',
    name: 'Winter evenings',
    availabilityDateFrom: '2026-12-01',
    availabilityDateTo: '2027-03-31',
    weekdays: [true, false, false, false, false, true, false],
    startTime: '12:00',
    weekdayStartTimes: [[], [], [], [], [], [], []].map((_, i) =>
      i === 0 || i === 5 ? ['12:00', '14:00'] : []
    ),
  });

  it('normalizes weekdayStartTimes and derives weekdays + earliest startTime', () => {
    const normalized = normalizeListingOptionSchedule(
      {
        id: 'sch-n',
        name: 'Winter',
        availabilityDateFrom: '2026-12-01',
        weekdays: daily,
        startTime: '20:00',
        weekdayStartTimes: [['09:00', '14:00'], [], [], [], [], ['10:00'], []],
        priceUsd: 100,
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        status: 'ready',
      },
      'sch-n'
    );
    expect(normalized.weekdays[0]).toBe(true);
    expect(normalized.weekdays[1]).toBe(false);
    expect(normalized.weekdays[5]).toBe(true);
    expect(normalized.startTime).toBe('09:00');
    expect(normalized.weekdayStartTimes?.[0]).toEqual(['09:00', '14:00']);
  });

  it('keeps legacy single startTime schedules working without weekdayStartTimes', () => {
    expect(scheduleHasFixedDepartures(september)).toBe(true);
    expect(departureTimesOnDate(option({ schedules: [september] }), '2026-09-15')).toEqual(['20:00']);
    expect(resolveScheduleForDate(option({ schedules: [september] }), '2026-09-15')?.id).toBe('sch-sep');
  });

  it('fans out multiple departures on one schedule for the same date', () => {
    // 2026-12-07 is Monday
    const opt = option({ schedules: [multi] });
    expect(departureTimesOnDate(opt, '2026-12-07')).toEqual(['12:00', '14:00']);
    expect(tourSellingDeparturesOnDate([opt], '2026-12-07')).toEqual([
      expect.objectContaining({ scheduleId: 'sch-multi', startTime: '12:00' }),
      expect.objectContaining({ scheduleId: 'sch-multi', startTime: '14:00' }),
    ]);
  });

  it('requires choosing a time when one schedule offers multiple departures', () => {
    const opt = option({ schedules: [multi] });
    expect(resolveScheduleForDate(opt, '2026-12-07')).toBeNull();
    expect(resolveScheduleForDate(opt, '2026-12-07', '14:00')?.id).toBe('sch-multi');
    const applied = applyScheduleToOption(opt, multi, '14:00');
    expect(applied.startTime).toBe('14:00');
  });

  it('quotes require a departure time when the schedule has multiple times', () => {
    const opt = option({
      schedules: [multi],
      pricingMode: 'age_dependent',
      priceCategories: defaultAgeDependentCategories(119, 89),
    });
    const missing = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-12-07',
      guests: 1,
      bookingOptionId: 'opt-nl',
      todayIso: '2026-08-01',
      participantMix: { [multi.priceCategories![0].id]: 1 },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('time');

    const ok = quoteBooking({
      tour: tourWith(opt),
      discounts: [],
      bookingDate: '2026-12-07',
      guests: 1,
      bookingOptionId: 'opt-nl',
      todayIso: '2026-08-01',
      startTime: '14:00',
      participantMix: { [multi.priceCategories![0].id]: 1 },
    });
    expect(ok.ok).toBe(true);
  });

  it('overlaps when two schedules share a weekday time, not when times differ', () => {
    const other = {
      ...multi,
      id: 'sch-other',
      name: 'Other',
      weekdayStartTimes: multi.weekdayStartTimes!.map((day, i) =>
        i === 0 ? ['12:00'] : i === 5 ? ['16:00'] : []
      ),
      startTime: '12:00',
    };
    const conflict = findScheduleOverlap(other, [multi]);
    expect(conflict?.startTime).toBe('12:00');

    const distinct = {
      ...other,
      weekdayStartTimes: multi.weekdayStartTimes!.map((day, i) =>
        i === 0 || i === 5 ? ['16:00'] : []
      ),
      startTime: '16:00',
    };
    expect(findScheduleOverlap(distinct, [multi])).toBeNull();
  });

  it('summarizes shared times compactly and syncs write helpers', () => {
    expect(formatScheduleDepartureSummary(multi)).toBe('12:00, 14:00');
    const synced = syncScheduleDeparturesFromWeekdayTimes([
      ['14:00', '09:00'],
      [],
      [],
      [],
      [],
      ['14:00'],
      [],
    ]);
    expect(synced.weekdays[0]).toBe(true);
    expect(synced.weekdays[5]).toBe(true);
    expect(synced.startTime).toBe('09:00');
    expect(synced.weekdayStartTimes?.[0]).toEqual(['09:00', '14:00']);
  });
});

describe('option capacity vs group size', () => {
  it('treats maxSpotsPerSlot as traveler seats; groups are derived', () => {
    expect(maxWholeGroupsForSlot(8, 8)).toBe(1);
    expect(maxWholeGroupsForSlot(16, 8)).toBe(2);
    expect(maxWholeGroupsForSlot(50, 10)).toBe(5);
    expect(maxWholeGroupsForSlot(8, 0)).toBe(0);
  });

  it('rejects group size larger than slot capacity', () => {
    expect(
      scheduleCapacityValid({
        minPersons: 1,
        maxPersons: 12,
        maxSpotsPerSlot: 8,
      })
    ).toBe(false);
    expect(
      scheduleCapacityValid({
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
      })
    ).toBe(true);
  });

  it('caps schedule booking size by option slot capacity only', () => {
    const ceilings = scheduleCapacityCeilings(
      option({ maxPersons: 12, maxSpotsPerSlot: 16 })
    );
    expect(ceilings.spotsCeiling).toBe(16);
    expect(ceilings.guestsCeiling).toBe(16);
    const issues = scheduleCapacityIssues(
      season({
        id: 'sch-cap',
        name: 'Winter',
        availabilityDateFrom: '2026-12-01',
        maxPersons: 20,
        maxSpotsPerSlot: 16,
      }),
      ceilings
    );
    expect(issues.some((m) => /option capacity|travelers per start/i.test(m))).toBe(true);
  });

  it('rejects whole-group schedules when groups × max size exceeds slot capacity', () => {
    const issues = scheduleCapacityIssues(
      season({
        id: 'sch-groups',
        name: 'Summer',
        availabilityDateFrom: '2026-06-01',
        minPersons: 1,
        maxPersons: 9,
        maxSpotsPerSlot: 16,
        maxGroupsPerSlot: 2,
      }),
      { spotsCeiling: 16, guestsCeiling: 16, requireGroups: true }
    );
    expect(issues.some((m) => /at most 1 group/i.test(m))).toBe(true);
    expect(
      scheduleCapacityValid(
        {
          minPersons: 1,
          maxPersons: 8,
          maxSpotsPerSlot: 16,
          maxGroupsPerSlot: 2,
        },
        { requireGroups: true }
      )
    ).toBe(true);
  });
});
