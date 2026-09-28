import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1645: Affiliate success next-step CTAs', () => {
  it('offers Browse tours and Back to home after submit', () => {
    const src = readFileSync(resolve(__dirname, 'AffiliatePage.tsx'), 'utf8');
    expect(src).toContain('Phase 1645');
    expect(src).toContain('Browse tours');
    expect(src).toContain('Back to home');
    expect(src).toMatch(/isSubmitted \?[\s\S]*Browse tours/);
  });
});
