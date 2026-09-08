import { describe, expect, it } from 'vitest';
import { formatStayAmenityLabel, stayAmenityDisplayList } from './stay-amenities';

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

  it('does not invent amenities and drops blanks', () => {
    expect(stayAmenityDisplayList(['Wifi', 'kitchen', '', '  '])).toEqual(['Wifi', 'Kitchen']);
    expect(stayAmenityDisplayList(['kitchen', 'Kitchen'])).toEqual(['Kitchen']);
    expect(stayAmenityDisplayList(null)).toEqual([]);
  });
});
