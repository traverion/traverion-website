import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rental PDP Tour-parity unification', () => {
  const details = readFileSync(resolve(__dirname, 'RentalDetails.tsx'), 'utf8');
  const widget = readFileSync(resolve(__dirname, '../components/rental/RentalBookingWidget.tsx'), 'utf8');
  const gallery = readFileSync(resolve(__dirname, '../components/rental/RentalPhotoGallery.tsx'), 'utf8');
  const stepper = readFileSync(resolve(__dirname, '../components/booking/GuestStepper.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

  it('uses Tour shell, title-before-gallery, and sans title typography', () => {
    expect(details).toContain('tv-rental-pdp');
    expect(details).toContain('tv-pdp-layout');
    expect(details).toContain('tv-pdp-main');
    expect(details).toContain('tv-pdp-aside');
    expect(details).toContain('tv-tour-title font-sans');
    expect(details).not.toContain('font-display text-3xl');
    expect(details.indexOf('tv-tour-title')).toBeLessThan(details.indexOf('<RentalPhotoGallery'));
    expect(css).toContain('.tv-rental-pdp .tv-tour-title');
  });

  it('keeps sticky rental booking chrome and unit quantity (not guests)', () => {
    expect(details).toContain('tv-booking-sticky--rental');
    expect(details).toContain('tv-booking-mobile-bar');
    expect(details).toContain('id="rental-policies"');
    expect(details).toContain('tv-tour-option-card');
    expect(widget).toContain('GuestStepper');
    expect(widget).toContain('unitSingular');
    expect(widget).toContain('rentalQuantityUnits');
    expect(widget).not.toContain('rentalDepositCustomerText');
    expect(widget).not.toContain('rentalCancellationCustomerText');
    expect(stepper).toContain('unitSingular');
    expect(stepper).toContain('unitPlural');
  });

  it('wires reviews and supplier with shared components when data exists', () => {
    expect(details).toContain('PublicReviewCard');
    expect(details).toContain('ListingReviewsModal');
    expect(details).toContain('TourOperatorBlock');
    expect(details).toContain('fetchSupplierPublicLegal');
    expect(details).toContain('fetchReviewsByListingId');
  });

  it('aligns rental gallery with Tour mosaic and shared lightbox', () => {
    expect(gallery).toContain('useDialogFocus');
    expect(gallery).toContain('tv-gallery-lightbox');
    expect(gallery).toContain('lg:grid-cols-4 lg:grid-rows-2');
    expect(gallery).toContain('View all photos');
  });
});
