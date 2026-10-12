/** Progressive repeatable lines (inclusions, exclusions, stay highlights). Empty slots persist as omitted. */

export const TOUR_INCLUDE_MIN_VISIBLE = 2;
export const TOUR_INCLUDE_MIN_REQUIRED = 2;
export const TOUR_INCLUDE_MAX = 10;
/** Exclusions are optional — start with no rows until the partner adds one. */
export const TOUR_EXCLUDE_MIN_VISIBLE = 0;
export const TOUR_EXCLUDE_MIN_REQUIRED = 0;
export const TOUR_EXCLUDE_MAX = 10;
export const STAY_HIGHLIGHT_MIN_VISIBLE = 2;
export const STAY_HIGHLIGHT_MAX = 5;

export function normalizeProgressiveSlots(
  fromDb: string[] | undefined | null,
  minVisible: number,
  max: number
): string[] {
  const base = Array.isArray(fromDb) ? fromDb.map((s) => String(s ?? '')) : [];
  const out = base.slice(0, max);
  while (out.length < minVisible) out.push('');
  return out;
}

/** Allow another row only when under max and every existing row has content (no stacked empties). */
export function canAddProgressiveSlot(slots: readonly string[], max: number): boolean {
  if (slots.length >= max) return false;
  if (slots.some((s) => !String(s ?? '').trim())) return false;
  return true;
}

export function addProgressiveSlot(slots: readonly string[], max: number): string[] {
  if (!canAddProgressiveSlot(slots, max)) return [...slots];
  return [...slots, ''];
}

export function removeProgressiveSlot(
  slots: readonly string[],
  index: number,
  minVisible: number
): string[] {
  if (index < 0 || index >= slots.length) return [...slots];
  if (index < minVisible) {
    return slots.map((value, i) => (i === index ? '' : value));
  }
  const next = slots.filter((_, i) => i !== index);
  return normalizeProgressiveSlots(next, minVisible, Math.max(minVisible, slots.length));
}

/** Persist filled lines only, capped at max (empty optional rows ignored). */
export function persistableProgressiveSlots(slots: readonly string[], max: number): string[] {
  return slots.map((s) => s.trim()).filter(Boolean).slice(0, max);
}

export function filledProgressiveCount(slots: readonly string[]): number {
  return slots.map((s) => s.trim()).filter(Boolean).length;
}
