import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1739: shrink booking_earnings on Stripe partial refund', () => {
  it('migration defines shrink_paid_booking_earnings service-role RPC', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/214_shrink_paid_booking_earnings_partial.sql'),
      'utf8'
    );
    expect(sql).toContain('shrink_paid_booking_earnings');
    expect(sql).toContain('after partial Stripe refund');
    expect(sql).toContain('grant execute on function public.shrink_paid_booking_earnings');
    expect(sql).toContain('to service_role');
  });

  it('stripe-webhook calls shrink after amount_paid update', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1739');
    expect(src).toContain("rpc('shrink_paid_booking_earnings'");
    expect(src).toContain('p_remaining: remainingPaid');
  });
});
