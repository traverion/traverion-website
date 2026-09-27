import { describe, expect, it } from 'vitest';
import { clientAmountConflictsWithQuote, experienceTodayIsoForListing, formatOptionWeekdays, listingHasBookableDepartureOnDate, listingHasUpcomingBookableSeason, listingRunsOnDate, quoteBooking, quoteStayNights, stayQuotePriceLines, tourBookableSellingDeparturesOnDate, tourQuotePriceLines, weekdayIndexMondayFirst } from './booking-quote';
import { tourDateLacksCapacityForParty } from './tour-calendar';
import type { TourPackage } from '../types/tour';
import type { ListingBookingOption } from '../types/listingExtras';
import { getListingPublishBlockers, partnerListingDraftPublishSubtitle } from './listingPublishGate';
import { parsePathname } from './appRouting';

function option(partial: Partial<ListingBookingOption> & Pick<ListingBookingOption, 'id' | 'name' | 'priceUsd'>): ListingBookingOption {
  return {
    startTime: '09:00',
    duration: '3 hours',
    pickupPlace: 'Main square meeting point',
    minPersons: 1,
    maxPersons: 8,
    maxSpotsPerSlot: 8,
    optionInfo: 'Small group',
    travelerStartInstructions: 'Meet your guide at the square 15 minutes before departure.',
    weekdays: [true, true, true, true, true, true, true],
    availabilityDateFrom: '',
    availabilityDateTo: '',
    ...partial,
  };
}

function tour(over: Partial<TourPackage> = {}): TourPackage {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Aurora hunt small group',
    destination: 'Rovaniemi',
    duration: '3 hours',
    style: 'Tour',
    startLocation: 'Rovaniemi',
    endLocation: 'Rovaniemi',
    price: { startingFrom: 120, currency: 'USD', perPerson: true, twinOccupancy: false, customQuote: false, singleSupplement: 0, validity: 'Year round' },
    category: '3*',
    tourType: 'cultural',
    validity: 'Year round',
    image: 'https://example.com/hero.jpg',
    description: 'A real aurora experience with a local guide in the arctic night.',
    highlights: [],
    itinerary: [],
    includes: ['Guide', 'Hot drink'],
    excludes: ['Hotel pickup'],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '1-8 People',
    bestTime: 'Winter',
    rating: 0,
    reviews: 0,
    isPopular: false,
    status: 'published',
    city: 'Rovaniemi',
    country: 'Finland',
    listingExtras: {
      bookingOptions: [
        option({
          id: 'opt-small',
          name: 'Small group',
          priceUsd: 149,
        }),
      ],
    },
    ...over,
  };
}

describe('weekdayIndexMondayFirst', () => {
  it('maps a known Monday and Sunday', () => {
    expect(weekdayIndexMondayFirst('2026-09-07')).toBe(0);
    expect(weekdayIndexMondayFirst('2026-09-13')).toBe(6);
  });
});

describe('quoteBooking', () => {
  const today = '2026-09-04';

  it('rejects a departure inside the listing booking cut-off window', () => {
    const startMs = Date.UTC(2026, 8, 27, 17, 30, 0); // 20:30 Europe/Helsinki (EEST = UTC+3)
    const q = quoteBooking({
      tour: tour({
        listingExtras: {
          bookingCutoffHoursBeforeStart: 2,
          bookingOptions: [
            option({
              id: 'opt-small',
              name: 'Small group',
              priceUsd: 149,
              startTime: '20:30',
            }),
          ],
        },
      }),
      discounts: [],
      bookingDate: '2026-09-27',
      guests: 2,
      bookingOptionId: 'opt-small',
      startTime: '20:30',
      todayIso: '2026-09-27',
      nowMs: startMs - 90 * 60 * 1000,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.error).toMatch(/2 hours before departure/i);
  });

  it('prices option × guests after percent discount', () => {
    const q = quoteBooking({
      tour: tour(),
      discounts: [
        {
          type: 'percent',
          value: 10,
          valid_from: '2026-09-01',
          valid_until: '2026-09-30',
          booking_option_id: 'opt-small',
        },
      ],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.unitPrice).toBe(134.1);
    expect(q.totalAmount).toBe(268.2);
    expect(clientAmountConflictsWithQuote(1, q.totalAmount)).toBe(true);
    expect(clientAmountConflictsWithQuote(q.totalAmount, q.totalAmount)).toBe(false);
  });

  it('keeps a non-EUR listing currency on the quote (GBP fixture)', () => {
    const q = quoteBooking({
      tour: tour({
        price: {
          startingFrom: 99,
          currency: 'GBP',
          perPerson: true,
          twinOccupancy: false,
          customQuote: false,
          singleSupplement: 0,
          validity: 'Year round',
        },
      }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 1,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.currency).toBe('GBP');
  });

  it('rejects a manipulated cheaper total conceptually (client amount ignored)', () => {
    const honest = quoteBooking({
      tour: tour(),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(honest.ok).toBe(true);
    if (!honest.ok) return;
    expect(honest.totalAmount).toBe(298);
    expect(clientAmountConflictsWithQuote(1, honest.totalAmount)).toBe(true);
  });

  it('rejects unpublished listings', () => {
    const q = quoteBooking({
      tour: tour({ status: 'draft' }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('unpublished');
  });

  // Phase 583: migration 003 gave listings.status no NOT NULL constraint, and
  // its CHECK (status in ('draft','published')) does not restrict NULL either
  // -- so any authenticated supplier can set status: null directly via a
  // PostgREST call (bypassing the migration-082 publish-verification
  // trigger, which only fires when new.status = 'published'). A listing
  // with status: null must be treated exactly like 'draft' here -- NOT
  // bookable -- or an unverified supplier's listing becomes bookable by
  // skipping verification entirely through this one-character omission.
  it('rejects a listing with status: null exactly like draft (migration-082 verification bypass)', () => {
    const q = quoteBooking({
      tour: tour({ status: null as unknown as TourPackage['status'] }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('unpublished');
  });

  it('rejects a listing with status: "" (empty string) exactly like draft', () => {
    const q = quoteBooking({
      tour: tour({ status: '' as unknown as TourPackage['status'] }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('unpublished');
  });

  it('does not quote stay or experience inventory as a tour departure', () => {
    const q = quoteBooking({
      tour: tour({ listingExtras: { inventoryFamily: 'stay', bookingOptions: [] } }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('inventory');
  });

  it('quotes a stay as nights × nightly plus cleaning', () => {
    const q = quoteStayNights({
      tour: tour({
        listingExtras: {
          inventoryFamily: 'stay',
          stay: { nightlyPriceUsd: 100, maxGuests: 4, minNights: 2, cleaningFeeUsd: 40 },
          bookingOptions: [],
        },
      }),
      checkIn: '2026-09-10',
      checkOut: '2026-09-13',
      guests: 2,
      todayIso: today,
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.nights).toBe(3);
    expect(q.totalAmount).toBe(340);
  });

  it('Phase 1217: fails closed when stay maxGuests is unset (no invent-99)', () => {
    const q = quoteStayNights({
      tour: tour({
        listingExtras: {
          inventoryFamily: 'stay',
          stay: { nightlyPriceUsd: 100, minNights: 1, cleaningFeeUsd: 0 },
          bookingOptions: [],
        },
      }),
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      guests: 2,
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.code).toBe('party');
  });

  it('stay checkout amount does not take listing_discounts — leftover stay offers cannot change Stripe TEST', () => {
    const stayTour = tour({
      listingExtras: {
        inventoryFamily: 'stay',
        stay: { nightlyPriceUsd: 100, maxGuests: 4, minNights: 2, cleaningFeeUsd: 40 },
        bookingOptions: [],
      },
    });
    const q = quoteStayNights({
      tour: stayTour,
      checkIn: '2026-09-10',
      checkOut: '2026-09-13',
      guests: 2,
      todayIso: today,
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.nightlyPrice).toBe(100);
    expect(q.totalAmount).toBe(340);
    expect(q.totalAmount).not.toBe(190);
  });

  it('rejects closed weekdays', () => {
    const q = quoteBooking({
      tour: tour({
        listingExtras: {
          bookingOptions: [
            option({
              id: 'opt-small',
              name: 'Small group',
              priceUsd: 149,
              weekdays: [true, true, true, true, true, false, false],
            }),
          ],
        },
      }),
      discounts: [],
      bookingDate: '2026-09-12',
      guests: 2,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('weekday');
  });

  it('rejects party size above option max', () => {
    const q = quoteBooking({
      tour: tour(),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 20,
      bookingOptionId: 'opt-small',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('party');
  });

  it('requires an option when several exist', () => {
    const q = quoteBooking({
      tour: tour({
        listingExtras: {
          bookingOptions: [
            option({ id: 'a', name: 'A', priceUsd: 100 }),
            option({ id: 'b', name: 'B', priceUsd: 200 }),
          ],
        },
      }),
      discounts: [],
      bookingDate: '2026-09-10',
      guests: 2,
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('option');
  });
});

describe('listingRunsOnDate', () => {
  it('keeps listings with no booking options', () => {
    expect(listingRunsOnDate(tour({ listingExtras: { bookingOptions: [] } }), '2026-09-12')).toBe(true);
  });

  it('hides a listing when no option runs that weekday', () => {
    expect(
      listingRunsOnDate(
        tour({
          listingExtras: {
            bookingOptions: [
              option({
                id: 'opt-small',
                name: 'Small group',
                priceUsd: 149,
                weekdays: [true, true, true, true, true, false, false],
              }),
            ],
          },
        }),
        '2026-09-12'
      )
    ).toBe(false);
  });

  it('keeps a listing when at least one option runs', () => {
    expect(
      listingRunsOnDate(
        tour({
          listingExtras: {
            bookingOptions: [
              option({
                id: 'weekday',
                name: 'Weekday',
                priceUsd: 149,
                weekdays: [true, true, true, true, true, false, false],
              }),
              option({
                id: 'weekend',
                name: 'Weekend',
                priceUsd: 169,
                weekdays: [false, false, false, false, false, true, true],
              }),
            ],
          },
        }),
        '2026-09-12'
      )
    ).toBe(true);
  });
});

describe('listingHasBookableDepartureOnDate (Phase 1057 browse cutoff)', () => {
  it('hides a same-day listing whose only departure is already past cutoff', () => {
    // Friday 2026-09-11 — weekdays Mon–Fri open. 20:00 Helsinki with 2h cutoff
    // is closed when "now" is 19:00 Helsinki (16:00 UTC in EEST = UTC+3).
    const nowMs = Date.UTC(2026, 8, 11, 16, 0, 0);
    expect(
      listingHasBookableDepartureOnDate(
        tour({
          listingExtras: {
            bookingCutoffHoursBeforeStart: 2,
            departureTimezone: 'Europe/Helsinki',
            bookingOptions: [
              option({
                id: 'eve',
                name: 'Evening',
                priceUsd: 149,
                startTime: '20:00',
                weekdays: [true, true, true, true, true, false, false],
              }),
            ],
          },
        }),
        '2026-09-11',
        nowMs
      )
    ).toBe(false);
  });

  it('keeps a listing when a later departure is still bookable', () => {
    const nowMs = Date.UTC(2026, 8, 11, 16, 0, 0); // 19:00 Helsinki
    expect(
      listingHasBookableDepartureOnDate(
        tour({
          listingExtras: {
            bookingCutoffHoursBeforeStart: 2,
            departureTimezone: 'Europe/Helsinki',
            bookingOptions: [
              option({
                id: 'eve',
                name: 'Evening',
                priceUsd: 149,
                startTime: '20:00',
                weekdays: [true, true, true, true, true, false, false],
              }),
              option({
                id: 'late',
                name: 'Late',
                priceUsd: 149,
                startTime: '22:00',
                weekdays: [true, true, true, true, true, false, false],
              }),
            ],
          },
        }),
        '2026-09-11',
        nowMs
      )
    ).toBe(true);
  });
});

describe('experienceTodayIsoForListing (Phase 1274)', () => {
  it('uses listing TZ, with Helsinki as the platform fallback path', () => {
    // 2026-09-15 22:30 UTC = 2026-09-16 in Europe/Helsinki
    const now = Date.UTC(2026, 8, 15, 22, 30, 0);
    expect(experienceTodayIsoForListing('Europe/Helsinki', now)).toBe('2026-09-16');
    expect(experienceTodayIsoForListing('', now)).toBe('2026-09-16');
    expect(experienceTodayIsoForListing('Not/AZone', now)).toBe('2026-09-16');
  });
});

describe('listingHasUpcomingBookableSeason (Phase 1260)', () => {
  it('hides tours whose every ready schedule season has already ended', () => {
    expect(
      listingHasUpcomingBookableSeason(
        tour({
          listingExtras: {
            departureTimezone: 'Europe/Helsinki',
            bookingOptions: [
              option({
                id: 'ended',
                name: 'Ended',
                priceUsd: 99,
                startTime: '20:00',
                weekdays: [true, true, true, true, true, true, true],
                schedules: [
                  {
                    id: 'sch-1',
                    name: 'Past',
                    availabilityDateFrom: '2020-01-01',
                    availabilityDateTo: '2020-12-31',
                    weekdays: [true, true, true, true, true, true, true],
                    startTime: '20:00',
                    priceUsd: 99,
                    minPersons: 1,
                    maxPersons: 8,
                    maxSpotsPerSlot: 8,
                    status: 'ready',
                  },
                ],
              }),
            ],
          },
        }),
        '2026-09-11'
      )
    ).toBe(false);
  });

  it('Phase 1288: ignores ready schedules missing availabilityDateFrom', () => {
    expect(
      listingHasUpcomingBookableSeason(
        tour({
          listingExtras: {
            bookingOptions: [
              option({
                id: 'nofrom',
                name: 'No from',
                priceUsd: 99,
                startTime: '20:00',
                weekdays: [true, true, true, true, true, true, true],
                schedules: [
                  {
                    id: 'sch-1',
                    name: 'Open end',
                    availabilityDateFrom: '',
                    availabilityDateTo: '',
                    weekdays: [true, true, true, true, true, true, true],
                    startTime: '20:00',
                    priceUsd: 99,
                    minPersons: 1,
                    maxPersons: 8,
                    maxSpotsPerSlot: 8,
                    status: 'ready',
                  },
                ],
              }),
            ],
          },
        }),
        '2026-09-11'
      )
    ).toBe(false);
  });

  it('keeps tours with an open-ended or future season', () => {
    expect(
      listingHasUpcomingBookableSeason(
        tour({
          listingExtras: {
            bookingOptions: [
              option({
                id: 'open',
                name: 'Open',
                priceUsd: 99,
                startTime: '20:00',
                weekdays: [true, true, true, true, true, true, true],
                availabilityDateFrom: '2026-01-01',
                availabilityDateTo: '',
              }),
            ],
          },
        }),
        '2026-09-11'
      )
    ).toBe(true);
  });
});

describe('tourBookableSellingDeparturesOnDate (Phase 1063 capacity cutoff)', () => {
  it('excludes past-cutoff morning seats so capacity matches PDP bookable chips', () => {
    // 19:00 Helsinki: 09:00 is past 2h cutoff; 22:00 remains bookable.
    const nowMs = Date.UTC(2026, 8, 11, 16, 0, 0);
    const opts = [
      option({
        id: 'morning',
        name: 'Morning',
        priceUsd: 99,
        startTime: '09:00',
        maxSpotsPerSlot: 8,
        weekdays: [true, true, true, true, true, false, false],
      }),
      option({
        id: 'late',
        name: 'Late',
        priceUsd: 149,
        startTime: '22:00',
        maxSpotsPerSlot: 2,
        weekdays: [true, true, true, true, true, false, false],
      }),
    ];
    const bookable = tourBookableSellingDeparturesOnDate(opts, '2026-09-11', {
      cutoffHoursBeforeStart: 2,
      timeZone: 'Europe/Helsinki',
      nowMs,
    });
    expect(bookable.map((d) => d.startTime)).toEqual(['22:00']);

    // Morning still has seats but is past cutoff; late is full for a party of 2.
    const departures = bookable.map((d) => ({
      startTimeHm: d.startTime,
      maxSpots: d.maxSpotsPerSlot,
    }));
    expect(
      tourDateLacksCapacityForParty({
        paidGuestsThatDay: 2,
        dayCapacity: undefined,
        fallbackCapacity: 8,
        partySize: 2,
        paidBySlot: { '22:00': 2 },
        departures,
        slotKey: (hm) => hm,
      })
    ).toBe(true);
  });
});

describe('getListingPublishBlockers', () => {
  it('blocks an empty draft and accepts a complete listing', () => {
    const empty = getListingPublishBlockers(
      tour({
        title: 'Hi',
        subtitle: '',
        description: 'short',
        image: '',
        city: '',
        country: '',
        listingExtras: { bookingOptions: [] },
        includes: [],
        excludes: [],
        price: { startingFrom: 0, currency: 'USD', perPerson: true, twinOccupancy: false, customQuote: false, singleSupplement: 0, validity: 'Year round' },
      })
    );
    expect(empty.length).toBeGreaterThan(0);

    const ready = getListingPublishBlockers(
      tour({
        subtitle: 'Northern lights by snowmobile with a local guide',
        description: 'A'.repeat(120),
        image: 'https://example.com/real.jpg',
        listingExtras: {
          bookingOptions: [
            option({ id: 'opt-small', name: 'Small group', priceUsd: 149 }),
          ],
          galleryImageUrls: [
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
          ],
        },
      })
    );
    expect(ready).toEqual([]);
  });

  it('does not call a photo-short draft Ready for travelers on the list subtitle', () => {
    const almost = tour({
      subtitle: 'Northern lights by snowmobile with a local guide',
      description: 'A'.repeat(120),
      image: 'https://example.com/real.jpg',
      listingExtras: {
        bookingOptions: [option({ id: 'opt-small', name: 'Small group', priceUsd: 149 })],
        galleryImageUrls: ['https://example.com/2.jpg'],
      },
    });
    const tip = partnerListingDraftPublishSubtitle(almost);
    expect(tip.readyToPublish).toBe(false);
    expect(tip.blockers.length).toBeGreaterThan(0);
    expect(tip.subtitle.toLowerCase()).toContain('before publish');
    expect(tip.subtitle.toLowerCase()).not.toContain('ready for travelers');
  });

  it('blocks an option whose season already ended', () => {
    const ended = getListingPublishBlockers(
      tour({
        subtitle: 'Northern lights by snowmobile with a local guide',
        description: 'A'.repeat(120),
        image: 'https://example.com/real.jpg',
        listingExtras: {
          bookingOptions: [
            option({
              id: 'opt-small',
              name: 'Small group',
              priceUsd: 149,
              availabilityDateFrom: '2025-01-01',
              availabilityDateTo: '2025-03-01',
            }),
          ],
          galleryImageUrls: [
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
          ],
        },
      }),
      '2026-09-05'
    );
    expect(ended.some((m) => m.toLowerCase().includes('past'))).toBe(true);
  });

  it('season-end “today” uses listing experience timezone, not browser local (Phase 1098)', () => {
    // 2026-09-15 22:30 UTC = 2026-09-16 in Europe/Helsinki
    const now = Date.UTC(2026, 8, 15, 22, 30, 0);
    const base = {
      subtitle: 'Northern lights by snowmobile with a local guide',
      description: 'A'.repeat(120),
      image: 'https://example.com/real.jpg',
      listingExtras: {
        departureTimezone: 'Europe/Helsinki',
        bookingOptions: [
          option({
            id: 'opt-small',
            name: 'Small group',
            priceUsd: 149,
            availabilityDateFrom: '2026-01-01',
            availabilityDateTo: '2026-09-16',
          }),
        ],
        galleryImageUrls: [
          'https://example.com/2.jpg',
          'https://example.com/3.jpg',
          'https://example.com/4.jpg',
        ],
      },
    };
    const okHelsinki = getListingPublishBlockers(tour(base), undefined, now);
    expect(okHelsinki.some((m) => m.toLowerCase().includes('past'))).toBe(false);
    // Same instant, UTC calendar day is still Sep 15 — season ending Sep 15 would be "today" UTC.
    // If we wrongly used UTC today (Sep 15) against end Sep 14, that would be past; end Sep 16 is fine either way.
    // Prove Helsinki governs: end day = Helsinki yesterday = Sep 15 → past under Helsinki, not under a west-of-UTC browser.
    const endedHelsinki = getListingPublishBlockers(
      tour({
        ...base,
        listingExtras: {
          ...base.listingExtras,
          bookingOptions: [
            option({
              id: 'opt-small',
              name: 'Small group',
              priceUsd: 149,
              availabilityDateFrom: '2026-01-01',
              availabilityDateTo: '2026-09-15',
            }),
          ],
        },
      }),
      undefined,
      now
    );
    expect(endedHelsinki.some((m) => m.toLowerCase().includes('past'))).toBe(true);
  });

  it('publishes a stay without tour meeting points or booking options', () => {
    const stayReady = getListingPublishBlockers(
      tour({
        subtitle: 'Quiet apartment near the harbour',
        description: 'A'.repeat(120),
        image: 'https://example.com/real.jpg',
        includes: [],
        excludes: [],
        listingExtras: {
          inventoryFamily: 'stay',
          stay: {
            nightlyPriceUsd: 120,
            maxGuests: 4,
            checkInTime: '16:00',
            checkOutTime: '11:00',
            checkInAddress: 'Kauppakatu 1, Rovaniemi',
          },
          galleryImageUrls: [
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
          ],
        },
      })
    );
    expect(stayReady).toEqual([]);
  });

  it('blocks a stay missing check-in or check-out times', () => {
    const missingTimes = getListingPublishBlockers(
      tour({
        subtitle: 'Quiet apartment near the harbour',
        description: 'A'.repeat(120),
        image: 'https://example.com/real.jpg',
        includes: [],
        excludes: [],
        listingExtras: {
          inventoryFamily: 'stay',
          stay: { nightlyPriceUsd: 120, maxGuests: 4 },
          galleryImageUrls: [
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
            'https://example.com/4.jpg',
          ],
        },
      })
    );
    expect(missingTimes.some((m) => m.toLowerCase().includes('check-in'))).toBe(true);
    expect(missingTimes.some((m) => m.toLowerCase().includes('check-out'))).toBe(true);
  });
});

describe('parsePathname legacy brochure URLs', () => {
  it('sends old SEA package paths to the live catalog', () => {
    expect(parsePathname('/9-vietnam').page).toBe('packages');
    expect(parsePathname('/14-indochina').page).toBe('packages');
    expect(parsePathname('/packages').page).toBe('packages');
    expect(parsePathname('/tour/ec6e5d7e-b5d6-4428-94a4-e3ae0801a4b5').page).toBe('packages');
    expect(parsePathname('/tours/ec6e5d7e-b5d6-4428-94a4-e3ae0801a4b5').page).toBe('packages');
    expect(parsePathname('/').page).toBe('home');
    expect(parsePathname('/not-a-real-page').page).toBe('not-found');
    expect(parsePathname('/cart').page).toBe('bookings');
    expect(parsePathname('/account').page).toBe('account');
    expect(parsePathname('/bookings').page).toBe('bookings');
    expect(parsePathname('/stays')).toEqual({ page: 'stays', destinationSlug: null });
    expect(parsePathname('/experiences')).toEqual({ page: 'inventory-reserved', destinationSlug: 'experience' });
    expect(parsePathname('/packages').page).toBe('packages');
  });
});

describe('formatOptionWeekdays', () => {
  it('summarizes weekday masks', () => {
    expect(formatOptionWeekdays([true, true, true, true, true, true, true])).toBe('Every day');
    expect(formatOptionWeekdays([true, true, true, true, true, false, false])).toBe('Mon–Fri');
    expect(formatOptionWeekdays([false, false, false, false, false, true, true])).toBe('Sat, Sun');
  });
});

describe('quote price lines', () => {
  it('splits stay nights and cleaning from the authoritative quote', () => {
    expect(
      stayQuotePriceLines({
        ok: true,
        currency: 'EUR',
        nights: 2,
        nightlyPrice: 185,
        cleaningFee: 75,
        totalAmount: 445,
        guests: 2,
        checkIn: '2026-10-01',
        checkOut: '2026-10-03',
      })
    ).toEqual([
      { label: 'Nightly rate × 2 nights', amount: 370 },
      { label: 'Cleaning', amount: 75 },
    ]);
    expect(
      tourQuotePriceLines({
        ok: true,
        currency: 'EUR',
        unitPrice: 189,
        originalUnitPrice: 189,
        totalAmount: 378,
        guests: 2,
        bookingDate: '2026-10-01',
        optionId: null,
        optionLabel: 'Adult',
      })
    ).toEqual([{ label: 'Adult × 2', amount: 378 }]);
  });
});

describe('quoteBooking — private flat-group pricing after discounts', () => {
  const today = '2026-09-04';

  function privateOptionTour(): TourPackage {
    return tour({
      listingExtras: {
        bookingOptions: [
          option({
            id: 'opt-private',
            name: 'Private group tour',
            priceUsd: 0,
            isPrivate: true,
            privatePricing: 'flat_group',
            privateGroupPriceUsd: 400,
            minPersons: 1,
            maxPersons: 10,
          }),
        ],
      },
    });
  }

  it('rejects a 100%-off discount that reduces the flat group price to zero', () => {
    const q = quoteBooking({
      tour: privateOptionTour(),
      discounts: [
        {
          type: 'percent',
          value: 100,
          valid_from: null,
          valid_until: null,
          booking_option_id: 'opt-private',
        },
      ],
      bookingDate: '2026-09-10',
      guests: 4,
      bookingOptionId: 'opt-private',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('price');
    expect(q.error).toMatch(/does not have a bookable price/i);
  });

  it('rejects a misconfigured >100%-off discount that would make the flat group price negative', () => {
    const q = quoteBooking({
      tour: privateOptionTour(),
      discounts: [
        {
          type: 'percent',
          value: 150,
          valid_from: null,
          valid_until: null,
          booking_option_id: 'opt-private',
        },
      ],
      bookingDate: '2026-09-10',
      guests: 4,
      bookingOptionId: 'opt-private',
      todayIso: today,
    });
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe('price');
    expect(q.error).toMatch(/does not have a bookable price/i);
  });

  it('still applies a legitimate partial discount to the flat group price', () => {
    const q = quoteBooking({
      tour: privateOptionTour(),
      discounts: [
        {
          type: 'percent',
          value: 25,
          valid_from: null,
          valid_until: null,
          booking_option_id: 'opt-private',
        },
      ],
      bookingDate: '2026-09-10',
      guests: 4,
      bookingOptionId: 'opt-private',
      todayIso: today,
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.totalAmount).toBe(300);
  });

  it('defaults past-date gate to listing departureTimezone, not UTC (Phase 1076)', () => {
    // 22:00 UTC on 27 Sep = 01:00 next calendar day in Europe/Helsinki (EEST).
    const nowMs = Date.UTC(2026, 8, 27, 22, 0, 0);
    const base = tour({
      listingExtras: {
        departureTimezone: 'Europe/Helsinki',
        bookingOptions: [
          option({ id: 'opt-small', name: 'Small group', priceUsd: 149 }),
        ],
      },
    });
    const past = quoteBooking({
      tour: base,
      discounts: [],
      bookingDate: '2026-09-27',
      guests: 2,
      bookingOptionId: 'opt-small',
      nowMs,
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.code).toBe('bad_date');

    const ok = quoteBooking({
      tour: base,
      discounts: [],
      bookingDate: '2026-09-28',
      guests: 2,
      bookingOptionId: 'opt-small',
      nowMs,
    });
    expect(ok.ok).toBe(true);
  });
});

describe('quoteStayNights experience-local today', () => {
  it('rejects check-in that is already yesterday in the stay timezone (Phase 1076)', () => {
    // 22:00 UTC on 27 Sep = 01:00 next calendar day in Europe/Helsinki (EEST).
    const nowMs = Date.UTC(2026, 8, 27, 22, 0, 0);
    const stayTour = tour({
      listingExtras: {
        inventoryFamily: 'stay',
        departureTimezone: 'Europe/Helsinki',
        stay: {
          nightlyPriceUsd: 100,
          cleaningFeeUsd: 0,
          minNights: 1,
          maxGuests: 4,
        },
      },
    });
    const past = quoteStayNights({
      tour: stayTour,
      checkIn: '2026-09-27',
      checkOut: '2026-09-29',
      guests: 2,
      nowMs,
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.code).toBe('bad_date');

    const ok = quoteStayNights({
      tour: stayTour,
      checkIn: '2026-09-28',
      checkOut: '2026-09-30',
      guests: 2,
      nowMs,
    });
    expect(ok.ok).toBe(true);
  });
});
