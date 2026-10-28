import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rental PDP final polish', () => {
  const details = readFileSync(resolve(__dirname, 'RentalDetails.tsx'), 'utf8');
  const widget = readFileSync(resolve(__dirname, '../components/rental/RentalBookingWidget.tsx'), 'utf8');
  const gallery = readFileSync(resolve(__dirname, '../components/rental/RentalPhotoGallery.tsx'), 'utf8');
  const stepper = readFileSync(resolve(__dirname, '../components/booking/GuestStepper.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

  it('resolves rental photos like Tours and handles load failures', () => {
    expect(details).toContain('photoSlotsFromTourPackage');
    expect(details).toContain('orderedPhotoUrls');
    expect(gallery).toContain('onError');
    expect(gallery).toContain('Photos could not be loaded');
    expect(gallery).toContain('ImageOff');
  });

  it('keeps a compact booking card without guest wording or chatter', () => {
    expect(widget).toContain('size="compact"');
    expect(widget).toContain('unitSingular');
    expect(widget).toContain('Estimated total');
    expect(widget).toContain('tv-rental-datetime');
    expect(widget).not.toContain('Live stock is checked');
    expect(widget).not.toContain('Confirmed again at checkout');
    expect(widget).not.toContain('Checkout uses Traverion');
    expect(widget).not.toContain('Nothing is reserved');
    expect(widget).toContain('unitSingular={quantityUnits.singular}');
    expect(widget).not.toMatch(/unitSingular=["']guest["']/);
    expect(stepper).toContain("size === 'compact'");
    expect(css).toContain('tv-rental-datetime');
  });

  it('hides empty title ratings and keeps reviews/operator sections', () => {
    expect(details).toContain('reviewCount > 0 && reviewScore');
    expect(details).not.toContain('(0) reviews');
    expect(details).toContain('rental-reviews');
    expect(details).toContain('TourOperatorBlock');
    expect(details).toContain('compact');
  });

  it('renders compact rental length rows from the selected option', () => {
    expect(details).toContain('rentalDurationLengthRows');
    expect(details).toContain('selectedVariant');
    expect(details).toContain("row.key === 'hour' ? Clock : Calendar");
    expect(details).not.toContain('rentalDurationCustomerText');
  });
});


