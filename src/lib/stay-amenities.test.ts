import { describe, expect, it } from 'vitest';
import { STAY_AMENITY_GROUPS, STAY_AMENITY_PRESETS, formatStayAmenityLabel, stayAmenityDisplayList } from './stay-amenities';

describe('stay amenity display labels', () => {
  it('uses preset casing for known ticks, including lowercase stored tokens', () => {
    expect(formatStayAmenityLabel('kitchen')).toBe('Kitchen');
    expect(formatStayAmenityLabel('Wifi')).toBe('Wifi');
    expect(formatStayAmenityLabel('wifi')).toBe('Wifi');
    expect(formatStayAmenityLabel('heating')).toBe('Heating');
    expect(formatStayAmenityLabel('tv')).toBe('TV');
  });

  it('sentence-cases custom facts without inventing amenities', () => {
    expect(formatStayAmenityLabel('washing machine')).toBe('Washing machine');
    expect(formatStayAmenityLabel('street parking')).toBe('Street parking');
    expect(formatStayAmenityLabel('  sauna  ')).toBe('Sauna');
  });

  it('shows Self check-in under arrival and access', () => {
    const arrival = STAY_AMENITY_GROUPS.find((group) => group.label === 'Arrival and access');
    const parking = STAY_AMENITY_GROUPS.find((group) => group.label === 'Parking and transport');
    expect(arrival?.items).toEqual(['Self check-in']);
    expect(parking?.items).not.toContain('Self check-in');
    expect(STAY_AMENITY_PRESETS).toContain('Self check-in');
  });

  it('groups every preset once and adds none', () => {
    const grouped = STAY_AMENITY_GROUPS.flatMap((group) => [...group.items]);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...STAY_AMENITY_PRESETS].sort());
  });

  it('does not invent amenities and drops blanks', () => {
    expect(stayAmenityDisplayList(['Wifi', 'kitchen', '', '  '])).toEqual(['Wifi', 'Kitchen']);
    expect(stayAmenityDisplayList(['kitchen', 'Kitchen'])).toEqual(['Kitchen']);
    expect(stayAmenityDisplayList(null)).toEqual([]);
    expect(stayAmenityDisplayList(['Step-free entrance', 'step-free access'])).toEqual(['Step-free entrance']);
  });
});
