import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1818: partner page hero / modal header polish', () => {
  it('SupplierPageHero uses finland eyebrow and touch-safe actions', () => {
    const src = readFileSync(resolve(__dirname, 'supplierUi.tsx'), 'utf8');
    expect(src).toContain('partner-page-hero');
    expect(src).toContain('text-finland');
    expect(src).toContain('text-[1.625rem]');
    expect(src).toContain('[&_button]:min-h-11');
    expect(src).toContain('font-display text-lg sm:text-xl');
  });
});
