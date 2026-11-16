import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertV2RecipientConfig,
  buildV2RecipientCreateBody,
  finlandSupplierCountry,
  v2StripeTransfersStatus,
} from './accounts-v2-config';
import { liveCustomCreateAllowed } from '../../supabase/functions/_shared/live-custom-onboarding-gate';
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
    expect(finlandSupplierCountry('')).toBeNull();
    expect(finlandSupplierCountry('FI')).toBe('FI');
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

  it('uses the same recipient body for a LIVE environment', () => {
    const body = buildV2RecipientCreateBody({
      supplierId: 'supplier-live',
      displayName: 'Live Supplier',
      environment: 'live',
    });
    expect((body.metadata as { traverion_environment: string }).traverion_environment).toBe('live');
    expect(body.dashboard).toBe('none');
    const responsibilities = (body.defaults as { responsibilities: Record<string, string> }).responsibilities;
    expect(responsibilities.fees_collector).toBe('application');
    expect(responsibilities.losses_collector).toBe('application');
    expect(JSON.stringify(body)).toContain('stripe_transfers');
    expect(JSON.stringify(body.configuration)).not.toContain('merchant');
    expect(JSON.stringify(body.configuration)).not.toContain('card_payments');
    expect((body.identity as { country: string }).country).toBe('fi');
  });

  it('blocks LIVE creation before Stripe when the gate is off or the allowlist is empty', () => {
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 0, supplierApproved: true }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: 1, supplierApproved: false }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'live', flagValue: null, supplierApproved: true }).allowed
    ).toBe(false);
    expect(
      liveCustomCreateAllowed({ platformMode: 'test', flagValue: 0, supplierApproved: false }).allowed
    ).toBe(true);
  });

  it('rejects a TEST account as verified for a LIVE supplier and inactive LIVE transfers', () => {
    const ready = {
      connect_payouts_enabled: true,
      connect_onboarding_status: 'complete' as const,
      connect_requirements_currently_due: [],
      connect_requirements_past_due: [],
    };
    expect(
      connectCanReceiveTransfers({
        ...ready,
        connect_account_livemode: false,
        require_live: true,
        stripe_transfers_status: 'active',
      })
    ).toBe(false);
    expect(
      connectCanReceiveTransfers({
        ...ready,
        connect_account_livemode: true,
        require_live: true,
        stripe_transfers_status: 'restricted',
      })
    ).toBe(false);
    expect(
      connectCanReceiveTransfers({
        ...ready,
        connect_account_livemode: true,
        require_live: true,
        stripe_transfers_status: 'active',
      })
    ).toBe(true);
    expect(v2StripeTransfersStatus(null)).toBe('missing');
    expect(v2StripeTransfersStatus({ configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } } })).toBe('active');
  });

  it('keeps every LIVE create behind the gate and never falls back to Custom or Express', () => {
    expect(edge).toContain("from '../_shared/accounts-v2-config.ts'");
    expect(edge).not.toContain('src/lib/accounts-v2-config');
    expect(edge).not.toContain('stripe.accounts.create(');
    expect(edge).not.toContain('api_native_express_fallback');
    expect(edge).toContain('No legacy account was created');
    expect(edge).toContain('LIVE connected accounts cannot be used on TEST Traverion.');
    expect(edge).toContain('TEST connected accounts cannot be used on LIVE Traverion.');
    expect(edge).toContain('Connected account does not belong to this supplier organization');

    const createFn = edge.slice(
      edge.indexOf('async function createAccountsV2Supplier'),
      edge.indexOf('const body = (await req.json()')
    );
    const gateAt = createFn.indexOf('assertLiveCustomCreateAllowed');
    const countryAt = createFn.indexOf('finlandSupplierCountry');
    const postAt = createFn.indexOf("stripeV2(\n        'POST'");
    expect(gateAt).toBeGreaterThan(-1);
    expect(countryAt).toBeGreaterThan(gateAt);
    expect(postAt).toBeGreaterThan(countryAt);
    expect(createFn).not.toContain('stripe.accounts.create');
    expect(createFn).toContain("environment: platformMode");
    expect(createFn).toContain('traverion-v2:');

    const supplierPath = edge.slice(
      edge.indexOf('async function ensureConnectedAccount'),
      edge.indexOf('function statusPayload')
    );
    const expressAt = supplierPath.indexOf("accountType === 'express'");
    const supplierGateAt = supplierPath.indexOf('assertLiveCustomCreateAllowed');
    const claimAt = supplierPath.indexOf('claimConnectCreate');
    const supplierPostAt = supplierPath.indexOf('createAccountsV2Supplier');
    expect(expressAt).toBeGreaterThan(-1);
    expect(supplierGateAt).toBeGreaterThan(expressAt);
    expect(claimAt).toBeGreaterThan(supplierGateAt);
    expect(supplierPostAt).toBeGreaterThan(claimAt);
    expect(supplierPath).toContain("claim.action === 'reuse'");
    expect(supplierPath).toContain("claim.action === 'in_progress'");
    expect(supplierPath).toContain('refusing to create a second LIVE account');
    expect(supplierPath).toContain('releaseConnectCreateClaim');

    const adminPath = edge.slice(
      edge.indexOf("action === 'admin_ensure_live_connect'"),
      edge.indexOf('const authed = createClient')
    );
    const adminGateAt = adminPath.indexOf('assertLiveCustomCreateAllowed');
    const adminCreateAt = adminPath.indexOf('createAccountsV2Supplier');
    expect(adminGateAt).toBeGreaterThan(-1);
    expect(adminCreateAt).toBeGreaterThan(adminGateAt);
    expect(adminPath).not.toContain('stripe.accounts.create');
    expect(adminPath).not.toMatch(/\n\s*type: 'custom'/);
    expect(edge).not.toMatch(/\n\s*type: 'custom'/);
  });
});
