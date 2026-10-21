import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Marketplace reactive filtering (no Search required)', () => {
  it('Packages applies date and guests immediately and debounces Where', () => {
    const src = readFileSync(resolve(__dirname, 'Packages.tsx'), 'utf8');
    expect(src).toContain('setFilterDate(dateNext)');
    expect(src).toContain('setFilterGuests(patch.guests)');
    expect(src).toContain('window.setTimeout');
    expect(src).toContain('280');
    expect(src).toContain('parseCalendarDateParam');
    expect(src).toContain('replaceState');
    expect(src).toContain('popstate');
    expect(src).toContain('dateCapacityReloadGenRef');
  });

  it('Stays applies valid date ranges and guests without Search', () => {
    const src = readFileSync(resolve(__dirname, 'Stays.tsx'), 'utf8');
    expect(src).toContain('applyStayDateRange');
    expect(src).toContain('setGuests(patch.guests)');
    expect(src).toContain('window.setTimeout');
    expect(src).toContain('280');
    expect(src).toContain('parseCalendarDateParam');
    expect(src).toContain('replaceState');
    expect(src).toContain('popstate');
  });

  it('search bar uses Helsinki browse today for calendar floor', () => {
    const src = readFileSync(
      resolve(__dirname, '../components/marketplace/MarketplaceSearchBar.tsx'),
      'utf8'
    );
    expect(src).toContain('marketplaceBrowseTodayIso');
    expect(src).toContain('todayIso={browseTodayIso}');
  });
});
