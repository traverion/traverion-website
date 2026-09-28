import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRIPE_TEST_UNTIL_LIVE, TRAVELER_CONTINUE_TEST_CTA } from './booking-confirmation-copy';

describe('Phase 1605: traveler continue CTA without test-mode stamp', () => {
  it('primary continue CTA is Continue to checkout', () => {
    expect(TRAVELER_CONTINUE_TEST_CTA).toBe('Continue to checkout');
    expect(TRAVELER_CONTINUE_TEST_CTA.toLowerCase()).not.toContain('test mode');
  });

  it('TourDetails still discloses Stripe TEST beside the booking card', () => {
    const src = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    expect(src).toContain('STRIPE_TEST_UNTIL_LIVE');
    expect(src).toMatch(/Secure checkout · \{STRIPE_TEST_UNTIL_LIVE\}/);
    expect(STRIPE_TEST_UNTIL_LIVE.toLowerCase()).toContain('test');
  });
});
