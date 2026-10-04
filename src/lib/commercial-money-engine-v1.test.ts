import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const mig = readFileSync(resolve(root, 'supabase/migrations/238_commercial_money_engine_v1.sql'), 'utf8');
const adminEdge = readFileSync(
  resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const checkout = readFileSync(
  resolve(root, 'supabase/functions/create-booking-checkout-session/index.ts'),
  'utf8'
);
const earningsUi = readFileSync(resolve(root, 'src/pages/supplier/SupplierEarnings.tsx'), 'utf8');
const adminUi = readFileSync(resolve(root, 'src/components/admin/AdminCommercialPanel.tsx'), 'utf8');

describe('commercial money engine V1 — migration contracts', () => {
  it('defines terms, snapshots, earning items, payout periods', () => {
    expect(mig).toContain('create table if not exists public.supplier_commercial_terms');
    expect(mig).toContain('create table if not exists public.booking_commercial_snapshots');
    expect(mig).toContain('create table if not exists public.supplier_earning_items');
    expect(mig).toContain('create table if not exists public.supplier_payout_periods');
    expect(mig).toContain('prepare_due_supplier_payouts');
    expect(mig).toContain('freeze_booking_commercial_terms');
    expect(mig).toContain('record_paid_booking_earnings');
    expect(mig).toContain('shrink_paid_booking_earnings');
    expect(mig).toContain('legacy_zero');
    expect(mig).toContain('payout_hold_hours');
    expect(mig).toContain('OWNER DECISION');
  });

  it('locks STANDARD/FAST shapes and seeds existing suppliers', () => {
    expect(mig).toContain('standard_must_be_1500_monthly');
    expect(mig).toContain('fast_must_be_1800_semimonthly');
    expect(mig).toContain("plan_code in ('standard', 'fast', 'custom', 'legacy_zero')");
    expect(mig).toContain('Seeded STANDARD 15% monthly');
    expect(mig).toContain('trg_seed_supplier_commercial_terms');
  });

  it('grants money-mutating admin RPCs only to service_role', () => {
    expect(mig).toMatch(
      /grant execute on function public\.admin_set_supplier_commercial_terms[\s\S]*to service_role/
    );
    expect(mig).toMatch(
      /grant execute on function public\.admin_mark_payout_period_paid[\s\S]*to service_role/
    );
    expect(mig).toMatch(
      /grant execute on function public\.prepare_due_supplier_payouts[\s\S]*to service_role/
    );
    expect(mig).toContain('revoke all on function public.admin_set_supplier_commercial_terms');
    expect(mig).toContain('from anon, authenticated');
  });

  it('uses floor split so platform + supplier = gross', () => {
    expect(mig).toContain('commercial_split_minor');
    expect(mig).toContain('(p_gross_minor * p_bps) / 10000');
    expect(mig).toContain('commission_minor + supplier_minor = gross_minor');
  });

  it('does not rewrite historical paid bookings to 15%', () => {
    expect(mig).toContain('Legacy paid bookings without a snapshot remain 0%');
    expect(mig).toContain("'legacy_zero', 0");
    const legacyGuard = readFileSync(
      resolve(root, 'supabase/migrations/239_commercial_legacy_settle_guard.sql'),
      'utf8'
    );
    expect(legacyGuard).toContain('legacy');
    expect(legacyGuard).toContain('Pre-engine earnings already posted');
    const expFix = readFileSync(
      resolve(root, 'supabase/migrations/240_commercial_experience_at_fix.sql'),
      'utf8'
    );
    expect(expFix).toContain('Europe/Helsinki');
    expect(expFix).not.toContain('l.timezone');
  });
});

describe('commercial money engine V1 — edge + UI wiring', () => {
  it('checkout freezes terms at session create', () => {
    expect(checkout).toContain("rpc('freeze_booking_commercial_terms'");
  });

  it('admin edge exposes commercial + payout prep actions', () => {
    expect(adminEdge).toContain("'commercial_terms_get'");
    expect(adminEdge).toContain("'commercial_terms_set'");
    expect(adminEdge).toContain("'prepare_due_payouts'");
    expect(adminEdge).toContain("'mark_payout_period_paid'");
    expect(adminEdge).toContain('commercialConfirm === true');
  });

  it('supplier Money shows plan + GMV/commission/earnings/pending/eligible/paid', () => {
    expect(earningsUi).toContain('Gross bookings');
    expect(earningsUi).toContain('Traverion commission');
    expect(earningsUi).toContain('Your earnings');
    expect(earningsUi).toContain('Eligible for next payout');
    expect(earningsUi).toContain('Contact Traverion to change payout plan');
    expect(earningsUi).not.toContain('formatMoney(s.paid + s.included');
  });

  it('admin commercial panel requires CONFIRM', () => {
    expect(adminUi).toContain("CONFIRM");
    expect(adminUi).toContain('commercialConfirm: true');
    expect(adminUi).toContain('Prepare due payouts');
  });
});
