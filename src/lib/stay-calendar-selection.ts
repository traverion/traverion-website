/**
 * Stay Calendar month date-range selection helpers.
 * Continuous [start, end] ranges; occupancy guards stay outside this module.
 */
import { eachIsoInRange } from './stay-calendar-workspace';

export type StayDateRange = { start: string; end: string };

export function normalizeStayDateRange(a: string, b: string): StayDateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function stayDateRangesEqual(a: StayDateRange | null, b: StayDateRange | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

/** Tap/click selection: first tap anchors; second tap extends or clears same-day. */
export function applyStayDateTap(
  prev: StayDateRange | null,
  iso: string
): StayDateRange | null {
  if (!prev) return { start: iso, end: iso };
  if (prev.start === iso && prev.end === iso) return null;
  // New tap while a multi-day range is active → start a fresh single-day selection.
  if (prev.start !== prev.end) return { start: iso, end: iso };
  return normalizeStayDateRange(prev.start, iso);
}

/** Drag/preview from an anchor night to the hovered/current night. */
export function stayDateRangeFromDrag(anchor: string, current: string): StayDateRange {
  return normalizeStayDateRange(anchor, current);
}

export function stayDateInRange(iso: string, range: StayDateRange | null): boolean {
  if (!range) return false;
  return iso >= range.start && iso <= range.end;
}

export function stayDateRangeEdge(
  iso: string,
  range: StayDateRange | null
): 'start' | 'end' | 'both' | 'middle' | null {
  if (!range || !stayDateInRange(iso, range)) return null;
  if (range.start === range.end) return 'both';
  if (iso === range.start) return 'start';
  if (iso === range.end) return 'end';
  return 'middle';
}

export function formatStayRangeLabel(range: StayDateRange): string {
  const nights = eachIsoInRange(range.start, range.end).length;
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  if (range.start === range.end) {
    return `${fmt(range.start)} · 1 night`;
  }
  const sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7);
  if (sameMonth) {
    const startDay = Number(range.start.slice(8));
    const endLabel = new Date(`${range.end}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
    });
    return `${startDay}–${endLabel} · ${nights} nights`;
  }
  return `${fmt(range.start)} – ${fmt(range.end)} · ${nights} nights`;
}

export type StayRangeActionPlan = {
  blockable: string[];
  unblockable: string[];
  occupied: string[];
  /** Primary action when both exist prefers block of free nights. */
  primary: 'block' | 'unblock' | 'none';
  note: string | null;
};

export function planStayRangeActions(params: {
  range: StayDateRange;
  canBlock: (iso: string) => boolean;
  canUnblock: (iso: string) => boolean;
}): StayRangeActionPlan {
  const dates = eachIsoInRange(params.range.start, params.range.end);
  const blockable: string[] = [];
  const unblockable: string[] = [];
  const occupied: string[] = [];
  for (const iso of dates) {
    if (params.canUnblock(iso)) unblockable.push(iso);
    else if (params.canBlock(iso)) blockable.push(iso);
    else occupied.push(iso);
  }
  let primary: StayRangeActionPlan['primary'] = 'none';
  if (blockable.length > 0 && unblockable.length === 0) primary = 'block';
  else if (unblockable.length > 0 && blockable.length === 0) primary = 'unblock';
  else if (blockable.length > 0) primary = 'block';
  else if (unblockable.length > 0) primary = 'unblock';

  let note: string | null = null;
  if (occupied.length > 0 && blockable.length > 0) {
    note = `${occupied.length} occupied night${occupied.length === 1 ? '' : 's'} will be skipped.`;
  } else if (occupied.length > 0 && blockable.length === 0 && unblockable.length === 0) {
    note = 'Selected nights are occupied and cannot be changed.';
  } else if (blockable.length > 0 && unblockable.length > 0) {
    note = `${blockable.length} available · ${unblockable.length} already blocked.`;
  }

  return { blockable, unblockable, occupied, primary, note };
}
