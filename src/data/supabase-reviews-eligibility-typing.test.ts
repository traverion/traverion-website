import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('Review eligibility row typing (Phase 1583)', () => {
  const src = readFileSync(join(here, 'supabase-reviews.ts'), 'utf8');

  it('keeps booking_date and stay fields on eligibility rows for bookingEligibleForReview', () => {
    expect(src).toContain('Phase 1359/1583');
    expect(src).toMatch(/booking_date: string \| null/);
    expect(src).toMatch(/check_out\?: string \| null/);
    expect(src).toMatch(/nights\?: number \| null/);
    expect(src).not.toMatch(/\[key: string\]: unknown/);
  });
});
