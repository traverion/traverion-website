/**
 * Saved booking selection. This is not an inventory hold and does not lock a price.
 * Availability and the quote are checked again before checkout and before payment.
 */
const KEY = 'traverion_traveler_cart_v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export type TravelerCartSnapshot = {
  v: 1;
  tourId: string;
  optionId: string;
  date: string;
  guests: number;
  mix: Record<string, number> | null;
  startTime?: string;
  currency?: string;
  savedAt: string;
};

export function loadTravelerCart(): TravelerCartSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TravelerCartSnapshot>;
    if (parsed.v !== 1 || typeof parsed.tourId !== 'string' || !parsed.tourId) return null;
    const saved = parsed.savedAt ? Date.parse(parsed.savedAt) : 0;
    if (!Number.isFinite(saved) || Date.now() - saved > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    const guests = typeof parsed.guests === 'number' && parsed.guests >= 1 ? Math.min(99, Math.floor(parsed.guests)) : 1;
    return {
      v: 1,
      tourId: parsed.tourId,
      optionId: typeof parsed.optionId === 'string' ? parsed.optionId : '',
      date: typeof parsed.date === 'string' ? parsed.date : '',
      guests,
      mix: parsed.mix && typeof parsed.mix === 'object' ? parsed.mix : null,
      startTime: typeof parsed.startTime === 'string' ? parsed.startTime : undefined,
      currency: typeof parsed.currency === 'string' ? parsed.currency : undefined,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveTravelerCart(input: Omit<TravelerCartSnapshot, 'v' | 'savedAt'>): void {
  try {
    const payload: TravelerCartSnapshot = {
      v: 1,
      savedAt: new Date().toISOString(),
      tourId: input.tourId,
      optionId: input.optionId,
      date: input.date,
      guests: Math.max(1, Math.min(99, Math.floor(input.guests) || 1)),
      mix: input.mix,
      startTime: input.startTime,
      currency: input.currency,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function clearTravelerCart(tourId?: string): void {
  try {
    if (!tourId) {
      localStorage.removeItem(KEY);
      return;
    }
    const current = loadTravelerCart();
    if (!current || current.tourId === tourId) localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
