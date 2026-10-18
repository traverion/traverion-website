import { describe, expect, it } from 'vitest';
import {
  emptyStayUnit,
  normalizeStayUnits,
  stayAccommodationMode,
  stayUnitReady,
  stayUnitsReady,
} from './stay-accommodation';

describe('stay accommodation drafts', () => {
  it('treats missing mode as a single accommodation', () => {
    expect(stayAccommodationMode(undefined)).toBe('single');
    expect(stayAccommodationMode('hotel')).toBe('single');
    expect(stayAccommodationMode('multi')).toBe('multi');
  });

  it('keeps a ready room draft and drops a row without an id', () => {
    const units = normalizeStayUnits([
      {
        id: 'room-1',
        name: 'Standard Room',
        maxGuests: 2,
        nightlyPriceUsd: 120,
        quantity: 10,
      },
      { name: 'Missing id' },
    ]);
    expect(units).toHaveLength(1);
    expect(stayUnitReady(units[0])).toBe(true);
    expect(stayUnitsReady(units)).toBe(true);
  });

  it('does not treat an archived room as ready inventory', () => {
    const unit = { ...emptyStayUnit('igloo'), name: 'Glass igloo', maxGuests: 2, nightlyPriceUsd: 290, archived: true };
    expect(stayUnitReady(unit)).toBe(false);
    expect(stayUnitsReady([unit])).toBe(false);
  });
});
