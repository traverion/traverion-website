import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1822: partner listings compact rows', () => {
  it('defines compact listing row chrome', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1822');
    expect(css).toContain('.tv-ops-listing-row');
    expect(css).toContain('.tv-ops-listings-table');
    expect(css).toContain('cursor: default');
    expect(css).toContain('.tv-ops-listing-row__view');
  });

  it('uses compact product rows with View + overflow menu and non-clickable identity', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('tv-ops-listing-row');
    expect(src).toContain('tv-ops-listings-table');
    expect(src).toContain('Create listing');
    expect(src).toContain('Recently updated');
    expect(src).toContain('partnerListingExperienceKind');
    expect(src).toContain('MoreHorizontal');
    expect(src).toContain('line-clamp-2');
    expect(src).toContain('tv-ops-listing-row__view');
    expect(src).toContain('data-listing-actions-menu');
    expect(src).toContain('Manage availability');
    expect(src).toContain('Duplicate as draft');
    expect(src).toContain('Deactivate');
    expect(src).toContain('Delete listing');
    expect(src).toContain('Reactivate');
    // Identity is a static block, not a navigation control.
    expect(src).toContain('tv-ops-listing-row__identity flex min-w-0 items-start gap-3');
    expect(src).not.toContain('onClick={() => openSupplierListingEditor(listing.id)}\n                      className="tv-ops-listing-row__identity');
  });
});
