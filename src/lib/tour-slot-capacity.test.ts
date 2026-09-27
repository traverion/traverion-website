import { describe, expect, it } from 'vitest';
import { tourSlotMaxSpotsFromOption } from './tour-slot-capacity';

describe('tourSlotMaxSpotsFromOption', () => {
  it('returns floored maxSpotsPerSlot when present', () => {
    expect(tourSlotMaxSpotsFromOption({ maxSpotsPerSlot: 8.7, maxPersons: 12 } as never)).toBe(8);
  });

  it('Phase 1206: returns null when maxSpotsPerSlot missing (no invent from maxPersons)', () => {
    expect(tourSlotMaxSpotsFromOption({ maxPersons: 12 } as never)).toBeNull();
    expect(tourSlotMaxSpotsFromOption({ maxSpotsPerSlot: 0, maxPersons: 12 } as never)).toBeNull();
    expect(tourSlotMaxSpotsFromOption(null)).toBeNull();
  });
});
