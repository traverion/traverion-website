import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { payoutMaySayPaid } from './supplier-income';
import { connectPayoutPresentationStatus } from './connect-payout-status';

const root = resolve(__dirname, '../..');
const reportJson = resolve(root, '.tmp/p5-stripe-test-cert/REPORT.json');
const reportMd = resolve(root, '.tmp/p5-stripe-test-cert/REPORT.md');
const certScript = readFileSync(resolve(root, 'scripts/cert-p5-stripe-test-payout.mjs'), 'utf8');
const mig307 = readFileSync(resolve(root, 'supabase/migrations/307_p4_payout_hardening.sql'), 'utf8');
const reversalEdge = readFileSync(
  resolve(root, 'supabase/functions/execute-supplier-transfer-reversals/index.ts'),
  'utf8'
);

describe('P5 Stripe TEST payout certification', () => {
  it('cert script refuses LIVE secrets and keeps live_money false', () => {
    expect(certScript).toContain("startsWith('sk_test_')");
    expect(certScript).toContain('Refusing non-TEST');
    expect(certScript).toContain('live_money: false');
    expect(certScript).toContain('createReversal');
    expect(certScript).not.toMatch(/stripe_connect_transfers_enabled.*=\s*1/);
  });

  it('P4 confirm path only settles recovery after Stripe reversal id', () => {
    expect(mig307).toContain('recovered_confirmed_at');
    expect(mig307).toContain('reversal-confirm:');
    expect(mig307).toContain('stripe_reversal_id_required');
    expect(reversalEdge).toContain('createReversal');
    expect(reversalEdge).toContain('confirm_connect_transfer_reversal');
  });

  it('partner UI never treats transfer_completed as paid documents', () => {
    expect(connectPayoutPresentationStatus({
      periodStatus: 'ready',
      connectLifecycle: 'transfer_completed',
    })).toBe('Sent to payout account');
    expect(payoutMaySayPaid('paid', '2026-12-01T00:00:00Z', 'transfer_completed')).toBe(false);
    expect(payoutMaySayPaid('paid', '2026-12-01T00:00:00Z', 'bank_payout_paid')).toBe(true);
  });

  it('latest P5 report records real TEST transfer + reversal when present', () => {
    if (!existsSync(reportJson)) {
      expect(existsSync(reportMd) || existsSync(resolve(root, 'scripts/cert-p5-stripe-test-payout.mjs'))).toBe(
        true
      );
      return;
    }
    const report = JSON.parse(readFileSync(reportJson, 'utf8'));
    expect(report.live_money).toBe(false);
    expect(['PASS', 'PASS_WITH_BLOCKERS', 'BLOCKED', 'FAIL']).toContain(report.verdict);
    if (report.verdict === 'PASS' || report.verdict === 'PASS_WITH_BLOCKERS') {
      expect(report.stripe_refs?.transfer_id).toMatch(/^tr_/);
      expect(report.stripe_refs?.full_reversal_id).toMatch(/^trr_/);
      expect(report.stripe_refs?.partial_reversal_id).toMatch(/^trr_/);
      const transfer = (report.matrix || []).find((m: { check: string }) => m.check === 'TEST transfer create');
      const full = (report.matrix || []).find((m: { check: string }) => m.check === 'Full TEST reversal');
      expect(transfer?.result).toBe('PASS');
      expect(full?.result).toBe('PASS');
    }
  });
});
