import { describe, expect, it } from 'vitest';
import {
  stayHighlightAmenityHints,
  staySameDayTurnoverHours,
  staySelfCheckInConflict,
  stayTurnoverAdvisory,
} from './stay-creator-consistency';

describe('stay creator consistency hints', () => {
  it('flags Self check-in when arrival does not match', () => {
    expect(staySelfCheckInConflict(['Self check-in'], '')).toMatch(/arrival screen/);
    expect(staySelfCheckInConflict(['Self check-in'], 'host')).toMatch(/arrival method/);
    expect(staySelfCheckInConflict(['Self check-in'], 'self')).toBeNull();
    expect(staySelfCheckInConflict(['Self check-in'], 'lockbox')).toBeNull();
    expect(staySelfCheckInConflict(['Wifi'], 'host')).toBeNull();
  });

  it('flags highlight claims that amenities do not support', () => {
    expect(stayHighlightAmenityHints(['Private sauna', 'Scenic views'], ['Wifi'])).toEqual([
      '"Private sauna" mentions a sauna, but Sauna is not selected in amenities.',
    ]);
    expect(stayHighlightAmenityHints(['Private sauna'], ['Sauna'])).toEqual([]);
    expect(stayHighlightAmenityHints(['Outdoor hot tub'], [])).toHaveLength(1);
  });

  it('advises when same-day turnover is unusually short', () => {
    expect(staySameDayTurnoverHours('15:00', '11:00')).toBe(4);
    expect(staySameDayTurnoverHours('12:00', '11:00')).toBe(1);
    expect(stayTurnoverAdvisory('15:00', '11:00')).toBeNull();
    expect(stayTurnoverAdvisory('12:00', '11:00')).toMatch(/tight for cleaning/);
    expect(stayTurnoverAdvisory('10:00', '11:00')).toMatch(/not after checkout/);
  });
});
