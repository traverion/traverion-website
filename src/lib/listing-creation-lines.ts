/** Progressive repeatable lines (inclusions, exclusions, stay highlights). Empty slots persist as omitted. */

export const TOUR_INCLUDE_MIN_VISIBLE = 2;
export const TOUR_INCLUDE_MIN_REQUIRED = 2;
export const TOUR_INCLUDE_MAX = 10;
/** Exclusions are optional — start with no rows until the partner adds one. */
export const TOUR_EXCLUDE_MIN_VISIBLE = 0;
export const TOUR_EXCLUDE_MIN_REQUIRED = 0;
export const TOUR_EXCLUDE_MAX = 10;
/** Stay highlights start empty. A row appears only after Add highlight. */
export const STAY_HIGHLIGHT_MIN_VISIBLE = 0;
export const STAY_HIGHLIGHT_MAX = 5;

/** Per inclusion/exclusion line — empty rows are ignored; filled rows must meet this floor. */
export const TOUR_LINE_ITEM_MIN_LENGTH = 3;
/** Per inclusion/exclusion line ceiling (replaces any earlier 100-char proposal). */
export const TOUR_LINE_ITEM_MAX_LENGTH = 60;
/** @deprecated Counters stay neutral until over max; kept for tests/compat. */
export const TOUR_LINE_ITEM_NEAR_LIMIT_LENGTH = 50;

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

/**
 * Clamp typing/paste for a single line without silently shortening legacy values already over max.
 */
export function clampListingLineItemInput(next: string, previous: string): string {
  if (next.length <= TOUR_LINE_ITEM_MAX_LENGTH) return next;
  if (previous.length > TOUR_LINE_ITEM_MAX_LENGTH) {
    return next.length < previous.length ? next : previous;
  }
  return next.slice(0, TOUR_LINE_ITEM_MAX_LENGTH);
}

/** Empty is allowed in the editor; non-empty must be within 3–60 (trimmed). */
export function isListingLineItemLengthValid(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return t.length >= TOUR_LINE_ITEM_MIN_LENGTH && t.length <= TOUR_LINE_ITEM_MAX_LENGTH;
}

/** Every non-empty filled line is within bounds (empty slots ignored). */
export function areFilledListingLineItemsValid(slots: readonly string[]): boolean {
  return slots.every((line) => isListingLineItemLengthValid(line));
}

/** Allow another row only when under max, no empties, and every filled line is length-valid. */
export function canAddProgressiveSlot(slots: readonly string[], max: number): boolean {
  if (slots.length >= max) return false;
  if (slots.some((s) => !String(s ?? '').trim())) return false;
  if (!areFilledListingLineItemsValid(slots)) return false;
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
