/** Bed types for one accommodation. A bunk or double is not treated as one guest. */

export const STAY_BED_KINDS = [
  { id: 'single', label: 'Single bed', sleeps: 1 },
  { id: 'double', label: 'Double bed', sleeps: 2 },
  { id: 'queen', label: 'Queen bed', sleeps: 2 },
  { id: 'king', label: 'King bed', sleeps: 2 },
  { id: 'sofa', label: 'Sofa bed', sleeps: 1 },
  { id: 'bunk', label: 'Bunk bed', sleeps: 2 },
] as const;

export type StayBedKind = (typeof STAY_BED_KINDS)[number]['id'];
export type StayBedMix = Partial<Record<StayBedKind, number>>;

const KIND_IDS = new Set<string>(STAY_BED_KINDS.map((kind) => kind.id));

export function normalizeStayBedMix(raw: unknown): StayBedMix | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: StayBedMix = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KIND_IDS.has(key)) continue;
    const n = typeof value === 'number' ? Math.floor(value) : Number.NaN;
    if (n >= 1 && n <= 30) out[key as StayBedKind] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function stayBedCount(mix: StayBedMix | null | undefined): number {
  return STAY_BED_KINDS.reduce((sum, kind) => sum + (mix?.[kind.id] ?? 0), 0);
}

export function staySleepCapacity(mix: StayBedMix | null | undefined): number {
  return STAY_BED_KINDS.reduce((sum, kind) => sum + (mix?.[kind.id] ?? 0) * kind.sleeps, 0);
}

export function stayBedSummary(mix: StayBedMix | null | undefined): string {
  const parts = STAY_BED_KINDS.flatMap((kind) => {
    const count = mix?.[kind.id] ?? 0;
    if (count < 1) return [];
    return [`${count} ${kind.label.toLowerCase()}${count === 1 ? '' : 's'}`];
  });
  return parts.join(', ');
}

/** Warn when declared guests exceed what the beds can reasonably sleep. Does not block a save. */
export function stayCapacityWarning(
  guests: number,
  mix: StayBedMix | null | undefined,
  fallbackBeds: number
): string | null {
  if (!Number.isFinite(guests) || guests < 1) return null;
  const counted = stayBedCount(mix);
  if (counted > 0 && guests > staySleepCapacity(mix)) {
    return 'Your guest capacity may be higher than the sleeping arrangements you have entered. Please review.';
  }
  if (counted === 0 && fallbackBeds >= 1 && guests > fallbackBeds * 2) {
    return 'Your guest capacity may be higher than the sleeping arrangements you have entered. Please review.';
  }
  return null;
}
