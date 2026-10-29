import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Listing PDP fresh booking selection', () => {
  const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
  const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
  const rental = readFileSync(resolve(__dirname, '../pages/RentalDetails.tsx'), 'utf8');

  it('does not hydrate Tour booking from URL cart or account cart', () => {
    expect(tour).toContain('scrubListingBookingSelectionFromLocation');
    expect(tour).not.toContain('loadTravelerCart');
    expect(tour).not.toContain('loadAccountCartForListing');
    expect(tour).not.toContain('parseTourListingSelection');
    expect(tour).not.toContain('selectionRestored');
    expect(tour).toContain('saveTravelerCart');
  });

  it('Stay listing starts empty and only restores via closeStayBookingConfirm', () => {
    expect(stay).toContain('scrubListingBookingSelectionFromLocation');
    expect(stay).not.toContain('readStayPrefill');
    expect(stay).toContain('STAY_DEFAULT_PARTY');
    expect(stay).toContain('closeStayBookingConfirm');
    expect(stay).toContain('buildStayListingHref(stayId)');
  });

  it('Rental listing ignores URL prefill; Edit/Back sets widgetInitial', () => {
    expect(rental).toContain('scrubListingBookingSelectionFromLocation');
    expect(rental).not.toContain('readRentalListingPrefill');
    expect(rental).toContain('setWidgetInitial({');
    expect(rental).toContain('buildRentalListingHref(listing.id)');
  });
});
