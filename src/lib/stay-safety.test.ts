import { describe, expect, it } from 'vitest';
import { normalizeStaySafetyConsiderations, staySafetyConsiderationLines } from './stay-safety';

describe('stay safety considerations', () => {
  it('keeps known ids in catalog order and drops unknowns', () => {
    expect(normalizeStaySafetyConsiderations(['other_hazards', 'open_water', 'open_water', 'nope'])).toEqual([
      'open_water',
      'other_hazards',
    ]);
    expect(normalizeStaySafetyConsiderations(null)).toEqual([]);
  });

  it('writes guest-facing lines only for selected considerations', () => {
    expect(staySafetyConsiderationLines(['uneven_access'])).toEqual(['Steep stairs or uneven surfaces']);
    expect(staySafetyConsiderationLines([])).toEqual([]);
  });
});
