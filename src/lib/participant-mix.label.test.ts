import { describe, expect, it } from 'vitest';
import {
  formatBookingParticipantsLabel,
  formatMixSummary,
  formatParticipantQuantityLabel,
} from './participant-mix';

describe('formatParticipantQuantityLabel', () => {
  it('keeps singular labels at quantity 1', () => {
    expect(formatParticipantQuantityLabel(1, 'Adult')).toBe('1 Adult');
    expect(formatParticipantQuantityLabel(1, 'Child')).toBe('1 Child');
  });

  it('pluralizes regular and irregular category labels', () => {
    expect(formatParticipantQuantityLabel(2, 'Adult')).toBe('2 Adults');
    expect(formatParticipantQuantityLabel(2, 'Child')).toBe('2 Children');
    expect(formatParticipantQuantityLabel(3, 'Person')).toBe('3 People');
    expect(formatParticipantQuantityLabel(2, 'Seniors')).toBe('2 Seniors');
  });
});

describe('formatBookingParticipantsLabel', () => {
  it('pluralizes guest_breakdown rows for partner and traveler surfaces', () => {
    expect(
      formatBookingParticipantsLabel({
        guests: 3,
        guest_breakdown: [
          { label: 'Adult', quantity: 2 },
          { label: 'Child', quantity: 1 },
        ],
      })
    ).toBe('2 Adults · 1 Child');
  });

  it('falls back to guest count when breakdown is empty', () => {
    expect(formatBookingParticipantsLabel({ guests: 2 })).toBe('2 guests');
    expect(formatBookingParticipantsLabel({ guests: 1 })).toBe('1 guest');
  });
});

describe('formatMixSummary', () => {
  it('matches booking row pluralization', () => {
    expect(
      formatMixSummary([
        {
          categoryId: 'a',
          label: 'Adult',
          kind: 'adult',
          quantity: 2,
          unitPrice: 100,
          ageMin: null,
          ageMax: null,
          requiresAdult: false,
          countsTowardCapacity: true,
        },
        {
          categoryId: 'c',
          label: 'Child',
          kind: 'child',
          quantity: 1,
          unitPrice: 50,
          ageMin: null,
          ageMax: null,
          requiresAdult: true,
          countsTowardCapacity: true,
        },
      ])
    ).toBe('2 Adults · 1 Child');
  });
});
