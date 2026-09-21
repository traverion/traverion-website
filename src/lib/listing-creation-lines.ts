/** Progressive repeatable lines (inclusions, exclusions, stay highlights). Empty slots persist as omitted. */

export const TOUR_INCLUDE_MIN_VISIBLE = 2;
export const TOUR_INCLUDE_MAX = 6;
export const TOUR_EXCLUDE_MIN_VISIBLE = 1;
export const TOUR_EXCLUDE_MAX = 6;
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

export function canAddProgressiveSlot(slots: readonly string[], max: number): boolean {
  return slots.length < max;
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
  if (index < minVisible) {
    return slots.map((value, i) => (i === index ? '' : value));
  }
  const next = slots.filter((_, i) => i !== index);
  return normalizeProgressiveSlots(next, minVisible, Math.max(minVisible, slots.length));
}

export function persistableProgressiveSlots(slots: readonly string[], max: number): string[] {
  return slots.map((s) => s.trim()).filter(Boolean).slice(0, max);
}
