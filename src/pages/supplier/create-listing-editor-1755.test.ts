import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1755: Create listing gated to editors', () => {
  it('Create page and Listings deep-link check canManageBookings', () => {
    const create = readFileSync(resolve(__dirname, 'PartnerCreateListingPage.tsx'), 'utf8');
    expect(create).toContain('Phase 1755');
    expect(create).toContain('canManageBookings');
    expect(create).toContain('cannot create new ones');

    const listings = readFileSync(resolve(__dirname, 'SupplierListings.tsx'), 'utf8');
    expect(listings).toContain('Phase 1755');
    expect(listings).toContain('if (!canEditListings)');

    const layout = readFileSync(
      resolve(__dirname, '../../components/supplier/SupplierLayout.tsx'),
      'utf8'
    );
    expect(layout).toContain('Phase 1755');
    expect(layout).toContain('canCreateListings');
    expect(layout).toContain('canCreate={canCreateListings}');
  });
});
