import { describe, expect, it, vi, afterEach } from 'vitest';
import { STRIPE_TEST_UNTIL_LIVE, TRAVELER_PAY_NOW_TEST_CTA } from './booking-confirmation-copy';

describe('traveler env presentation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps Test mode banner copy short and non-marketing', async () => {
    const { TRAVELER_TEST_MODE_DETAIL, TRAVELER_TEST_MODE_LABEL } = await import('./traveler-env-presentation');
    expect(TRAVELER_TEST_MODE_LABEL).toBe('Test mode');
    expect(TRAVELER_TEST_MODE_DETAIL.toLowerCase()).toContain('sandbox');
    expect(TRAVELER_TEST_MODE_DETAIL.toLowerCase()).not.toContain('stripe test until live');
    expect(TRAVELER_TEST_MODE_DETAIL.toLowerCase()).toContain('published inventory');
  });

  it('discloses Stripe TEST copy when publishable key is pk_test_', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_audit_fixture');
    const mod = await import('./traveler-env-presentation');
    expect(mod.showStripeTestPaymentDisclosure()).toBe(true);
    expect(mod.stripeTestPaymentDisclosure()).toBe(STRIPE_TEST_UNTIL_LIVE);
    expect(mod.travelerPayNowCtaLabel(false)).toBe(TRAVELER_PAY_NOW_TEST_CTA);
    expect(mod.stripeSecureCheckoutFootnote()).toContain('test-mode');
    expect(mod.bookingConfirmedMetaDescription()).toContain(STRIPE_TEST_UNTIL_LIVE);
  });

  it('keeps production payment UI clean when publishable key is live', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_live_audit_fixture');
    const mod = await import('./traveler-env-presentation');
    expect(mod.showStripeTestPaymentDisclosure()).toBe(false);
    expect(mod.stripeTestPaymentDisclosure()).toBeNull();
    expect(mod.travelerPayNowCtaLabel(false)).toBe('Pay now');
    expect(mod.stripeSecureCheckoutFootnote()).toBe('Secure checkout');
    expect(mod.bookingConfirmedMetaDescription()).not.toMatch(/test/i);
    expect(mod.travelerShowsTestModeBanner()).toBe(false);
  });
});
