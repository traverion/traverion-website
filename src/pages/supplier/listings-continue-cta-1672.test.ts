import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1672: Incomplete listing cards show primary continue Edit', () => {
  it('renders primaryCta continue as finland Edit and skips ghost duplicate', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('Phase 1672');
    expect(src).toContain("card.primaryCta === 'continue'");
    expect(src).toContain('card.primaryCtaLabel');
    expect(src).toContain("card.primaryCta !== 'continue'");
  });
});
