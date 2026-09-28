import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('StayDetails sticky quote honesty (Phase 1546)', () => {
  const src = readFileSync(join(here, '../pages/StayDetails.tsx'), 'utf8');

  it('does not invent catalog nightly when dates are set but quote failed', () => {
    expect(src).toContain('Phase 1546');
    expect(src).toMatch(
      /quoteOk[\s\S]*formatMoney\(total[\s\S]*checkIn && checkOut[\s\S]*'—'/
    );
    // Failed-quote path must not fall straight to nightly catalog when range is chosen.
    expect(src).not.toMatch(
      /quoteOk \? formatMoney\(total, currency\) : nightly > 0 \? formatMoney\(nightly/
    );
  });
});

describe('StayDetails desktop PriceHero honesty (Phase 1548)', () => {
  const src = readFileSync(join(here, '../pages/StayDetails.tsx'), 'utf8');

  it('hides PriceHero catalog nightly when check-in/out set and quote failed', () => {
    expect(src).toContain('Phase 1548');
    expect(src).toMatch(
      /checkIn && checkOut && stayQuote && !stayQuote\.ok[\s\S]*tabular-nums text-ink">—</
    );
  });
});
