import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildConnectProgressSteps,
  deriveConnectExperienceState,
  listSupplierPayoutBlocks,
} from './connect-payout-progress';
import { isSupplierBankingReadyForPublish, isSupplierReadyToPublishTours } from './supplierOnboarding';
import { SUPPLIER_IDENTITY_SOURCE_OF_TRUTH } from './supplier-identity-source-of-truth';
import type { SupplierProfileRow } from '../data/supabase-supplier-profile';

const root = resolve(__dirname, '../..');

function baseProfile(over: Partial<SupplierProfileRow> = {}): SupplierProfileRow {
  return {
    id: 's1',
    display_name: 'Brand',
    contact_phone: null,
    payout_method: 'bank',
    payout_iban: 'FI2112345600000785',
    payout_bic: 'NDEAFIHH',
    payout_paypal_email: null,
    business_type: 'company',
    company_legal_name: 'Legal Oy',
    company_registration_number: '123',
    managing_directors: null,
    business_address: null,
    address_street: 'Street 1',
    address_country: 'FI',
    address_city: 'Helsinki',
    address_postal_code: '00100',
    tax_id: null,
    vat_id: null,
    verification_status: 'verified',
    verification_submitted_at: '2026-01-01',
    payout_verification_status: 'verified',
    payout_verification_submitted_at: '2026-01-01',
    business_verification_feedback: null,
    payout_verification_feedback: null,
    insurance_policy_number: null,
    insurance_coverage: null,
    insurance_start: null,
    insurance_end: null,
    insurance_provider: null,
    privacy_policy_text: null,
    terms_conditions_text: null,
    payment_cycle: 'monthly',
    payout_threshold_min: null,
    welcome_email_sent_at: null,
    business_logo_url: null,
    public_description: null,
    identity_document_path: null,
    company_registration_document_path: 'doc.pdf',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...over,
  };
}

describe('Supplier embedded Connect experience', () => {
  const edge = readFileSync(
    resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
    'utf8'
  );
  const ui = readFileSync(
    resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
    'utf8'
  );
  const embedded = readFileSync(
    resolve(root, 'src/components/supplier/ConnectEmbeddedPanel.tsx'),
    'utf8'
  );
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/275_listing_publish_connect_banking_gate.sql'),
    'utf8'
  );
  const pkg = readFileSync(resolve(root, 'package.json'), 'utf8');

  it('Phase 1 source-of-truth separates Traverion profile from Stripe KYC', () => {
    expect(SUPPLIER_IDENTITY_SOURCE_OF_TRUTH.stripe_owned.join(' ')).toMatch(/KYC|bank/i);
    expect(SUPPLIER_IDENTITY_SOURCE_OF_TRUTH.routes.payments_payouts).toContain('tab=settings');
  });

  it('creates Account Sessions server-side with embedded components and hosted fallback', () => {
    expect(edge).toContain('accountSessions.create');
    expect(edge).toContain('account_onboarding');
    expect(edge).toContain('account_management');
    expect(edge).toContain('external_account_collection');
    expect(edge).toContain('accountLinks.create');
    expect(edge).toContain('hosted_fallback');
    expect(edge).toContain('isStripeTestSecretKey');
    expect(edge).toContain('client_secret');
    expect(edge).not.toMatch(/sk_live_/);
  });

  it('renders Connect.js embedded panel with English locale and TEST publishable key gate', () => {
    expect(pkg).toContain('@stripe/react-connect-js');
    expect(pkg).toContain('@stripe/connect-js');
    expect(embedded).toContain('loadConnectAndInitialize');
    expect(embedded).toContain('locale: CONNECT_EMBEDDED_LOCALE');
    expect(embedded).toContain("en-GB");
    expect(embedded).toContain('ConnectAccountOnboarding');
    expect(embedded).toContain('ConnectAccountManagement');
    expect(embedded).toContain('isStripeTestPublishableKey');
    expect(embedded).toContain('fetchConnectAccountSessionSecret');
  });

  it('premium payout settings covers three money sections and native verification workspace', () => {
    expect(ui).toContain('Payout settings');
    expect(ui).toContain('Payout account');
    expect(ui).toContain('Bank account');
    expect(ui).toContain('Payout preferences');
    expect(ui).toContain('Complete verification');
    expect(ui).toContain('Manage bank account');
    expect(ui).toContain('Add bank account');
    expect(ui).toContain('SupplierNativeVerificationJourney');
    expect(ui).not.toContain('Business information');
    expect(ui).not.toMatch(/Complete Stripe|Stripe Connect|Sandbox|TEST mode|Connected account/i);
  });

  it('progress adapts to Stripe capability state', () => {
    expect(deriveConnectExperienceState(baseProfile({ connect_onboarding_status: 'not_started' }))).toBe(
      'not_started'
    );
    expect(
      deriveConnectExperienceState(
        baseProfile({
          stripe_connected_account_id: 'acct_x',
          connect_onboarding_status: 'restricted',
          connect_details_submitted: true,
          connect_requirements_currently_due: ['individual.verification.document'],
        })
      )
    ).toBe('additional_information_required');
    expect(
      deriveConnectExperienceState(
        baseProfile({
          stripe_connected_account_id: 'acct_x',
          connect_onboarding_status: 'complete',
          connect_payouts_enabled: true,
          connect_requirements_currently_due: [],
          connect_requirements_past_due: [],
        })
      )
    ).toBe('ready_for_bank_payouts');
    const steps = buildConnectProgressSteps(
      baseProfile({
        stripe_connected_account_id: 'acct_x',
        connect_details_submitted: true,
        connect_onboarding_status: 'pending',
      })
    );
    expect(steps).toHaveLength(4);
  });

  it('separates account verification blocks from earnings eligibility', () => {
    const blocks = listSupplierPayoutBlocks({
      profile: baseProfile({ connect_onboarding_status: 'not_started' }),
      financialHold: true,
      debtMinor: 500,
      eligibleEarningsMinor: 0,
      scheduleReached: false,
    });
    expect(blocks.some((b) => b.category === 'account')).toBe(true);
    expect(blocks.some((b) => b.category === 'earnings')).toBe(true);
    expect(blocks.some((b) => b.category === 'schedule')).toBe(true);
  });

  it('publish gate accepts Connect payouts OR legacy IBAN without unpublishing policy change', () => {
    expect(
      isSupplierBankingReadyForPublish(
        baseProfile({
          payout_verification_status: 'pending',
          connect_payouts_enabled: true,
          stripe_connected_account_id: 'acct_x',
        })
      )
    ).toBe(true);
    expect(
      isSupplierReadyToPublishTours(
        baseProfile({
          payout_verification_status: 'pending',
          payout_iban: null,
          payout_bic: null,
          connect_payouts_enabled: true,
          stripe_connected_account_id: 'acct_x',
        })
      )
    ).toBe(true);
    expect(mig).toContain('connect_payouts_enabled');
    expect(mig).toContain('Does not restrict edits to already-published');
  });
});
