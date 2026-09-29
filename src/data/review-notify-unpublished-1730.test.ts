import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1730: new_review notify resolves unpublished listing supplier', () => {
  it('submitReview uses fetchListingSupplierMetaForParty instead of traveler listings SELECT', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-reviews.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function submitReview'));
    expect(fn).toContain('Phase 1730');
    expect(fn).toContain('fetchListingSupplierMetaForParty');
    expect(fn).toContain("eventType: 'new_review'");
    expect(fn).not.toMatch(/\.from\('listings'\)\s*\.select\('supplier_id, title'\)/);
  });
});
