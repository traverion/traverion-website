import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rental checkout review step', () => {
  const details = readFileSync(resolve(__dirname, '../pages/RentalDetails.tsx'), 'utf8');
  const widget = readFileSync(resolve(__dirname, '../components/rental/RentalBookingWidget.tsx'), 'utf8');
  const confirm = readFileSync(resolve(__dirname, '../pages/RentalBookingConfirm.tsx'), 'utf8');

  it('listing Continue opens book=1 confirmation — no in-card Review / Stripe', () => {
    expect(details).toContain('openRentalBookingConfirm');
    expect(details).toContain('RentalBookingConfirm');
    expect(details).toContain('parseRentalCheckoutSearch');
    expect(details).not.toContain('createBookingCheckoutSession');
    expect(widget).toContain('Continue');
    expect(widget).toContain('onContinue');
    expect(widget).not.toContain('createBookingCheckoutSession');
    expect(widget).not.toContain('Continue to checkout');
    expect(widget).not.toContain('Review rental');
    expect(widget).not.toContain('setReviewing');
    expect(widget).not.toContain('checkoutConsentAccepted');
    // Confirm overlay mounts only after all RentalBody hooks (Rules of Hooks).
    expect(details.indexOf('const quickFacts = useMemo')).toBeLessThan(
      details.indexOf('if (checkoutFromUrl && !draftPreview && !devPreview)')
    );
  });

  it('dedicated review owns Stripe session + consent + revalidation', () => {
    expect(confirm).toContain('createBookingCheckoutSession');
    expect(confirm).toContain('CheckoutConsentCheckbox');
    expect(confirm).toContain('Continue to payment');
    expect(confirm).toContain('evaluateRentalAvailabilityRpc');
    expect(confirm).toContain('quoteRentalLine');
    expect(confirm).toContain('Edit booking');
  });
});
