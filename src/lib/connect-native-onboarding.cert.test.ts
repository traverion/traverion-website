import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONNECT_NATIVE_ONBOARDING } from './connect-native-onboarding-architecture';
import { SUPPLIER_IDENTITY_SOURCE_OF_TRUTH } from './supplier-identity-source-of-truth';

const root = resolve(__dirname, '../..');

describe('Native Traverion Custom Connect onboarding', () => {
  const edge = readFileSync(
    resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
    'utf8'
  );
  const journey = readFileSync(
    resolve(root, 'src/components/supplier/SupplierNativeVerificationJourney.tsx'),
    'utf8'
  );
  const settings = readFileSync(
    resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
    'utf8'
  );
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/276_connect_native_custom_onboarding.sql'),
    'utf8'
  );
  const client = readFileSync(resolve(root, 'src/data/supabase-connect-onboarding.ts'), 'utf8');
  const stripeJs = readFileSync(resolve(root, 'src/lib/stripe-js-client.ts'), 'utf8');

  it('selects Custom + API-native for new accounts without LIVE transfers', () => {
    expect(CONNECT_NATIVE_ONBOARDING.accountTypeForNewAccounts).toBe('custom');
    expect(CONNECT_NATIVE_ONBOARDING.onboardingMode).toBe('api_native');
    expect(CONNECT_NATIVE_ONBOARDING.environments.liveTransfersEnabled).toBe(false);
    expect(SUPPLIER_IDENTITY_SOURCE_OF_TRUTH.onboarding.new_accounts).toBe('custom_api_native');
  });

  it('creates Custom accounts and exposes Traverion form API actions', () => {
    expect(edge).toContain("type: 'custom'");
    expect(edge).toContain("action === 'submit_business'");
    expect(edge).toContain("action === 'submit_representative'");
    expect(edge).toContain("action === 'accept_tos'");
    expect(edge).toContain("action === 'attach_bank_token'");
    expect(edge).toContain("action === 'start_native_custom'");
    expect(edge).toContain('createExternalAccount');
    expect(edge).toContain('tos_acceptance');
    expect(edge).toContain('traverion_supplier_id');
    expect(edge).toContain('archiveLinkedAccount');
    expect(edge).toContain('Never touch LIVE');
    expect(edge).toContain('connect_legacy_account_id');
    expect(edge).toContain('resolveStripeMoneySecretFromEnv');
    expect(edge).not.toMatch(/sk_live_/);
  });

  it('does not force hosted Account Link for the primary native path', () => {
    const wizard = readFileSync(
      resolve(root, 'src/components/supplier/PayoutSetupWizard.tsx'),
      'utf8'
    );
    expect(settings).toContain('PayoutSetupWizard');
    expect(wizard).toContain('ConnectEmbeddedPanel');
    expect(wizard).toContain('createBankAccountToken');
    expect(wizard).toContain('submit_business');
    expect(wizard).toContain('Stripe Recipient Agreement');
    expect(journey).toContain('tv-verify-workspace');
    expect(journey).toContain('createBankAccountToken');
    expect(journey).toContain('submit_business');
    expect(client).toContain('submit_business');
    expect(client).toContain('attach_bank_token');
    expect(stripeJs).toContain("createToken('bank_account'");
    expect(stripeJs).toContain('isStripeTestPublishableKey');
  });

  it('routes Express to embedded Account Sessions; Custom keeps API-native forms', () => {
    expect(journey).toContain('setShowIdentityEmbed(true)');
    expect(journey).toContain('ConnectEmbeddedPanel');
    expect(edge).toContain('archiveLinkedAccount');
    expect(edge).toContain('moneyMovementCounts');
    expect(edge).toContain('accountSessions.create');
    expect(edge).toContain('p85_embedded');
    expect(mig).toContain('connect_account_type');
  });

  it('ships dedicated /partner/verification workspace via unified wizard', () => {
    const page = readFileSync(
      resolve(root, 'src/pages/supplier/SupplierVerificationPage.tsx'),
      'utf8'
    );
    const layout = readFileSync(
      resolve(root, 'src/components/supplier/SupplierLayout.tsx'),
      'utf8'
    );
    expect(page).toContain('PayoutSetupWizard');
    expect(page).not.toContain('SupplierNativeVerificationJourney');
    expect(layout).toContain("section === 'verification'");
    expect(layout).toContain('/verification');
  });

  it('ships live Stripe TEST API certification script', () => {
    const script = readFileSync(
      resolve(root, 'scripts/cert-native-connect-onboarding.mjs'),
      'utf8'
    );
    expect(script).toContain("type: 'custom'");
    expect(script).toContain('sk_test_');
    expect(script).toContain('acct_1UTnHQC9ZvbINwo4');
    expect(script).toContain('live_money: false');
  });
});
