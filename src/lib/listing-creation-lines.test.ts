import { describe, expect, it } from 'vitest';
import {
  STAY_HIGHLIGHT_MAX,
  STAY_HIGHLIGHT_MIN_VISIBLE,
  TOUR_EXCLUDE_MAX,
  TOUR_EXCLUDE_MIN_VISIBLE,
  TOUR_INCLUDE_MAX,
  TOUR_INCLUDE_MIN_VISIBLE,
  addProgressiveSlot,
  canAddProgressiveSlot,
  normalizeProgressiveSlots,
  persistableProgressiveSlots,
  removeProgressiveSlot,
} from './listing-creation-lines';

describe('progressive listing lines', () => {
  it('shows the required minimum empty slots on a new tour', () => {
    expect(normalizeProgressiveSlots([], TOUR_INCLUDE_MIN_VISIBLE, TOUR_INCLUDE_MAX)).toEqual(['', '']);
    expect(normalizeProgressiveSlots([], TOUR_EXCLUDE_MIN_VISIBLE, TOUR_EXCLUDE_MAX)).toEqual(['']);
  });

  it('preserves existing extra lines without dropping them', () => {
    expect(normalizeProgressiveSlots(['Guide', 'Pickup', 'Photos'], 2, 6)).toEqual([
      'Guide',
      'Pickup',
      'Photos',
    ]);
  });

  it('adds through the schema-safe maximum and refuses a seventh inclusion', () => {
    let slots = ['a', 'b'];
    while (canAddProgressiveSlot(slots, TOUR_INCLUDE_MAX)) {
      slots = addProgressiveSlot(slots, TOUR_INCLUDE_MAX);
    }
    expect(slots).toHaveLength(6);
    expect(addProgressiveSlot(slots, TOUR_INCLUDE_MAX)).toHaveLength(6);
  });

  it('removes an optional middle item without clearing unrelated values', () => {
    expect(removeProgressiveSlot(['a', 'b', 'c', 'd'], 2, 2)).toEqual(['a', 'b', 'd']);
  });

  it('clears a required slot instead of deleting it', () => {
    expect(removeProgressiveSlot(['Guide', 'Pickup'], 0, 2)).toEqual(['', 'Pickup']);
  });

  it('persists only filled lines', () => {
    expect(persistableProgressiveSlots(['Guide', '', 'Photos', '  '], 6)).toEqual(['Guide', 'Photos']);
  });

  it('keeps stay highlights at five maximum', () => {
    expect(STAY_HIGHLIGHT_MIN_VISIBLE).toBe(2);
    expect(STAY_HIGHLIGHT_MAX).toBe(5);
  });
});
