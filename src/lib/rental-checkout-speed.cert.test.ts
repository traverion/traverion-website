import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rental checkout initiation speed', () => {
  it('shows preparing state immediately and does not revalidate availability before Stripe', () => {
    const src = readFileSync(resolve(__dirname, '../pages/RentalBookingConfirm.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('const startPayment = async'));
    expect(fn).toContain('setPaying(true)');
    expect(fn.indexOf('setPaying(true)')).toBeLessThan(fn.indexOf('createBookingCheckoutSession'));
    expect(fn).not.toMatch(/revalidateAvailability\(\);\s*\n\s*trackListingTraffic/);
    expect(src).toContain('Preparing secure checkout…');
    expect(fn).toContain('createCheckoutTiming');
    expect(fn).toContain('logCheckoutInitiationTiming');
  });

  it('edge rental path skips tour discounts, freezes before Stripe, and records stage timings', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
      'utf8'
    );
    expect(edge).toContain("earlyFamily === 'rental'");
    expect(edge).toContain('isRentalListing');
    expect(edge).toMatch(/if \(!isRentalListing\) \{[\s\S]*expire_stale_checkout_holds/);
    expect(edge).toContain('rentalPrepMs');
    expect(edge).toContain('rentalClaimMs');
    expect(edge).toContain('rentalFreezeMs');
    expect(edge).toContain('rentalPersistMs');
    expect(edge).toMatch(
      /timing\.mark\('rentalFreezeMs'\)[\s\S]*?timing\.mark\('stripeSessionMs'\)/
    );
    expect(edge).toContain("idempotencyKey: `rental_cs_${idempotencyKey}`");
    expect(edge).toContain('[Traverion] rental checkout timing');
  });
});
