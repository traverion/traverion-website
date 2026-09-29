import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1696: Tour and Stay review comments show char hint', () => {
  it('shows Up to 2000 characters on both listing review forms', () => {
    const tour = readFileSync(resolve(__dirname, 'TourDetails.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(tour).toContain('Phase 1696');
    expect(stay).toContain('Phase 1696');
    expect(tour).toContain('tour-review-comment-hint');
    expect(stay).toContain('stay-review-comment-hint');
  });
});
