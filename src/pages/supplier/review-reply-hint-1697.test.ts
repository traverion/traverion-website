import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1697: Supplier review reply shows char hint', () => {
  it('shows Up to 2000 characters under reply compose', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierReviews.tsx'), 'utf8');
    expect(src).toContain('Phase 1697');
    expect(src).toContain('Up to 2000 characters');
    expect(src).toContain('review-reply-hint-');
  });
});
