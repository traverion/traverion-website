import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1684: Reviews empty offers New listing + Your listings', () => {
  it('pairs create path with listings escape', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('Phase 1684');
    expect(src).toMatch(/No reviews yet[\s\S]*New listing[\s\S]*Your listings/);
  });
});
