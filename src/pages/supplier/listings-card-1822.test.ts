import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1822: partner listings compact rows', () => {
  it('defines compact listing row chrome', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1822');
    expect(css).toContain('.tv-ops-listing-row');
    expect(css).toContain('.tv-ops-listings-table');
  });

  it('uses compact product rows with toolbar and create CTA', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('tv-ops-listing-row');
    expect(src).toContain('tv-ops-listings-table');
    expect(src).toContain('Create listing');
    expect(src).toContain('Recently updated');
    expect(src).toContain('partnerListingExperienceKind');
    expect(src).toContain('MoreHorizontal');
    expect(src).toContain('line-clamp-2');
  });
});
