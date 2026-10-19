import { describe, expect, it } from 'vitest';
import {
  applyStayDateTap,
  formatStayRangeLabel,
  normalizeStayDateRange,
  planStayRangeActions,
  stayDateInRange,
  stayDateRangeEdge,
  stayDateRangeFromDrag,
} from './stay-calendar-selection';

describe('stay-calendar-selection', () => {
  it('normalizes reversed ranges', () => {
    expect(normalizeStayDateRange('2026-10-24', '2026-10-20')).toEqual({
      start: '2026-10-20',
      end: '2026-10-24',
    });
  });

  it('tap anchors then extends; same-day clears', () => {
    expect(applyStayDateTap(null, '2026-10-20')).toEqual({
      start: '2026-10-20',
      end: '2026-10-20',
    });
    expect(
      applyStayDateTap({ start: '2026-10-20', end: '2026-10-20' }, '2026-10-24')
    ).toEqual({ start: '2026-10-20', end: '2026-10-24' });
    expect(
      applyStayDateTap({ start: '2026-10-20', end: '2026-10-20' }, '2026-10-20')
    ).toBeNull();
  });

  it('tap while multi-day range is active starts a new single day', () => {
    expect(
      applyStayDateTap({ start: '2026-10-20', end: '2026-10-24' }, '2026-10-22')
    ).toEqual({ start: '2026-10-22', end: '2026-10-22' });
  });

  it('drag builds continuous range either direction', () => {
    expect(stayDateRangeFromDrag('2026-10-22', '2026-10-20')).toEqual({
      start: '2026-10-20',
      end: '2026-10-22',
    });
  });

  it('reports range edges for continuous highlight', () => {
    const range = { start: '2026-10-20', end: '2026-10-22' };
    expect(stayDateRangeEdge('2026-10-20', range)).toBe('start');
    expect(stayDateRangeEdge('2026-10-21', range)).toBe('middle');
    expect(stayDateRangeEdge('2026-10-22', range)).toBe('end');
    expect(stayDateRangeEdge('2026-10-20', { start: '2026-10-20', end: '2026-10-20' })).toBe(
      'both'
    );
    expect(stayDateInRange('2026-10-19', range)).toBe(false);
  });

  it('formats range labels for inclusive night cells', () => {
    expect(formatStayRangeLabel({ start: '2026-10-20', end: '2026-10-20' })).toMatch(
      /1 night/
    );
    // Inclusive cells 20–23 = 4 nights to block/unblock.
    expect(formatStayRangeLabel({ start: '2026-10-20', end: '2026-10-23' })).toMatch(
      /4 nights/
    );
  });

  it('plans block/unblock without silent occupied skips as primary-only', () => {
    const plan = planStayRangeActions({
      range: { start: '2026-10-20', end: '2026-10-23' },
      canBlock: (iso) => iso === '2026-10-20' || iso === '2026-10-21',
      canUnblock: (iso) => iso === '2026-10-22',
    });
    expect(plan.blockable).toEqual(['2026-10-20', '2026-10-21']);
    expect(plan.unblockable).toEqual(['2026-10-22']);
    expect(plan.occupied).toEqual(['2026-10-23']);
    expect(plan.primary).toBe('block');
    expect(plan.note).toMatch(/occupied|available/i);
  });

  it('blocks occupied-only selections from mutating', () => {
    const plan = planStayRangeActions({
      range: { start: '2026-10-20', end: '2026-10-21' },
      canBlock: () => false,
      canUnblock: () => false,
    });
    expect(plan.primary).toBe('none');
    expect(plan.note).toMatch(/occupied/i);
  });
});
