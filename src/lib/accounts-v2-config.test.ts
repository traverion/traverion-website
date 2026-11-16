import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertV2RecipientConfig,
  buildV2RecipientCreateBody,
  finlandSupplierCountry,
} from './accounts-v2-config';
import { connectCanReceiveTransfers } from './connect-payout-status';
import { firstOutstandingWizardStep, payoutWizardStepForRequirement } from './payout-setup-wizard';
import { mirrorConnectAccount } from '../../supabase/functions/_shared/connect-account-mirror';

const edge = readFileSync(
  resolve(__dirname, '../../supabase/functions/connect-supplier-onboarding/index.ts'),
  'utf8'
);

describe('Accounts v2 TEST recipient configuration', () => {
  it('builds a Finnish recipient account without merchant or card payments', () => {
    const body = buildV2RecipientCreateBody({
      supplierId: 'supplier-1',
      environment: 'test',
      email: 'supplier@example.com',
    });
    expect(body.dashboard).toBe('none');
    expect(JSON.stringify(body)).toContain('stripe_transfers');
    expect(JSON.stringify(body.configuration)).not.toContain('merchant');
    expect(JSON.stringify(body.configuration)).not.toContain('card_payments');
    expect(finlandSupplierCountry('SE')).toBeNull();
    expect(finlandSupplierCountry('')).toBe('FI');
  });

  it('accepts only the selected collectors', () => {
    const ok = assertV2RecipientConfig({
      dashboard: 'none',
      identity: { country: 'FI' },
      applied_configurations: ['recipient'],
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
          requirements_collector: 'application',
        },
      },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'restricted' } } } } },
    });
    expect(ok.ok).toBe(true);
    const rejected = assertV2RecipientConfig({
      dashboard: 'express',
      applied_configurations: ['recipient', 'merchant'],
      defaults: { responsibilities: { fees_collector: 'application_express', losses_collector: 'application', requirements_collector: 'stripe' } },
      configuration: { merchant: { capabilities: { card_payments: { status: 'inactive' } } } },
    });
    expect(rejected.ok).toBe(false);
  });

  it('maps Accounts v2 requirement keys onto the six wizard steps', () => {
    expect(payoutWizardStepForRequirement('identity.business_details.registered_name')).toBe('business');
    expect(payoutWizardStepForRequirement('identity.business_details.id_numbers.fi_yt')).toBe('business');
    expect(payoutWizardStepForRequirement('representative.given_name')).toBe('representative');
    expect(payoutWizardStepForRequirement('identity.attestations.terms_of_service.account.date')).toBe('identity');
    expect(payoutWizardStepForRequirement('external_account')).toBe('bank');
    expect(
      firstOutstandingWizardStep([
        'external_account',
        'identity.business_details.registered_name',
        'representative.given_name',
      ])
    ).toBe('business');
  });

  it('does not treat a TEST account or inactive transfers as verified', () => {
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: true,
        connect_onboarding_status: 'complete',
        connect_account_livemode: false,
        stripe_transfers_status: 'active',
      })
    ).toBe(false);
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: true,
        connect_onboarding_status: 'complete',
        connect_account_livemode: true,
        stripe_transfers_status: 'restricted',
      })
    ).toBe(false);
  });

  it('stores a v2 dashboard-none account as the native wizard type', () => {
    const mirror = mirrorConnectAccount({
      id: 'acct_test',
      type: 'none',
      livemode: false,
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      country: 'FI',
      capabilities: { transfers: 'active', card_payments: null },
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
    });
    expect(mirror.connect_account_type).toBe('custom');
    expect(mirror.connect_charges_enabled).toBe(false);
    expect(mirror.connect_payouts_enabled).toBe(true);
  });

  it('keeps LIVE creation on v1 Custom and does not fall back after a v2 rejection', () => {
    expect(edge).toContain("if (platformMode === 'test')");
    expect(edge).toContain('buildV2RecipientCreateBody');
    expect(edge).toContain('No legacy account was created');
    expect(edge).toContain("type: 'custom'");
    expect(edge).not.toContain('api_native_express_fallback');
    const testBranch = edge.slice(edge.indexOf("if (platformMode === 'test')"), edge.indexOf("const country = (profile.address_country"));
    expect(testBranch).toContain('buildV2RecipientCreateBody');
    expect(testBranch).not.toContain('stripe.accounts.create');
  });
});
