import { normalizeBookingCutoffHours } from './tour-departure-cutoff';

/** Max date-specific capacity override (Availability workspace). */
export const SLOT_OVERRIDE_CAPACITY_MAX = 99;

export type ListingSlotOverride = {
  date: string;
  startTimeHm: string;
  /** 1–99 when set; omit to inherit schedule capacity. */
  capacity?: number;
  /** 0–168 when set; omit to inherit option/listing cutoff. */
  cutoffHours?: number;
};

export function slotOverrideKey(date: string, startTimeHm: string): string {
  const day = String(date ?? '').slice(0, 10);
  const hm = normalizeStartTimeHm(startTimeHm);
  return `${day}|${hm}`;
}

export function normalizeStartTimeHm(raw: string | null | undefined): string {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function parseSlotOverrides(raw: unknown): ListingSlotOverride[] {
  if (!Array.isArray(raw)) return [];
  const out: ListingSlotOverride[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const date = String(o.date ?? '').slice(0, 10);
    const startTimeHm = normalizeStartTimeHm(
      o.startTimeHm == null ? (o.start_time_hm as string | undefined) : String(o.startTimeHm)
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTimeHm) continue;
    const entry: ListingSlotOverride = { date, startTimeHm };
    if (o.capacity != null && o.capacity !== '') {
      const n = Math.floor(Number(o.capacity));
      if (Number.isFinite(n) && n >= 0 && n <= SLOT_OVERRIDE_CAPACITY_MAX) {
        entry.capacity = n;
      }
    }
    if (o.cutoffHours != null && o.cutoffHours !== '') {
      const n = Math.floor(Number(o.cutoffHours));
      if (Number.isFinite(n) && n >= 0 && n <= 168) {
        entry.cutoffHours = normalizeBookingCutoffHours(n);
      }
    }
    if (entry.capacity == null && entry.cutoffHours == null) continue;
    out.push(entry);
  }
  return out;
}

export function slotOverridesToDb(list: ListingSlotOverride[] | undefined): ListingSlotOverride[] | undefined {
  if (!list?.length) return undefined;
  const cleaned = parseSlotOverrides(list);
  return cleaned.length ? cleaned : undefined;
}

export function findSlotOverride(
  list: ListingSlotOverride[] | undefined,
  date: string,
  startTimeHm: string
): ListingSlotOverride | undefined {
  const key = slotOverrideKey(date, startTimeHm);
  return (list ?? []).find((o) => slotOverrideKey(o.date, o.startTimeHm) === key);
}

export function resolveSlotCapacity(params: {
  scheduleCapacity: number;
  override?: ListingSlotOverride | null;
}): number {
  const base = Math.max(0, Math.floor(params.scheduleCapacity));
  if (params.override?.capacity == null) return base;
  return Math.max(0, Math.min(SLOT_OVERRIDE_CAPACITY_MAX, Math.floor(params.override.capacity)));
}

export function resolveSlotCutoffHours(params: {
  baselineCutoffHours: number;
  override?: ListingSlotOverride | null;
}): number {
  if (params.override?.cutoffHours != null) {
    return normalizeBookingCutoffHours(params.override.cutoffHours);
  }
  return normalizeBookingCutoffHours(params.baselineCutoffHours);
}

/** Upsert one date+time override. Empty fields remove that field; empty entry removes the row. */
export function upsertSlotOverride(
  list: ListingSlotOverride[] | undefined,
  next: ListingSlotOverride
): ListingSlotOverride[] {
  const date = String(next.date ?? '').slice(0, 10);
  const startTimeHm = normalizeStartTimeHm(next.startTimeHm);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTimeHm) return parseSlotOverrides(list);

  const key = slotOverrideKey(date, startTimeHm);
  const existing = parseSlotOverrides(list);
  const prior = existing.find((o) => slotOverrideKey(o.date, o.startTimeHm) === key);
  const prev = existing.filter((o) => slotOverrideKey(o.date, o.startTimeHm) !== key);
  const entry: ListingSlotOverride = {
    date,
    startTimeHm,
    capacity: prior?.capacity,
    cutoffHours: prior?.cutoffHours,
  };
  if ('capacity' in next) {
    if (next.capacity == null) delete entry.capacity;
    else {
      const n = Math.floor(Number(next.capacity));
      if (Number.isFinite(n) && n >= 0 && n <= SLOT_OVERRIDE_CAPACITY_MAX) entry.capacity = n;
    }
  }
  if ('cutoffHours' in next) {
    if (next.cutoffHours == null) delete entry.cutoffHours;
    else {
      const n = Math.floor(Number(next.cutoffHours));
      if (Number.isFinite(n) && n >= 0 && n <= 168) {
        entry.cutoffHours = normalizeBookingCutoffHours(n);
      }
    }
  }
  if (entry.capacity == null && entry.cutoffHours == null) return prev;
  prev.push(entry);
  prev.sort((a, b) => slotOverrideKey(a.date, a.startTimeHm).localeCompare(slotOverrideKey(b.date, b.startTimeHm)));
  return prev;
}

export function removeSlotOverrideFields(
  list: ListingSlotOverride[] | undefined,
  date: string,
  startTimeHm: string,
  fields: { capacity?: boolean; cutoffHours?: boolean }
): ListingSlotOverride[] {
  const key = slotOverrideKey(date, startTimeHm);
  const out: ListingSlotOverride[] = [];
  for (const o of parseSlotOverrides(list)) {
    if (slotOverrideKey(o.date, o.startTimeHm) !== key) {
      out.push(o);
      continue;
    }
    const next: ListingSlotOverride = { date: o.date, startTimeHm: o.startTimeHm };
    if (!fields.capacity && o.capacity != null) next.capacity = o.capacity;
    if (!fields.cutoffHours && o.cutoffHours != null) next.cutoffHours = o.cutoffHours;
    if (next.capacity != null || next.cutoffHours != null) out.push(next);
  }
  return out;
}

export function clearSlotOverridesForDates(
  list: ListingSlotOverride[] | undefined,
  dates: string[],
  fields: { capacity?: boolean; cutoffHours?: boolean; all?: boolean }
): ListingSlotOverride[] {
  const dateSet = new Set(dates.map((d) => d.slice(0, 10)));
  if (fields.all) {
    return parseSlotOverrides(list).filter((o) => !dateSet.has(o.date));
  }
  const out: ListingSlotOverride[] = [];
  for (const o of parseSlotOverrides(list)) {
    if (!dateSet.has(o.date)) {
      out.push(o);
      continue;
    }
    const next: ListingSlotOverride = { date: o.date, startTimeHm: o.startTimeHm };
    if (!fields.capacity && o.capacity != null) next.capacity = o.capacity;
    if (!fields.cutoffHours && o.cutoffHours != null) next.cutoffHours = o.cutoffHours;
    if (next.capacity != null || next.cutoffHours != null) out.push(next);
  }
  return out;
}

/** Booked / Capacity display (never remaining / capacity). */
export function bookedCapacityLabel(booked: number, capacity: number): string {
  const b = Math.max(0, Math.floor(booked));
  const c = Math.max(0, Math.floor(capacity));
  return `${b}/${c}`;
}
