import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: deactivate/delete sheets must not apply a stale upcoming-paid fetch to the wrong listing.
 */
describe('SupplierListings upcoming paid check race (Phase 1489)', () => {
  it('guards deactivate and delete upcoming-paid fetches with gen + pending listing id', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierListings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Phase 1489/);
    expect(src).toMatch(/deactivateUpcomingGenRef/);
    expect(src).toMatch(/deleteUpcomingGenRef/);
    expect(src).toMatch(/listingPendingDeactivateRef\.current\?\.id !== listingId/);
    expect(src).toMatch(/listingPendingDeleteRef\.current\?\.id !== listingId/);
  });

  it('blocks delete/deactivate confirm until upcoming-paid check finishes (Phase 1490)', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'SupplierListings.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Phase 1490|partnerListingUpcomingPaidCheckPending/);
    expect(src).toMatch(/deleteUpcomingPaidCheckPending/);
    expect(src).toMatch(/deactivateUpcomingPaidCheckPending/);
    expect(src).toMatch(/disabled=\{deleteBusy \|\| deleteUpcomingPaidCheckPending \|\| deleteBlockedByBookings\}/);
    expect(src).toMatch(/disabled=\{deactivateBusy \|\| deactivateUpcomingPaidCheckPending\}/);
    expect(src).toContain('Phase 1734');
    expect(src).toContain('countBookingsForListing');
  });
});
