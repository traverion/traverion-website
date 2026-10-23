import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const mig = readFileSync(
  resolve(root, 'supabase/migrations/273_connect_payout_foundation.sql'),
  'utf8'
);

describe('Mission 2 Phase 1: Connect payout foundation', () => {
  it('adds Connect account mirrors and payout rail without enabling live money', () => {
    expect(mig).toContain('stripe_connected_account_id');
    expect(mig).toContain("payout_rail in ('manual_iban', 'stripe_connect')");
    expect(mig).toContain('connect_onboarding_status');
    expect(mig).toContain('connect_charges_enabled');
    expect(mig).toContain('connect_payouts_enabled');
    expect(mig).toContain('connect_debit_negative_balances boolean not null default false');
    expect(mig).toContain('live_money_enabled = false and environment = \'test\'');
    expect(mig).toContain("('stripe_connect_transfers_enabled', 0");
  });

  it('creates transfer, allocation, bank payout, reconciliation, and exception tables', () => {
    expect(mig).toContain('create table if not exists public.supplier_transfer_batches');
    expect(mig).toContain('create table if not exists public.supplier_transfer_attempts');
    expect(mig).toContain('create table if not exists public.supplier_transfer_allocations');
    expect(mig).toContain('create table if not exists public.supplier_bank_payout_attempts');
    expect(mig).toContain('create table if not exists public.supplier_payout_reconciliation_events');
    expect(mig).toContain('create table if not exists public.supplier_payout_exceptions');
    expect(mig).toContain('unique (idempotency_key)');
    expect(mig).toContain('supplier_transfer_attempts_period_active_uidx');
  });

  it('extends periods with Connect lifecycle and never equates transfer to bank paid', () => {
    expect(mig).toContain('connect_lifecycle');
    expect(mig).toContain("'transfer_completed'");
    expect(mig).toContain("'bank_payout_paid'");
    expect(mig).toContain('latest_transfer_attempt_id');
    expect(mig).toContain('latest_bank_payout_attempt_id');
  });

  it('exposes liquidity helper that subtracts reserves from Stripe available', () => {
    expect(mig).toContain('compute_platform_transferable_minor');
    expect(mig).toContain('Never treat raw Stripe available as fully fundable');
    expect(mig).toContain('platform_refund_reserve_minor');
    expect(mig).toContain('platform_operating_reserve_minor');
  });

  it('enables RLS with supplier self-read and service_role writes', () => {
    expect(mig).toContain('enable row level security');
    expect(mig).toContain('is_supplier_account_side');
    expect(mig).toContain('is_traverion_panel_admin');
    expect(mig).toContain('grant all on table public.supplier_transfer_attempts to service_role');
  });
});
