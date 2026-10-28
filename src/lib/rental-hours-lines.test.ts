import { describe, expect, it } from 'vitest';
import { rentalHoursLines } from './rental-presentation';
import type { RentalOperatingDay } from '../types/rental';

const window = {
  earliestPickupHm: '09:00',
  latestPickupHm: '17:00',
  earliestReturnHm: '09:00',
  latestReturnHm: '18:00',
};

function day(id: RentalOperatingDay['day'], open = true, override: Partial<RentalOperatingDay> = {}): RentalOperatingDay {
  return { day: id, open, ...window, ...override };
}

describe('rentalHoursLines grouping', () => {
  it('collapses consecutive weekdays with the same window', () => {
    const lines = rentalHoursLines([
      day('mon'),
      day('tue'),
      day('wed'),
      day('thu'),
      day('fri'),
      day('sat', false),
      day('sun', false),
    ]);
    expect(lines).toEqual(['Mon–Fri · Pickup 09:00–17:00 · Return 09:00–18:00']);
  });

  it('keeps separate groups when windows differ', () => {
    const lines = rentalHoursLines([
      day('mon'),
      day('tue'),
      day('wed', true, { earliestPickupHm: '10:00', latestPickupHm: '16:00' }),
      day('thu', true, { earliestPickupHm: '10:00', latestPickupHm: '16:00' }),
      day('fri', false),
      day('sat', false),
      day('sun', false),
    ]);
    expect(lines).toEqual([
      'Mon–Tue · Pickup 09:00–17:00 · Return 09:00–18:00',
      'Wed–Thu · Pickup 10:00–16:00 · Return 09:00–18:00',
    ]);
  });

  it('uses the full weekday label for a single open day', () => {
    const lines = rentalHoursLines([
      day('mon', false),
      day('tue', false),
      day('wed', false),
      day('thu', false),
      day('fri', false),
      day('sat'),
      day('sun', false),
    ]);
    expect(lines).toEqual(['Saturday · Pickup 09:00–17:00 · Return 09:00–18:00']);
  });
});
