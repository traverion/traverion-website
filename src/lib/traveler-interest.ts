/**
 * First-party traveler interest signals for homepage ranking (Phase 808+).
 * Deterministic, local-only, no fingerprinting, no invented behavior.
 * Falls back to catalog order when signals are empty.
 */

export type TravelerSignalKind = 'listing_view' | 'destination_view' | 'search' | 'wishlist_save';

export type TravelerInterestSignal = {
  kind: TravelerSignalKind;
  /** listing id, destination id/label, or search query */
  key: string;
  /** tour | stay | destination | query */
  family?: 'tour' | 'stay' | 'destination' | 'query';
  at: number;
};

const STORAGE_KEY = 'traverion.traveler_interest_v1';
const MAX_SIGNALS = 80;

/** In-memory fallback for non-browser / restricted storage (tests, private mode). */
let memoryStore: TravelerInterestSignal[] | null = null;

function canUseLocalStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const k = '__tv_interest_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readRaw(): TravelerInterestSignal[] {
  if (canUseLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((row): row is TravelerInterestSignal => {
          if (!row || typeof row !== 'object') return false;
          const r = row as TravelerInterestSignal;
          return (
            typeof r.kind === 'string' &&
            typeof r.key === 'string' &&
            r.key.trim().length > 0 &&
            typeof r.at === 'number'
          );
        })
        .slice(0, MAX_SIGNALS);
    } catch {
      return memoryStore ? [...memoryStore] : [];
    }
  }
  return memoryStore ? [...memoryStore] : [];
}

function writeRaw(rows: TravelerInterestSignal[]) {
  const next = rows.slice(0, MAX_SIGNALS);
  memoryStore = next;
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — memory still holds */
  }
}

export function recordTravelerInterest(signal: Omit<TravelerInterestSignal, 'at'> & { at?: number }) {
  const key = signal.key.trim().toLowerCase();
  if (!key) return;
  const next: TravelerInterestSignal = {
    kind: signal.kind,
    key,
    family: signal.family,
    at: signal.at ?? Date.now(),
  };
  const prev = readRaw().filter((s) => !(s.kind === next.kind && s.key === next.key));
  writeRaw([next, ...prev]);
}

export function readTravelerInterestSignals(): TravelerInterestSignal[] {
  return readRaw();
}

export function clearTravelerInterestSignals() {
  memoryStore = [];
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Weight listing candidates from recent first-party signals. Higher = more relevant. */
export function scoreListingFromInterest(params: {
  listingId: string;
  city?: string | null;
  country?: string | null;
  destination?: string | null;
  family: 'tour' | 'stay';
  signals: TravelerInterestSignal[];
}): number {
  const { listingId, family, signals } = params;
  const id = listingId.toLowerCase();
  const places = [params.city, params.country, params.destination]
    .map((p) => (p || '').trim().toLowerCase())
    .filter(Boolean);

  let score = 0;
  for (const s of signals) {
    const ageDays = Math.max(0, (Date.now() - s.at) / (1000 * 60 * 60 * 24));
    const recency = Math.max(0.15, 1 - ageDays / 45);
    if (s.kind === 'listing_view' && s.key === id) score += 8 * recency;
    if (s.kind === 'wishlist_save' && s.key === id) score += 12 * recency;
    if (s.kind === 'destination_view' && places.some((p) => p.includes(s.key) || s.key.includes(p))) {
      score += 5 * recency;
    }
    if (s.kind === 'search') {
      if (places.some((p) => p.includes(s.key) || s.key.includes(p))) score += 3 * recency;
      if (s.family === family) score += 1 * recency;
    }
  }
  return score;
}

export function sortListingsByInterest<T extends { id: string }>(
  listings: T[],
  scoreOf: (item: T) => number
): T[] {
  return [...listings]
    .map((item, index) => ({ item, index, score: scoreOf(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}

/** Top destination keys from signals — for honest “Because you explored …” copy. */
export function topDestinationInterestLabel(signals: TravelerInterestSignal[]): string | null {
  const counts = new Map<string, number>();
  for (const s of signals) {
    if (s.kind !== 'destination_view' && s.kind !== 'search') continue;
    const label = s.key.trim();
    if (label.length < 2) continue;
    counts.set(label, (counts.get(label) || 0) + (s.kind === 'destination_view' ? 3 : 1));
  }
  let best: string | null = null;
  let bestScore = 0;
  for (const [k, v] of counts) {
    if (v > bestScore) {
      best = k;
      bestScore = v;
    }
  }
  if (!best || bestScore < 2) return null;
  // Title-case lightly for UI
  return best.replace(/\b\w/g, (c) => c.toUpperCase());
}
