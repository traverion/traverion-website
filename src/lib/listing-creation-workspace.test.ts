import { describe, expect, it } from 'vitest';
import {
  listingCreationNavItems,
  listingCreationProgressCopy,
  listingCreationStepState,
} from './listing-creation-workspace';

describe('listingCreationStepState', () => {
  it('marks the current step current even when it is already satisfied', () => {
    expect(listingCreationStepState(0, 0, true)).toBe('current');
  });

  it('marks earlier satisfied steps complete', () => {
    expect(listingCreationStepState(0, 1, true)).toBe('complete');
  });

  it('marks unfinished non-current steps upcoming, not warnings', () => {
    expect(listingCreationStepState(2, 0, false)).toBe('upcoming');
    expect(listingCreationStepState(1, 2, false)).toBe('upcoming');
  });
});

describe('listingCreationProgressCopy', () => {
  it('describes an empty start without implying an error', () => {
    expect(listingCreationProgressCopy(0, 5)).toBe('5 steps');
  });

  it('reports a truthful complete count', () => {
    expect(listingCreationProgressCopy(1, 5)).toBe('1 of 5 complete');
    expect(listingCreationProgressCopy(5, 5)).toBe('All steps complete');
  });
});

describe('listingCreationNavItems', () => {
  it('builds complete / current / upcoming from real satisfaction', () => {
    const items = listingCreationNavItems(
      [
        { id: 'the_experience', label: 'Basics' },
        { id: 'practical', label: 'Details' },
        { id: 'cost_options', label: 'Options' },
        { id: 'photos', label: 'Photos' },
        { id: 'review', label: 'Review' },
      ],
      1,
      (index) => index === 0
    );
    expect(items.map((item) => item.state)).toEqual([
      'complete',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });
});
