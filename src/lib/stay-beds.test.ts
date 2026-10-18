import { describe, expect, it } from 'vitest';
import { stayBedCount, stayBedSummary, stayCapacityWarning, staySleepCapacity } from './stay-beds';

describe('stay bed arrangements', () => {
  it('counts beds and sleeping places separately', () => {
    const mix = { queen: 1, single: 2 };
    expect(stayBedCount(mix)).toBe(3);
    expect(staySleepCapacity(mix)).toBe(4);
    expect(stayBedSummary(mix)).toBe('2 single beds, 1 queen bed');
  });

  it('warns when 8 guests share one single bed and allows two people on one double', () => {
    expect(stayCapacityWarning(8, { single: 1 }, 1)).toMatch(/please review/i);
    expect(stayCapacityWarning(8, undefined, 1)).toMatch(/please review/i);
    expect(stayCapacityWarning(2, { double: 1 }, 1)).toBeNull();
  });
});
