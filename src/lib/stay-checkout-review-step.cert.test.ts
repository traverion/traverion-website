/**
 * Stay Instant Book: dedicated confirmation page — never Review inside the listing card.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAY_CONFIRM_PAYMENT_CTA, STAY_RESERVE_CTA } from './stay-sticky-cta';

describe('Stay checkout dedicated confirmation', () => {
  const stayDetails = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
  const confirm = readFileSync(resolve(__dirname, '../pages/StayBookingConfirm.tsx'), 'utf8');

  it('listing Reserve opens book=1 confirmation — no in-card Review & Confirm', () => {
    expect(stayDetails).toContain('openStayBookingConfirm');
    expect(stayDetails).toContain('buildStayCheckoutHref');
    expect(stayDetails).toContain('StayBookingConfirm');
    expect(stayDetails).not.toContain('Review & confirm');
    expect(stayDetails).not.toContain("useState<'details' | 'review'>");
    expect(stayDetails).not.toContain('createBookingCheckoutSession');
    expect(STAY_RESERVE_CTA).toBe('Reserve');
  });

  it('confirmation page initiates Stripe with expectedTotal after terms', () => {
    expect(confirm).toContain('Complete your reservation');
    expect(confirm).toContain('Booking details');
    expect(confirm).toContain("surface: 'confirmation'");
    expect(confirm).toContain('totalAmount:');
    expect(confirm).toContain('expectedTotal: stayQuote.totalAmount');
    expect(STAY_CONFIRM_PAYMENT_CTA).toBe('Continue to secure payment');
    expect(confirm).toContain("res.code === 'quote_changed'");
    expect(confirm).toContain('createBookingCheckoutSession');
    expect(confirm).toContain('stay-book-consent');
    expect(confirm).toContain('stayFreeCancelDeadlineCopy');
  });
});

