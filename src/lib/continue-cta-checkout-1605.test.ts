import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRIPE_TEST_UNTIL_LIVE, TRAVELER_CONTINUE_TEST_CTA } from './booking-confirmation-copy';

describe('Phase 1605: traveler continue CTA without test-mode stamp', () => {
  it('primary continue CTA is Continue to checkout', () => {
    expect(TRAVELER_CONTINUE_TEST_CTA).toBe('Continue to checkout');
    expect(TRAVELER_CONTINUE_TEST_CTA.toLowerCase()).not.toContain('test mode');
  });

  it('TourDetails discloses Stripe TEST via env-aware footnote helper', () => {
    const src = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    expect(src).toContain('stripeSecureCheckoutFootnote');
    expect(src).not.toContain('STRIPE_TEST_UNTIL_LIVE');
    expect(STRIPE_TEST_UNTIL_LIVE.toLowerCase()).toContain('test');
  });
});
