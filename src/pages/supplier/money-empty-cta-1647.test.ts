import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P9.24: Money zero-data keeps dashboard visible', () => {
  const src = readFileSync(resolve(__dirname, 'SupplierEarnings.tsx'), 'utf8');

  it('does not replace Overview with a page-level empty card when there is no collected revenue', () => {
    expect(src).not.toMatch(
      /!loading && !hasMoney && !error && tab !== 'settings'[\s\S]*PARTNER_MONEY_EMPTY_TITLE/
    );
    expect(src).toContain("!error && !loading && tab === 'overview'");
    expect(src).toContain('data-testid="income-overview-primary-cards"');
  });

  it('keeps earnings table chrome with an in-table empty message', () => {
    expect(src).toContain('No earnings yet');
    expect(src).toContain(
      'Your earnings will appear here when you receive your first eligible booking.'
    );
  });

  it('keeps payouts list chrome with an in-list empty message', () => {
    expect(src).toContain('No payouts yet');
    expect(src).toContain(
      'Your payout history will appear here once payouts are processed.'
    );
  });
});
