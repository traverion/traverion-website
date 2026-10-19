import { describe, expect, it } from 'vitest';
import {
  ensureStayOptions,
  projectStayOptions,
  stayOptionConfigured,
  stayOptionsNeedSeparateInventory,
  stayScheduleConflicts,
} from './stay-options';

describe('stay options', () => {
  it('keeps a saved single stay as one bookable option', () => {
    const options = ensureStayOptions({
      title: 'Arctic Aurora Apartment',
      propertyType: 'Apartment',
      maxGuests: 8,
      beds: 1,
      nightlyPrice: 189,
      minNights: 2,
      seasons: [],
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.name).toBe('Arctic Aurora Apartment');
    expect(options[0]?.beds).toBe(1);
    expect(stayOptionsNeedSeparateInventory(options)).toBe(false);
    const projected = projectStayOptions(options, 'Apartment');
    expect(projected.stayAccommodationMode).toBe('single');
    expect(projected.stayNightly).toBe('189');
    expect(projected.stayMaxGuests).toBe('8');
    expect(projected.stayBeds).toBe('1');
    expect(stayOptionConfigured(options[0]!)).toBe(true);
  });

  it('keeps Villa on the option when an older listing field still says House', () => {
    const options = ensureStayOptions({
      title: 'Lakeside Villa',
      propertyType: 'Villa',
      maxGuests: 6,
      beds: 3,
      nightlyPrice: 240,
      minNights: 2,
      seasons: [],
    });
    expect(options[0]?.propertyType).toBe('Villa');
    expect(projectStayOptions(options, 'House').stayPropertyType).toBe('Villa');
  });

  it('keeps a custom property type on the option', () => {
    const options = ensureStayOptions({
      title: 'Glass Igloo',
      propertyType: 'Glass igloo',
      maxGuests: 2,
      beds: 1,
      nightlyPrice: 320,
      minNights: 1,
      seasons: [],
    });
    expect(projectStayOptions(options, 'House').stayPropertyType).toBe('Glass igloo');
  });

  it('does not publish several options through the single-stay price', () => {
    const options = ensureStayOptions({
      options: [
        {
          id: 'a',
          name: 'Standard Apartment',
          propertyType: 'Apartment',
          maxGuests: 2,
          beds: 1,
          quantity: 1,
          nightlyPrice: 99,
          minNights: 1,
          schedules: [{ id: 's1', name: 'Summer', start: '2026-06-01', end: '2026-08-31', enabled: true, nightlyPrice: 99, minNights: 2 }],
        },
        {
          id: 'b',
          name: 'Aurora Suite',
          propertyType: 'Apartment',
          maxGuests: 4,
          beds: 2,
          quantity: 1,
          nightlyPrice: 179,
          minNights: 1,
          schedules: [],
        },
      ],
    });
    expect(stayOptionsNeedSeparateInventory(options)).toBe(true);
    const projected = projectStayOptions(options, 'Hotel');
    expect(projected.stayAccommodationMode).toBe('multi');
    expect(projected.staySeasons).toEqual([]);
  });

  it('names overlapping schedules instead of hiding the price rule', () => {
    const lines = stayScheduleConflicts([
      { id: 'w', name: 'Winter', start: '2026-11-01', end: '2027-03-31', enabled: true, nightlyPrice: 189, minNights: null },
      { id: 'c', name: 'Christmas', start: '2026-12-20', end: '2026-12-27', enabled: true, nightlyPrice: 299, minNights: 3 },
    ]);
    expect(lines[0]).toContain('Winter');
    expect(lines[0]).toContain('Christmas');
    expect(lines[0]).toContain('Deactivate one');
  });
});
