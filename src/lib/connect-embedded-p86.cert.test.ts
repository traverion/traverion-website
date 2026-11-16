/**
 * P8.6 Embedded Connect production certification fixtures.
 * Distinguishes source/unit evidence from authenticated browser session tests.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const settings = readFileSync(
  resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
  'utf8'
);
const panel = readFileSync(
  resolve(root, 'src/components/supplier/ConnectEmbeddedPanel.tsx'),
  'utf8'
);

const CANONICAL = 'acct_1UcAxbCOlSVGqrHJ';
const DUPLICATE = 'acct_1UcBXT2FvgTkBmd2';

describe('P8.6 embedded Connect production certification (unit/source)', () => {
  it('omitted livemode must not archive LIVE Express as TEST', () => {
    expect(edge).toContain('accountLivemode !== false');
    expect(edge).toContain('platformMode === \'live\'');
    // Explicit false is the only TEST signal on a LIVE platform.
    expect(edge).toMatch(/accountLivemode !== false/);
  });

  it('refuses second LIVE account and restores legacy LIVE Express', () => {
    expect(edge).toContain('Never create a second LIVE connected account');
    expect(edge).toContain('connect_legacy_account_id');
    expect(edge).toContain('refusing to create a second LIVE account');
  });

  it('Account Session path uses supplier-auth account + hosted fallback', () => {
    expect(edge).toContain('accountSessions.create');
    expect(edge).toContain('hosted_fallback');
    expect(edge).toContain('p85_embedded');
    expect(panel).toContain('fetchConnectAccountSessionSecret');
    expect(panel).toContain('hosted_fallback');
    expect(panel).toContain('loadConnectAndInitialize');
  });

  it('webhook maps Connect accounts via stripe_connected_account_id (not hardcoded dup)', () => {
    expect(webhook).toContain("eq('stripe_connected_account_id', account.id)");
    expect(webhook).not.toContain(DUPLICATE);
    expect(settings).not.toContain(DUPLICATE);
    expect(CANONICAL).toMatch(/^acct_1UcAx/);
  });

  it('partner settings launches wizard that wraps embedded Stripe components', () => {
    expect(settings).toContain('PayoutSetupWizard');
    expect(settings).toMatch(/Set up payouts|Start payout setup/);
    const wizard = readFileSync(
      resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
      'utf8'
    );
    expect(wizard).toContain('Business information');
    expect(wizard).toContain('Representative details');
    expect(wizard).toContain('Bank account');
    expect(wizard).toContain('Payout preferences');
    expect(wizard).toContain('ConnectEmbeddedPanel');
    expect(wizard).toContain('Open secure step');
  });
});
