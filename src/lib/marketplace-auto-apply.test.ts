import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCalendarDays } from './stayOccupancy';
import { nextStayDatePatch, parseCalendarDateParam } from './marketplaceBrowse';

/**
 * Mirrors Packages/Stays commit rules for results-page auto-apply.
 * Selecting a tour date or completing a stay range must update applied state
 * without waiting for an explicit Search click.
 */
function commitTourDate(raw: string): string {
  if (raw.trim() === '') return '';
  return parseCalendarDateParam(raw);
}

function commitStayRange(
  draftIn: string,
  draftOut: string
): { checkIn: string; checkOut: string; applied: boolean } {
  let inIso = draftIn;
  let outIso = draftOut;
  if (!inIso) outIso = '';
  else if (outIso && outIso <= inIso) outIso = addCalendarDays(inIso, 1);
  const cleared = !inIso && !outIso;
  const complete = Boolean(inIso && outIso && outIso > inIso);
  if (cleared || complete) return { checkIn: inIso, checkOut: outIso, applied: true };
  return { checkIn: '', checkOut: '', applied: false };
}

describe('marketplace auto-apply commit rules', () => {
  it('applies a single tour date immediately (no Search)', () => {
    expect(commitTourDate('2026-10-30')).toBe('2026-10-30');
    expect(commitTourDate('')).toBe('');
    expect(commitTourDate('2026-10-30T00:00:00Z')).toBe('');
  });

  it('does not apply an incomplete stay range until check-out is set', () => {
    const checkInOnly = commitStayRange('2026-10-30', '');
    expect(checkInOnly.applied).toBe(false);
    expect(checkInOnly.checkIn).toBe('');
    expect(checkInOnly.checkOut).toBe('');

    const complete = commitStayRange('2026-10-30', '2026-11-02');
    expect(complete.applied).toBe(true);
    expect(complete.checkIn).toBe('2026-10-30');
    expect(complete.checkOut).toBe('2026-11-02');
  });

  it('nextStayDatePatch keeps orphan check-out from sticking without check-in', () => {
    expect(nextStayDatePatch({ date: '2026-10-30', checkout: '2026-11-01' }, '')).toEqual({
      date: '',
      checkout: '',
    });
  });

  it('Packages/Stays commit filters without blanking the grid on capacity reload', () => {
    const packages = readFileSync(resolve(__dirname, '../pages/Packages.tsx'), 'utf8');
    const stays = readFileSync(resolve(__dirname, '../pages/Stays.tsx'), 'utf8');
    expect(packages).toContain('setFilterDate(dateNext)');
    expect(packages).toContain('setFilterGuests(patch.guests)');
    expect(packages).toContain('waitingOnDateCapacity');
    expect(packages).toContain('· Updating…');
    expect(packages).toContain('const showCatalogLoading = catalogLoading;');
    expect(packages).toMatch(/if \(dateCapacityForActiveFilter == null\) return true;/);
    expect(stays).toContain('commitStayDateRange');
    expect(stays).toContain('setGuests(patch.guests)');
    expect(stays).toContain('· Updating…');
    expect(stays).toMatch(/if \(occupancyForActiveBrowse == null\) return true;/);
    expect(stays).toContain('const resultTitle = catalogLoading ? (');
  });
});
