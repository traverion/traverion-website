import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1620: PDP review star a11y and Verified chip', () => {
  it('TourDetails announces ratings and uses emerald Verified chip', () => {
    const src = readFileSync(resolve(__dirname, 'TourDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1620');
    expect(src).toContain('aria-label={`${r.rating} out of 5 stars`}');
    expect(src).toContain('bg-emerald-100');
    expect(src).not.toMatch(/reviews\.slice\(0, 3\)[\s\S]{0,400}bg-green-100/);
  });

  it('StayDetails announces ratings and uses emerald Verified chip', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1620');
    expect(src).toContain('aria-label={`${r.rating} out of 5 stars`}');
    expect(src).toContain('bg-emerald-100');
  });
});
