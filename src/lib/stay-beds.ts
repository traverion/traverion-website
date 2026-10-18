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

export type StayBedPlacement = { kind: StayBedKind; count: number };

export type StaySleepingArea = {
  id: string;
  name: string;
  beds: StayBedPlacement[];
};

export function normalizeStaySleepingAreas(raw: unknown): StaySleepingArea[] {
  if (!Array.isArray(raw)) return [];
  const out: StaySleepingArea[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim().slice(0, 80) : '';
    if (!id) continue;
    const beds: StayBedPlacement[] = [];
    if (Array.isArray(row.beds)) {
      for (const bed of row.beds) {
        if (bed == null || typeof bed !== 'object') continue;
        const b = bed as Record<string, unknown>;
        const kind = typeof b.kind === 'string' && KIND_IDS.has(b.kind) ? (b.kind as StayBedKind) : null;
        const count = typeof b.count === 'number' ? Math.floor(b.count) : 0;
        if (!kind || count < 1 || count > 20) continue;
        beds.push({ kind, count });
      }
    }
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 40) : `Sleeping area ${out.length + 1}`,
      beds,
    });
    if (out.length >= 20) break;
  }
  return out;
}

export function stayMixFromAreas(areas: readonly StaySleepingArea[]): StayBedMix {
  const mix: StayBedMix = {};
  for (const area of areas) {
    for (const bed of area.beds) {
      mix[bed.kind] = (mix[bed.kind] ?? 0) + bed.count;
    }
  }
  return stayBedCount(mix) > 0 ? mix : {};
}

/** Older listings stored only a count per bed type. Show that as one sleeping area. */
export function stayAreasFromMix(mix: StayBedMix | null | undefined): StaySleepingArea[] {
  const beds = STAY_BED_KINDS.flatMap((kind) => {
    const count = mix?.[kind.id] ?? 0;
    return count > 0 ? [{ kind: kind.id, count }] : [];
  });
  if (beds.length === 0) return [];
  return [{ id: 'sleeping-saved', name: 'Sleeping area', beds }];
}

/** Warn when declared guests exceed what the beds can sleep. Does not block a draft save. */
export function stayCapacityWarning(guests: number, mix: StayBedMix | null | undefined): string | null {
  if (!Number.isFinite(guests) || guests < 1) return null;
  const counted = stayBedCount(mix);
  if (counted < 1) {
    return 'Add each bed guests can sleep in. A bedroom count does not set sleeping capacity.';
  }
  const sleeps = staySleepCapacity(mix);
  if (guests > sleeps) {
    return `This accommodation allows ${guests} guests, but the selected beds currently sleep only ${sleeps}. Add sleeping arrangements or reduce maximum occupancy.`;
  }
  return null;
}

/**
 * Keep typed beds when a new empty sleeping area is added beside a saved bed mix.
 * Clearing every bed in an area that already had types removes those types.
 */
export function applySleepingAreas(
  previous: { sleepingAreas: StaySleepingArea[]; bedMix: StayBedMix; beds: number | null },
  next: StaySleepingArea[]
): { sleepingAreas: StaySleepingArea[]; bedMix: StayBedMix; beds: number | null } {
  const mix = stayMixFromAreas(next);
  const count = stayBedCount(mix);
  if (count > 0) return { sleepingAreas: next, bedMix: mix, beds: count };
  const previousTyped = stayBedCount(previous.bedMix) > 0;
  const previousAreasTyped = previous.sleepingAreas.some((area) => area.beds.length > 0);
  if (previousTyped && !previousAreasTyped) {
    return { sleepingAreas: next, bedMix: previous.bedMix, beds: stayBedCount(previous.bedMix) };
  }
  return { sleepingAreas: next, bedMix: {}, beds: previousTyped ? null : previous.beds };
}
