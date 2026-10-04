import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const mig = readFileSync(
  resolve(root, 'supabase/migrations/241_refunds_financial_recovery_engine.sql'),
  'utf8'
);
const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const admin = readFileSync(
  resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);

describe('financial recovery engine — migration contracts', () => {
  it('sets 48h hold and recovery/hold/dispute/prepare_refund surfaces', () => {
    expect(mig).toContain("'payout_hold_hours'");
    expect(mig).toContain('48');
    expect(mig).toContain('supplier_recovery');
    expect(mig).toContain('booking_financial_holds');
    expect(mig).toContain('apply_booking_dispute_event');
    expect(mig).toContain('prepare_refund_instruction');
    expect(mig).toContain('commercial_record_post_payout_recovery');
    expect(mig).toContain('commercial_unlink_earning_from_unpaid_periods');
    expect(mig).toContain('booking_blocks_payout_eligibility');
    expect(mig).toContain('admin_booking_financial_investigation');
    expect(mig).toContain('executes_stripe');
    expect(mig).toContain('departureTimezone');
  });

  it('eligibility demotes cancelled/disputed/held bookings', () => {
    expect(mig).toContain('booking_blocks_payout_eligibility');
    expect(mig).toContain("v_status = 'cancelled'");
    expect(mig).toContain("'lost'");
  });
});

describe('financial recovery engine — edge wiring', () => {
  it('webhook handles dispute events', () => {
    expect(webhook).toContain('charge.dispute.created');
    expect(webhook).toContain('charge.dispute.closed');
    expect(webhook).toContain('apply_booking_dispute_event');
  });

  it('admin exposes investigation / hold / prepare refund', () => {
    expect(admin).toContain("'booking_financial_investigation'");
    expect(admin).toContain("'financial_hold_set'");
    expect(admin).toContain("'prepare_refund_instruction'");
  });
});
