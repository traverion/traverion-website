import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('Post-Phase-6 certification contracts', () => {
  const cancelWf = readFileSync(
    resolve(root, '.github/workflows/process-cancel-resolutions.yml'),
    'utf8'
  );
  const supportWf = readFileSync(
    resolve(root, '.github/workflows/process-support-case-escalations.yml'),
    'utf8'
  );
  const earningsWf = readFileSync(
    resolve(root, '.github/workflows/refresh-supplier-earnings.yml'),
    'utf8'
  );
  const cancelEdge = readFileSync(
    resolve(root, 'supabase/functions/process-cancel-resolutions/index.ts'),
    'utf8'
  );
  const supportEdge = readFileSync(
    resolve(root, 'supabase/functions/process-support-case-escalations/index.ts'),
    'utf8'
  );
  const earningsEdge = readFileSync(
    resolve(root, 'supabase/functions/refresh-supplier-earnings/index.ts'),
    'utf8'
  );
  const mig270 = readFileSync(
    resolve(root, 'supabase/migrations/270_supplier_earnings_payout_eligibility_phase5.sql'),
    'utf8'
  );
  const mig271 = readFileSync(
    resolve(root, 'supabase/migrations/271_supplier_income_reporting_phase6.sql'),
    'utf8'
  );
  const mig272 = readFileSync(
    resolve(root, 'supabase/migrations/272_repair_listing_traffic_events.sql'),
    'utf8'
  );
  const incomePage = readFileSync(resolve(root, 'src/pages/supplier/SupplierEarnings.tsx'), 'utf8');

  it('cron workflows share BOOKING_REMINDER_CRON_SECRET fallback and document dispatch bootstrap', () => {
    for (const wf of [cancelWf, supportWf, earningsWf]) {
      expect(wf).toContain('BOOKING_REMINDER_CRON_SECRET');
      expect(wf).toContain('workflow_dispatch');
      expect(wf).toMatch(/workflow_dispatch[\s\S]*once/);
    }
    expect(cancelWf).toContain("cron: '*/5 * * * *'");
  });

  it('edge functions reject missing/invalid cron auth and keep Stripe transfers disabled', () => {
    expect(cancelEdge).toContain('Unauthorized');
    expect(supportEdge).toContain('Unauthorized');
    expect(earningsEdge).toContain('Unauthorized');
    expect(earningsEdge).toContain('stripe_transfer: false');
    expect(supportEdge).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('holds gate eligibility without claiming Stripe fund freezes', () => {
    expect(mig270).toContain('booking_financial_holds');
    expect(mig270).toContain('booking_blocks_payout_eligibility');
    expect(mig270).toContain('READY periods only — no Stripe Connect transfer or bank payout');
    expect(mig270).not.toContain('stripe.payouts');
    expect(mig270).not.toContain('transfers.create');
  });

  it('Income Overview uses Phase 5 RPCs and does not label READY as Paid', () => {
    expect(incomePage).toContain('fetchSupplierPeriodSales');
    expect(incomePage).toContain('fetchSupplierPeriodEarnings');
    expect(incomePage).toContain('Period sales');
    expect(incomePage).toContain('Period earnings');
    expect(incomePage).toContain('Automatic bank payouts are not enabled');
    expect(mig271).toContain('payment_reference_required');
  });

  it('repairs listing_traffic_events without non-immutable timestamptz index', () => {
    expect(mig272).toContain('listing_traffic_events');
    expect(mig272).not.toContain("date_trunc('hour', created_at)");
  });
});
