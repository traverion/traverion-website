import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1815: Money transaction row presentation', () => {
  it('defines tv-money-row primitives', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1815');
    expect(css).toContain('.tv-money-row');
    expect(css).toContain('.tv-money-row__amount');
  });

  it('SupplierEarnings uses shared money rows for ledger and payouts', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierEarnings.tsx'), 'utf8');
    expect(src).toContain('tv-money-row');
    expect(src).toContain('tv-money-row__amount');
    expect(src).not.toContain(
      'rounded-xl bg-paper-raised px-3 py-2.5 shadow-soft ring-1 ring-black/[0.06] flex items-baseline justify-between gap-3'
    );
  });
});
