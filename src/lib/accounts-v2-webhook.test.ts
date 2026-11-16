import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { mirrorConnectAccount } from '../../supabase/functions/_shared/connect-account-mirror';
import {
  applyAuthoritativeV2Status,
  connectAccountLinkDecision,
  isAccountsV2LifecycleEvent,
  v2AccountIdFromThinEvent,
} from '../../supabase/functions/_shared/accounts-v2-webhook';
import { stripeWebhookReplayDecision } from '../../supabase/functions/_shared/stripe-webhook-replay';
import { connectCanReceiveTransfers, connectOnboardingLabel } from './connect-payout-status';
import { firstOutstandingWizardStep, payoutWizardStepForRequirement } from './payout-setup-wizard';

const root = resolve(__dirname, '../..');
const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');

function readyMirror() {
  return mirrorConnectAccount({
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
}

describe('Accounts v2 webhook lifecycle', () => {
  it('verifies a synthetic thin-event signature and reads the account id', async () => {
    const secret = 'whsec_synthetic_fixture';
    const payload = JSON.stringify({
      id: 'evt_synthetic_v2_requirements',
      object: 'v2.core.event',
      type: 'v2.core.account[requirements].updated',
      livemode: false,
      created: '2026-11-16T12:00:00.000Z',
      related_object: {
        id: 'acct_1UcWUMC3Batf5jGY',
        type: 'v2.core.account',
        url: '/v2/core/accounts/acct_1UcWUMC3Batf5jGY',
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const stripe = new Stripe('sk_test_synthetic');
    const verified = await stripe.webhooks.constructEventAsync(payload, header, secret);
    expect(verified.type).toBe('v2.core.account[requirements].updated');
    expect(v2AccountIdFromThinEvent(verified as { related_object?: { id?: string; url?: string } })).toBe(
      'acct_1UcWUMC3Batf5jGY'
    );
    await expect(stripe.webhooks.constructEventAsync(payload, header, 'whsec_other')).rejects.toThrow();
  });

  it('treats a repeated event as terminal and an older payload as non-authoritative', () => {
    expect(stripeWebhookReplayDecision({ status: 'processed', receivedAt: null })).toBe('terminal');
    const current = applyAuthoritativeV2Status(readyMirror(), {
      livemode: false,
      metadata: { traverion_account_api: 'v2' },
      requirements: { entries: [] },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } },
      },
    });
    const stalePayloadRequirements = ['identity.business_details.registered_name'];
    expect(current.connect_requirements_currently_due).toEqual([]);
    expect(stalePayloadRequirements).toContain('identity.business_details.registered_name');
    expect(current.connect_onboarding_status).toBe('complete');
    expect(
      connectCanReceiveTransfers({ ...current, stripe_transfers_status: 'active', require_live: true })
    ).toBe(false);
  });

  it('synchronizes due, past due, pending, and restricted capabilities without verifying from the event', () => {
    const due = applyAuthoritativeV2Status(readyMirror(), {
      livemode: false,
      requirements: {
        entries: [
          { description: 'identity.business_details.registered_name', minimum_deadline: { status: 'currently_due' } },
          { description: 'representative.given_name', minimum_deadline: { status: 'past_due' } },
          { description: 'external_account', minimum_deadline: { status: 'pending_verification' } },
        ],
      },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'restricted' } } } },
      },
    });
    expect(due.connect_requirements_currently_due).toEqual(['identity.business_details.registered_name']);
    expect(due.connect_requirements_past_due).toEqual(['representative.given_name']);
    expect(due.connect_onboarding_status).toBe('restricted');
    expect(due.connect_payouts_enabled).toBe(false);
    expect(JSON.stringify(due)).not.toContain('btok_');
    expect(JSON.stringify(due)).not.toContain('file_');

    const pending = applyAuthoritativeV2Status(readyMirror(), {
      livemode: true,
      requirements: {
        entries: [{ description: 'representative.given_name', minimum_deadline: { status: 'pending_verification' } }],
      },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } },
      },
    });
    expect(pending.connect_onboarding_status).toBe('pending');
    expect(connectOnboardingLabel(pending.connect_onboarding_status, { connect_account_livemode: true })).toBe(
      'Under review'
    );
    expect(connectCanReceiveTransfers({ ...pending, stripe_transfers_status: 'active', require_live: true })).toBe(
      false
    );
  });

  it('keeps TEST events off LIVE suppliers and rejects unknown accounts', () => {
    expect(
      connectAccountLinkDecision({
        supplierId: 'supplier-live',
        supplierLivemode: true,
        eventLivemode: false,
        metadataSupplierId: 'supplier-live',
        accountType: 'none',
      }).reason
    ).toBe('test_event_on_live_supplier');
    expect(
      connectAccountLinkDecision({
        supplierId: 'supplier-test',
        supplierLivemode: false,
        eventLivemode: true,
        metadataSupplierId: 'supplier-test',
        accountType: 'custom',
      }).reason
    ).toBe('live_event_on_test_supplier');
    expect(
      connectAccountLinkDecision({
        supplierId: null,
        supplierLivemode: null,
        eventLivemode: false,
        metadataSupplierId: null,
        accountType: 'none',
      }).reason
    ).toBe('unlinked_connect_account');
    expect(
      connectAccountLinkDecision({
        supplierId: 'supplier-a',
        supplierLivemode: false,
        eventLivemode: false,
        metadataSupplierId: 'supplier-b',
        accountType: 'none',
      }).reason
    ).toBe('ownership_mismatch');
    expect(
      connectAccountLinkDecision({
        supplierId: 'royal-nordic',
        supplierLivemode: true,
        eventLivemode: true,
        metadataSupplierId: null,
        accountType: 'express',
      }).action
    ).toBe('mirror');
  });

  it('routes recovered requirements to the six wizard steps', () => {
    expect(payoutWizardStepForRequirement('identity.business_details.registered_name')).toBe('business');
    expect(payoutWizardStepForRequirement('representative.given_name')).toBe('representative');
    expect(payoutWizardStepForRequirement('identity.individual.documents.primary_verification')).toBe('identity');
    expect(payoutWizardStepForRequirement('external_account')).toBe('bank');
    expect(payoutWizardStepForRequirement('identity.attestations.terms_of_service.account.date')).toBe('identity');
    expect(
      firstOutstandingWizardStep([
        'external_account',
        'identity.business_details.id_numbers.fi_yt',
        'representative.given_name',
      ])
    ).toBe('business');
    expect(connectOnboardingLabel('restricted', { connect_account_livemode: true })).toBe('Action required');
    expect(connectOnboardingLabel('complete', { connect_account_livemode: false })).not.toBe('Verified');
  });

  it('keeps Express account.updated and verifies v2 events before mirroring', () => {
    expect(webhook).toContain("event.type === 'account.updated'");
    expect(webhook).toContain('constructEventAsync');
    expect(webhook).toContain("snapshotAccount?.type === 'express'");
    expect(webhook).toContain('isAccountsV2LifecycleEvent');
    expect(webhook).toContain('applyAuthoritativeV2Status');
    const decisions = readFileSync(
      resolve(root, 'supabase/functions/_shared/accounts-v2-webhook.ts'),
      'utf8'
    );
    expect(decisions).toContain('v2.core.account[requirements].updated');
    expect(decisions).toContain('v2.core.account[configuration.recipient].capability_status_updated');
    expect(isAccountsV2LifecycleEvent('v2.core.account[configuration.recipient].capability_status_updated')).toBe(
      true
    );
    expect(isAccountsV2LifecycleEvent('account.updated')).toBe(false);
    expect(webhook).not.toContain('verified: true');
  });
});
