import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  connectCanReceiveTransfers,
  connectOnboardingLabel,
  connectPayoutPresentationStatus,
  payoutBlockReason,
} from './connect-payout-status';

const root = resolve(__dirname, '../..');

describe('Mission 2: Connect onboarding + TEST transfer engine', () => {
  const onboarding = readFileSync(
    resolve(root, 'supabase/functions/connect-supplier-onboarding/index.ts'),
    'utf8'
  );
  const transfers = readFileSync(
    resolve(root, 'supabase/functions/execute-supplier-transfers/index.ts'),
    'utf8'
  );
  const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const mig274 = readFileSync(
    resolve(root, 'supabase/migrations/274_connect_transfer_orchestration.sql'),
    'utf8'
  );
  const settings = readFileSync(
    resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
    'utf8'
  );
  const earnings = readFileSync(resolve(root, 'src/pages/supplier/SupplierEarnings.tsx'), 'utf8');
  const adminEdge = readFileSync(
    resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
    'utf8'
  );
  const adminUi = readFileSync(
    resolve(root, 'src/components/admin/AdminCommercialPanel.tsx'),
    'utf8'
  );
  const cron = readFileSync(
    resolve(root, '.github/workflows/execute-supplier-transfers.yml'),
    'utf8'
  );
  const mirror = readFileSync(
    resolve(root, 'supabase/functions/_shared/connect-account-mirror.ts'),
    'utf8'
  );

  it('1. onboarding uses Stripe-hosted Account Links and never trusts redirect alone', () => {
    expect(onboarding).toContain("type: 'account_onboarding'");
    expect(onboarding).toContain('accounts.create');
    expect(onboarding).toContain('accountLinks.create');
    expect(onboarding).toContain('isStripeTestSecretKey');
    expect(onboarding).toContain('accounts.retrieve');
    expect(onboarding).toContain('not the browser return URL');
    expect(settings).toContain('Start Stripe verification');
    expect(settings).toContain('Resume Stripe verification');
    expect(settings).toContain('invokeConnectSupplierOnboarding');
    expect(settings).toContain('Requirements currently due');
    expect(mirror).toContain('Never treat a browser return URL alone as verified');
  });

  it('2–4. transfer engine requires TEST kill switches and durable idempotency', () => {
    expect(transfers).toContain('STRIPE_CONNECT_TRANSFERS_ENABLED');
    expect(transfers).toContain("transfersFlag !== 'test'");
    expect(transfers).toContain('isStripeTestSecretKey');
    expect(transfers).toContain('stripe_connect_transfers_enabled');
    expect(transfers).toContain('live_money_enabled: false');
    expect(transfers).toContain("environment: 'test'");
    expect(transfers).toContain('reserve_supplier_transfer_attempt');
    expect(transfers).toContain('compute_platform_transferable_minor');
    expect(transfers).toContain('idempotencyKey');
    expect(transfers).toContain('insufficient_platform_liquidity');
    expect(mig274).toContain('reserve_supplier_transfer_attempt');
    expect(mig274).toContain('supplier_connect_transfer_preflight');
    expect(mig274).toContain('list_due_connect_transfer_periods');
    expect(mig274).toContain('active_transfer_exists');
    expect(mig274).toContain('financial_hold');
  });

  it('5. bank payout tracking is distinct from transfer success', () => {
    expect(transfers).toContain('supplier_bank_payout_attempts');
    expect(transfers).toContain('create_bank_payouts');
    expect(webhook).toContain('payout.paid');
    expect(webhook).toContain('bank_payout_paid');
    expect(webhook).toContain('transfer.reversed');
    expect(connectPayoutPresentationStatus({
      periodStatus: 'ready',
      connectLifecycle: 'transfer_completed',
    })).toBe('Sent to connected account');
    expect(connectPayoutPresentationStatus({
      periodStatus: 'ready',
      connectLifecycle: 'bank_payout_paid',
    })).toBe('Paid to bank');
    expect(connectPayoutPresentationStatus({
      periodStatus: 'ready',
      connectLifecycle: 'bank_payout_failed',
    })).toBe('Bank payout failed');
  });

  it('6. Income UI preserves two overview cards and shows Connect lifecycle labels', () => {
    expect(earnings).toContain('data-testid="income-overview-primary-cards"');
    expect(earnings).toContain('Period sales');
    expect(earnings).toContain('Period earnings');
    expect(earnings).toContain('connectPayoutPresentationStatus');
    expect(earnings).toContain('Scheduled payout date');
    expect(earnings).toContain('Connect payout statuses (TEST)');
    expect(earnings).toContain('A Connect transfer alone is not a bank payment');
    expect(settings).toContain('Stripe Connect payouts');
    expect(settings).toContain('Can receive transfers');
  });

  it('7. webhook mirrors account.updated and dedupes via stripe_webhook_events', () => {
    expect(webhook).toContain("event.type === 'account.updated'");
    expect(webhook).toContain('mirrorConnectAccount');
    expect(webhook).toContain('stripe_webhook_events');
    expect(webhook).toContain('transfer.created');
  });

  it('8. admin exception dashboard + automated scheduling without approval gate', () => {
    expect(adminEdge).toContain("action === 'payout_exceptions_list'");
    expect(adminEdge).toContain("action === 'payout_exception_resolve'");
    expect(adminUi).toContain('Payout exceptions');
    expect(adminUi).toContain('Routine TEST transfers never require admin approval');
    expect(cron).toContain('execute-supplier-transfers');
    expect(cron).toContain('STRIPE_CONNECT_TRANSFERS_ENABLED');
    expect(cron).toContain('dry_run');
  });

  it('presentation helpers never mark incomplete Connect as transferable', () => {
    expect(connectOnboardingLabel('complete')).toBe('Verified for payouts');
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: true,
        connect_onboarding_status: 'complete',
        connect_requirements_currently_due: [],
      })
    ).toBe(true);
    expect(
      connectCanReceiveTransfers({
        connect_payouts_enabled: true,
        connect_onboarding_status: 'complete',
        connect_requirements_currently_due: ['individual.verification.document'],
      })
    ).toBe(false);
    expect(
      payoutBlockReason({
        connect_onboarding_status: 'restricted',
        connect_requirements_currently_due: ['business_profile.url'],
      })
    ).toMatch(/requirement/i);
  });
});
