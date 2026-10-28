import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1822: partner listings compact rows', () => {
  it('defines polished listing row chrome', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1822');
    expect(css).toContain('.tv-ops-listing-row');
    expect(css).toContain('.tv-ops-listings-table');
    expect(css).toContain('cursor: default');
    expect(css).toContain('.tv-ops-listing-row__primary');
    expect(css).toContain('partner-listings-workspace__search-input');
    expect(css).toContain('4.5rem');
  });

  it('uses product rows with contextual primary action and non-clickable identity', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('tv-ops-listing-row');
    expect(src).toContain('tv-ops-listings-table');
    expect(src).toContain('Create listing');
    expect(src).toContain('Recently updated');
    expect(src).toContain('inventoryFamilyFromListing');
    expect(src).toContain('MoreHorizontal');
    expect(src).toContain('tv-ops-listing-row__primary');
    expect(src).toContain('displayStatus');
    expect(src).toContain('Ready to publish');
    expect(src).toContain('data-listing-actions-menu');
    expect(src).toContain('Manage availability');
    expect(src).toContain('Duplicate as draft');
    expect(src).toContain('Deactivate');
    expect(src).toContain('Delete listing');
    expect(src).toContain('Reactivate');
    expect(src).toContain('partner-listings-workspace__search-input');
    // Identity is a static block, not a navigation control.
    expect(src).toContain('tv-ops-listing-row__identity flex min-w-0 items-start gap-3');
    expect(src).not.toContain('onClick={() => openSupplierListingEditor(listing.id)}\n                      className="tv-ops-listing-row__identity');
  });
});
