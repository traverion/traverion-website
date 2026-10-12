import { describe, expect, it } from 'vitest';
import {
  STAY_HIGHLIGHT_MAX,
  STAY_HIGHLIGHT_MIN_VISIBLE,
  TOUR_EXCLUDE_MAX,
  TOUR_EXCLUDE_MIN_REQUIRED,
  TOUR_EXCLUDE_MIN_VISIBLE,
  TOUR_INCLUDE_MAX,
  TOUR_INCLUDE_MIN_REQUIRED,
  TOUR_INCLUDE_MIN_VISIBLE,
  TOUR_LINE_ITEM_MAX_LENGTH,
  TOUR_LINE_ITEM_MIN_LENGTH,
  addProgressiveSlot,
  areFilledListingLineItemsValid,
  canAddProgressiveSlot,
  clampListingLineItemInput,
  filledProgressiveCount,
  isListingLineItemLengthValid,
  normalizeProgressiveSlots,
  persistableProgressiveSlots,
  removeProgressiveSlot,
} from './listing-creation-lines';

describe('progressive listing lines', () => {
  it('shows the required minimum empty inclusion slots on a new tour', () => {
    expect(normalizeProgressiveSlots([], TOUR_INCLUDE_MIN_VISIBLE, TOUR_INCLUDE_MAX)).toEqual(['', '']);
    expect(normalizeProgressiveSlots([], TOUR_EXCLUDE_MIN_VISIBLE, TOUR_EXCLUDE_MAX)).toEqual([]);
    expect(TOUR_INCLUDE_MIN_REQUIRED).toBe(2);
    expect(TOUR_EXCLUDE_MIN_REQUIRED).toBe(0);
  });

  it('preserves existing extra lines without dropping them', () => {
    expect(normalizeProgressiveSlots(['Guide', 'Pickup', 'Photos'], 2, TOUR_INCLUDE_MAX)).toEqual([
      'Guide',
      'Pickup',
      'Photos',
    ]);
  });

  it('adds through ten inclusions and refuses an eleventh', () => {
    let slots = ['Guide', 'Pickup'];
    while (canAddProgressiveSlot(slots, TOUR_INCLUDE_MAX)) {
      slots = addProgressiveSlot(slots, TOUR_INCLUDE_MAX);
      const last = slots.length - 1;
      slots = slots.map((value, i) => (i === last ? `Item ${i + 1}` : value));
    }
    expect(slots).toHaveLength(10);
    expect(addProgressiveSlot(slots, TOUR_INCLUDE_MAX)).toHaveLength(10);
    expect(TOUR_INCLUDE_MAX).toBe(10);
  });

  it('blocks stacking empty rows until the current empty is filled', () => {
    expect(canAddProgressiveSlot(['Guide', ''], TOUR_INCLUDE_MAX)).toBe(false);
    expect(canAddProgressiveSlot(['Guide', 'Pickup'], TOUR_INCLUDE_MAX)).toBe(true);
    expect(canAddProgressiveSlot([], TOUR_EXCLUDE_MAX)).toBe(true);
    expect(canAddProgressiveSlot([''], TOUR_EXCLUDE_MAX)).toBe(false);
  });

  it('allows zero to ten exclusions and refuses an eleventh', () => {
    expect(TOUR_EXCLUDE_MAX).toBe(10);
    expect(filledProgressiveCount([])).toBe(0);
    let slots: string[] = [];
    for (let i = 0; i < 10; i++) {
      slots = addProgressiveSlot(slots, TOUR_EXCLUDE_MAX);
      slots = slots.map((value, idx) => (idx === i ? `ex-${i + 1}` : value));
    }
    expect(slots).toHaveLength(10);
    expect(addProgressiveSlot(slots, TOUR_EXCLUDE_MAX)).toHaveLength(10);
  });

  it('removes an optional middle item without clearing unrelated values', () => {
    expect(removeProgressiveSlot(['a', 'b', 'c', 'd'], 2, 2)).toEqual(['a', 'b', 'd']);
  });

  it('clears a required slot instead of deleting it', () => {
    expect(removeProgressiveSlot(['Guide', 'Pickup'], 0, 2)).toEqual(['', 'Pickup']);
  });

  it('can remove the last optional exclusion entirely', () => {
    expect(removeProgressiveSlot(['Meals'], 0, 0)).toEqual([]);
  });

  it('persists only filled lines and caps at max', () => {
    expect(persistableProgressiveSlots(['Guide', '', 'Photos', '  '], TOUR_INCLUDE_MAX)).toEqual([
      'Guide',
      'Photos',
    ]);
    expect(persistableProgressiveSlots(Array.from({ length: 12 }, (_, i) => `x${i}`), 10)).toHaveLength(10);
    expect(persistableProgressiveSlots(['', '  '], TOUR_EXCLUDE_MAX)).toEqual([]);
  });

  it('keeps stay highlights at five maximum', () => {
    expect(STAY_HIGHLIGHT_MIN_VISIBLE).toBe(2);
    expect(STAY_HIGHLIGHT_MAX).toBe(5);
  });

  it('enforces 3–60 characters per non-empty line without truncating legacy over-max values', () => {
    expect(TOUR_LINE_ITEM_MIN_LENGTH).toBe(3);
    expect(TOUR_LINE_ITEM_MAX_LENGTH).toBe(60);
    expect(isListingLineItemLengthValid('')).toBe(true);
    expect(isListingLineItemLengthValid('ab')).toBe(false);
    expect(isListingLineItemLengthValid('abc')).toBe(true);
    expect(isListingLineItemLengthValid('x'.repeat(60))).toBe(true);
    expect(isListingLineItemLengthValid('x'.repeat(61))).toBe(false);

    expect(clampListingLineItemInput('x'.repeat(61), 'Guide')).toBe('x'.repeat(60));
    const legacy = 'x'.repeat(80);
    expect(clampListingLineItemInput(legacy, legacy)).toBe(legacy);
    expect(clampListingLineItemInput('x'.repeat(70), legacy)).toBe('x'.repeat(70));

    expect(areFilledListingLineItemsValid(['Guide', 'Hot drinks'])).toBe(true);
    expect(areFilledListingLineItemsValid(['ab', 'Hot drinks'])).toBe(false);
    expect(canAddProgressiveSlot(['Guide', 'ab'], TOUR_INCLUDE_MAX)).toBe(false);

    // Persist must not silently shorten over-max saved content.
    const long = 'x'.repeat(80);
    expect(persistableProgressiveSlots([long, 'Meals'], TOUR_INCLUDE_MAX)).toEqual([long, 'Meals']);
  });
});
