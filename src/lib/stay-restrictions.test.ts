import { describe, expect, it } from 'vitest';
import { normalizeStayRestrictions, stayRestrictionLines } from './stay-restrictions';

describe('stay restrictions', () => {
  it('keeps known choices and drops anything else', () => {
    expect(
      normalizeStayRestrictions({ pets: 'approval', smoking: 'not_allowed', parties: 'maybe', children: 'no' })
    ).toEqual({ pets: 'approval', smoking: 'not_allowed' });
    expect(normalizeStayRestrictions(null)).toBeUndefined();
  });

  it('writes guest-facing lines only for saved choices', () => {
    expect(stayRestrictionLines({ pets: 'not_allowed', smoking: 'not_allowed', parties: 'allowed' })).toEqual([
      'No pets',
      'No smoking',
      'Parties and events allowed',
    ]);
    expect(stayRestrictionLines(undefined)).toEqual([]);
  });
});
