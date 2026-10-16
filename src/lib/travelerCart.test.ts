import { describe, expect, it, vi } from 'vitest';
import { clearTravelerCart, loadTravelerCart, saveTravelerCart } from './travelerCart';

describe('traveler cart snapshot', () => {
  it('round-trips a selection without treating it as a price lock', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    saveTravelerCart({
      tourId: 'tour-1',
      optionId: 'opt-1',
      date: '2026-10-22',
      guests: 2,
      mix: { adult: 2 },
      startTime: '20:00',
      currency: 'EUR',
    });
    const loaded = loadTravelerCart();
    expect(loaded?.tourId).toBe('tour-1');
    expect(loaded?.optionId).toBe('opt-1');
    expect(loaded?.date).toBe('2026-10-22');
    expect(loaded?.guests).toBe(2);
    expect(loaded?.mix).toEqual({ adult: 2 });
    expect(loaded?.startTime).toBe('20:00');
    clearTravelerCart('tour-1');
    expect(loadTravelerCart()).toBeNull();
  });
});
