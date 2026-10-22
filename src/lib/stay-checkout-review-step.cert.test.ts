/**
 * Stay Instant Book must review before Stripe (no direct jump from details → payment).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAY_CONFIRM_PAYMENT_CTA, STAY_REVIEW_BOOKING_CTA } from './stay-sticky-cta';

describe('Stay checkout review step', () => {
  const stayDetails = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');

  it('has details → review step and Confirm CTA before Stripe', () => {
    expect(stayDetails).toContain("useState<'details' | 'review'>('details')");
    expect(stayDetails).toContain('Review & confirm');
    expect(stayDetails).toContain('goToStayReview');
    expect(stayDetails).toContain('expectedTotal: stayQuote.totalAmount');
    expect(stayDetails).toContain("stayCheckoutStep !== 'review'");
    expect(STAY_REVIEW_BOOKING_CTA).toBe('Review booking');
    expect(STAY_CONFIRM_PAYMENT_CTA).toMatch(/Confirm & continue/);
  });

  it('refuses silent price changes via quote_changed handling', () => {
    expect(stayDetails).toContain("res.code === 'quote_changed'");
    expect(stayDetails).toContain('The total updated to');
  });
});
