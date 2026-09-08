import { describe, expect, it } from 'vitest';
import {
  headlineStartingAmount,
  participantKindFromName,
  participantPriceSummary,
  pickHeadlineOption,
} from './headline-price';

describe('headline price', () => {
  it('does not treat child as the catalog from-price when adult exists', () => {
    const pick = pickHeadlineOption([
      { name: 'Child', priceUsd: 149 },
      { name: 'Adult', priceUsd: 189 },
    ]);
    expect(pick.mode).toBe('participant-standard');
    expect(pick.option?.priceUsd).toBe(189);
    expect(pick.qualifier).toBe('adult');
    expect(headlineStartingAmount(pick.option ? [pick.option, { name: 'Child', priceUsd: 149 }] : [])).toBe(189);
    expect(
      headlineStartingAmount([
        { name: 'Child', priceUsd: 149 },
        { name: 'Adult', priceUsd: 189 },
      ])
    ).toBe(189);
  });

  it('still uses From-minimum for product variants', () => {
    const pick = pickHeadlineOption([
      { name: 'Small group', priceUsd: 189 },
      { name: 'Private tour', priceUsd: 490 },
    ]);
    expect(pick.mode).toBe('from-minimum');
    expect(pick.option?.priceUsd).toBe(189);
    expect(pick.qualifier).toBeNull();
  });

  it('qualifies a child-only menu instead of a generic from-price', () => {
    const pick = pickHeadlineOption([
      { name: 'Child', priceUsd: 149 },
      { name: 'Infant', priceUsd: 0 },
    ]);
    expect(pick.mode).toBe('single');
    expect(pick.qualifier).toBe('child');
  });

  it('builds a participant summary without hardcoding a listing', () => {
    expect(
      participantPriceSummary(
        [
          { name: 'Adult', priceUsd: 189 },
          { name: 'Child', priceUsd: 149 },
        ],
        (n) => `€${n}`
      )
    ).toBe('Adult €189 · Child €149');
  });

  it('classifies generic participant labels', () => {
    expect(participantKindFromName('Adult')).toBe('adult');
    expect(participantKindFromName('Children (7–15)')).toBe('reduced');
    expect(participantKindFromName('Senior')).toBe('reduced');
    expect(participantKindFromName('Private boat')).toBe('other');
  });
});
