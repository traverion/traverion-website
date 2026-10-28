import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rental PDP booking polish', () => {
  const details = readFileSync(resolve(__dirname, 'RentalDetails.tsx'), 'utf8');
  const widget = readFileSync(resolve(__dirname, '../components/rental/RentalBookingWidget.tsx'), 'utf8');
  const gallery = readFileSync(resolve(__dirname, '../components/rental/RentalPhotoGallery.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

  it('uses sticky rental chrome without nested card and mobile booking bar', () => {
    expect(details).toContain('tv-booking-sticky--rental');
    expect(details).toContain('tv-booking-mobile-bar');
    expect(details).toContain('id="rental-policies"');
    expect(details).toContain('Rental length');
    expect(details).toContain('rentalDurationCustomerText');
    expect(widget).not.toContain('bufferMinutes');
    expect(css).toContain('.tv-booking-sticky--rental');
  });

  it('keeps booking card free of duplicated deposit, cancellation, and pickup copy', () => {
    expect(widget).toContain('GuestStepper');
    expect(widget).toContain('label="Quantity"');
    expect(widget).toContain('#rental-policies');
    expect(widget).toContain('Estimated total');
    expect(widget).not.toContain('rentalDepositCustomerText');
    expect(widget).not.toContain('rentalCancellationCustomerText');
    expect(widget).not.toContain('rentalMapHref');
    expect(widget).not.toContain('Pickup: {');
  });

  it('aligns rental gallery lightbox with shared dialog focus and CSS', () => {
    expect(gallery).toContain('useDialogFocus');
    expect(gallery).toContain('tv-gallery-lightbox');
    expect(gallery).toContain('tv-gallery-lightbox__nav');
    expect(gallery).toContain('tv-gallery-lightbox__close');
  });
});
