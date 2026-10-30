import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('Stripe TEST meta / Money phrasing (Phase 1597)', () => {
  it('booking-confirmed meta uses env-aware bookingConfirmedMetaDescription', () => {
    const app = readFileSync(join(here, '../App.tsx'), 'utf8');
    expect(app).toContain('bookingConfirmedMetaDescription');
    expect(app).not.toMatch(/Checkout used \$\{STRIPE_TEST_UNTIL_LIVE\}\./);
    expect(app).not.toMatch(/payment was successful\. \$\{STRIPE_TEST_UNTIL_LIVE\}\./);
  });

  it('Partner Income page uses product subtitle — not permanent test-mode checkout copy', () => {
    const money = readFileSync(join(here, '../pages/supplier/SupplierEarnings.tsx'), 'utf8');
    expect(money).toContain('Earnings, payouts, and payment settings.');
    expect(money).toContain('showAdminStripeTestDiagnostics');
    expect(money).toContain('SUPPLIER_TEST_DATA_LABEL');
    expect(money).not.toMatch(/Guest checkout uses \$\{STRIPE_TEST_UNTIL_LIVE\}/);
    expect(money).not.toMatch(/never invents a transfer\. \$\{STRIPE_TEST_UNTIL_LIVE\}\./);
    const env = readFileSync(join(here, 'traveler-env-presentation.ts'), 'utf8');
    expect(env).toContain("SUPPLIER_TEST_DATA_LABEL = 'Test data'");
  });
});
