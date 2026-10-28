import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1672 → listings row CTA: contextual primary + overflow menu', () => {
  it('uses Edit for drafts and View for live, with Edit retained in the overflow menu', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(src).toContain('openSupplierListingEditor(menuListing.id)');
    expect(src).toMatch(/role="menuitem"[\s\S]*?\n\s*Edit\n/);
    expect(src).toContain('primaryIsView');
    expect(src).toContain('tv-ops-listing-row__primary');
    expect(src).toContain('publicTourListingUrl');
    expect(src).toContain('publicStayListingUrl');
    // Row identity must not navigate into the editor.
    expect(src).not.toContain('tv-ops-listing-row__identity flex min-w-0 items-start gap-3 text-left"');
    expect(src).not.toMatch(
      /onClick=\{\(\) => openSupplierListingEditor\(listing\.id\)\}[\s\S]{0,120}tv-ops-listing-row__identity/
    );
    const actionsBlock = src.match(
      /tv-ops-listing-row__actions[\s\S]*?<\/div>\s*<\/div>\s*<\/article>/
    )?.[0];
    expect(actionsBlock).toBeTruthy();
    expect(actionsBlock).toContain('tv-ops-listing-row__primary');
    expect(actionsBlock).toContain('data-listing-gear');
    expect(actionsBlock).toContain('openSupplierListingEditor(listing.id)');
    expect(actionsBlock).toMatch(/>\s*Edit\s*</);
    expect(actionsBlock).toMatch(/>\s*View\s*</);
  });
});
