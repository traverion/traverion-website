import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('Stays browse card quote honesty (Phase 1559)', () => {
  const card = readFileSync(join(here, '../components/PublicListingBrowseCard.tsx'), 'utf8');
  const stays = readFileSync(join(here, '../pages/Stays.tsx'), 'utf8');

  it('hides catalog nightly when dates selected but stayStayTotal is null', () => {
    expect(card).toContain('Phase 1559');
    expect(card).toMatch(/stayQuoteUnavailable[\s\S]*Price unavailable for these dates/);
    expect(card).toMatch(/stayQuoteUnavailable \? \(\s*<span className="font-bold tracking-tight text-ink">—<\/span>/);
  });

  it('Stays passes stayDatesSelected when check-in/out are set', () => {
    expect(stays).toMatch(/stayDatesSelected=\{dateFilterActive\}/);
  });
});
