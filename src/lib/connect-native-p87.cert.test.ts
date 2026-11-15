/**
 * P8.7 Native payout onboarding UX — source/unit certification.
 * Authenticated browser results are recorded separately in docs/p87-browser-cert.md.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPRESS_STRIPE_AUTH_LIMITATION,
  groupConnectRequirements,
  humanizeConnectRequirements,
} from './connect-requirement-labels';

const root = resolve(__dirname, '../..');
const edge = readFileSync(
  resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);
const settings = readFileSync(
  resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
  'utf8'
);
const panel = readFileSync(
  resolve(root, 'src/components/supplier/ConnectEmbeddedPanel.tsx'),
  'utf8'
);
const journey = readFileSync(
  resolve(root, 'src/components/supplier/SupplierNativeVerificationJourney.tsx'),
  'utf8'
);
const labels = readFileSync(resolve(root, 'src/lib/connect-requirement-labels.ts'), 'utf8');

const CANONICAL = 'acct_1UcAxbCOlSVGqrHJ';

describe('P8.7 native payout onboarding UX (unit/source)', () => {
  it('humanizes raw Stripe keys into readable grouped labels', () => {
    const raw = [
      'representative.dob.year',
      'representative.dob.month',
      'representative.dob.day',
      'external_account',
      'company.name',
      'tos_acceptance.date',
    ];
    const flat = humanizeConnectRequirements(raw);
    expect(flat).toContain("Representative's date of birth");
    expect(flat).toContain('Bank account required');
    expect(flat).toContain('Legal business name');
    expect(flat).not.toContain('representative.dob.year');
    expect(flat).not.toContain('external_account');

    const groups = groupConnectRequirements(raw);
    expect(groups.map((g) => g.id)).toEqual(['business', 'representative', 'bank', 'agreements']);
  });

  it('documents Express Stripe auth limitation and does not disable auth for Express', () => {
    expect(EXPRESS_STRIPE_AUTH_LIMITATION).toMatch(/Express/i);
    expect(edge).toContain('disable_stripe_user_authentication');
    expect(edge).toContain('isCustom');
    expect(edge).toContain("ensured.accountType === 'custom'");
    // Express path must not unconditionally disable auth.
    expect(edge).toMatch(/isCustom \? \{ disable_stripe_user_authentication: true \}/);
    expect(panel).toContain('expectStripeAuth');
    expect(labels).toContain('EXPRESS_STRIPE_AUTH_LIMITATION');
  });

  it('guided Income settings sequence covers business → verification → bank → preferences → completion', () => {
    expect(settings).toContain('1. Business details');
    expect(settings).toContain('2. Representative verification');
    expect(settings).toContain('3. Bank account');
    expect(settings).toContain('4. Payout preferences');
    expect(settings).toContain('5. Completion');
    expect(settings).toContain('saveBusinessDetails');
    expect(settings).toContain('groupConnectRequirements');
    expect(settings).toContain('Edit business details');
  });

  it('preserves canonical LIVE Express account id in certification fixtures', () => {
    expect(CANONICAL).toBe('acct_1UcAxbCOlSVGqrHJ');
    expect(settings).not.toContain('acct_1UcBXT2FvgTkBmd2');
    expect(journey).toContain('expectStripeAuth');
  });

  it('Account Session still enables external_account_collection for bank collection', () => {
    expect(edge).toContain('external_account_collection: true');
    expect(edge).toContain('account_onboarding');
    expect(edge).toContain('account_management');
  });
});
