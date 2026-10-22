import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('Phase 5: supplier earnings & payout eligibility', () => {
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/270_supplier_earnings_payout_eligibility_phase5.sql'),
    'utf8'
  );
  const edge = readFileSync(
    resolve(root, 'supabase/functions/refresh-supplier-earnings/index.ts'),
    'utf8'
  );
  const workflow = readFileSync(
    resolve(root, '.github/workflows/refresh-supplier-earnings.yml'),
    'utf8'
  );
  const adminEdge = readFileSync(
    resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
    'utf8'
  );
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');

  it('separates sales from earnings and uses service completion clocks', () => {
    expect(mig).toContain('supplier_period_sales');
    expect(mig).toContain('supplier_period_earnings');
    expect(mig).toContain('booking_service_completion_at');
    expect(mig).toContain('sold_at');
    expect(mig).toContain('service_completed_at');
    expect(mig).toContain('rescheduled_from_booking_id is null');
    expect(mig).toContain('one sale per PaymentIntent');
    expect(mig).toContain('Completed services only');
  });

  it('gates eligibility on holds, disputes, cancel resolution, and support cases', () => {
    expect(mig).toContain('booking_blocks_payout_eligibility');
    expect(mig).toContain('booking_financial_holds');
    expect(mig).toContain('booking_support_cases');
    expect(mig).toContain('pending_customer_choice');
    expect(mig).toContain("v_dispute in ('open', 'needs_response', 'under_review', 'lost')");
  });

  it('nets recovery debt without negative payouts and without Stripe transfers', () => {
    expect(mig).toContain('supplier_outstanding_recovery_minor');
    expect(mig).toContain('v_net := greatest(v_amount - v_applied_debt, 0)');
    expect(mig).toContain('payout-debt-apply:');
    expect(mig).toContain('READY periods only — no Stripe Connect transfer or bank payout');
    expect(mig).toContain("stripe_transfer', false");
  });

  it('enforces one active earning per PaymentIntent and syncs reschedules', () => {
    expect(mig).toContain('supplier_earning_items_pi_active_uidx');
    expect(mig).toContain('phase5_sync_earnings_after_reschedule');
    expect(mig).toContain('tr_bookings_phase5_reschedule_earnings');
    expect(mig).toContain('tr_supplier_earning_items_phase5_enrich');
  });

  it('exposes reconciliation for admins', () => {
    expect(mig).toContain('reconcile_supplier_commercial');
    expect(mig).toContain('duplicate_pi_earnings');
    expect(mig).toContain('eligible_but_blocked');
    expect(mig).toContain('missing_earning');
    expect(mig).toContain('held_in_ready_period');
    expect(adminEdge).toContain("'reconcile_supplier_commercial'");
    expect(adminEdge).toContain("'refresh_earning_eligibility'");
  });

  it('schedules eligibility refresh without enabling Stripe bank payouts', () => {
    expect(edge).toContain('refresh_supplier_earning_eligibility');
    expect(edge).toContain('stripe_transfer: false');
    expect(edge).toContain('prepare_payouts');
    expect(workflow).toContain("cron: '18 * * * *'");
    expect(workflow).toContain('refresh-supplier-earnings');
    expect(config).toContain('[functions.refresh-supplier-earnings]');
  });

  it('preserves Phase 3–4 cancel/refund/hold foundations', () => {
    const mig268 = readFileSync(
      resolve(root, 'supabase/migrations/268_supplier_cancel_customer_resolution.sql'),
      'utf8'
    );
    const mig269 = readFileSync(
      resolve(root, 'supabase/migrations/269_booking_support_cases_phase4.sql'),
      'utf8'
    );
    expect(mig268).toContain('reschedule_supplier_cancelled_booking');
    expect(mig269).toContain('booking_financial_holds');
    expect(mig).toContain('booking_financial_holds');
  });
});
