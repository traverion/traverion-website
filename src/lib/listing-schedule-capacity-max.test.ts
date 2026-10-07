import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LISTING_CAPACITY_MAX } from './listing-option-schedules';
import { scheduleCapacityIssues } from './listing-schedule-wizard';
import { bookingOptionCapacityIssues } from './listing-option-validation';
import type { ListingBookingOption, ListingOptionSchedule } from '../types/listingExtras';
import { blankOptionSchedule } from './listing-option-schedules';
import { normalizeListingBookingOption } from '../types/listingExtras';

describe('LISTING_CAPACITY_MAX adversarial guards', () => {
  it('imports LISTING_CAPACITY_MAX into the schedule wizard (no runtime ReferenceError)', () => {
    const src = readFileSync(resolve(__dirname, 'listing-schedule-wizard.ts'), 'utf8');
    expect(src).toMatch(/import \{[^}]*LISTING_CAPACITY_MAX[^}]*\} from '\.\/listing-option-schedules'/s);
  });

  it('rejects extreme schedule capacity with an operator-facing message', () => {
    const schedule: ListingOptionSchedule = {
      ...blankOptionSchedule('sch-huge'),
      minPersons: 1,
      maxPersons: LISTING_CAPACITY_MAX + 50,
      maxSpotsPerSlot: LISTING_CAPACITY_MAX + 50,
    };
    const issues = scheduleCapacityIssues(schedule);
    expect(issues.some((m) => m.includes(String(LISTING_CAPACITY_MAX)))).toBe(true);
  });

  it('rejects extreme option capacity with an operator-facing message', () => {
    const option = normalizeListingBookingOption(
      {
        id: 'opt-huge',
        name: 'Bus',
        priceUsd: 99,
        startTime: '20:00',
        duration: '6 hours',
        pickupPlace: 'Rovaniemi hotels',
        minPersons: 1,
        maxPersons: LISTING_CAPACITY_MAX + 1,
        maxSpotsPerSlot: LISTING_CAPACITY_MAX + 1,
        optionInfo: 'Shared bus',
        weekdays: [true, true, true, true, true, true, true],
        availabilityDateFrom: '2099-01-01',
        availabilityDateTo: '2099-03-01',
        pricingMode: 'uniform',
        chargeModel: 'per_person',
        startMode: 'fixed',
      },
      'opt-huge'
    ) as ListingBookingOption;
    const issues = bookingOptionCapacityIssues(option);
    expect(issues.some((m) => m.includes(String(LISTING_CAPACITY_MAX)))).toBe(true);
  });
});
