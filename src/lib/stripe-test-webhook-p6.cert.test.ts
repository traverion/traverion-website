import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { webhookSigningSecrets } from './stripe-payment-mode';

const root = resolve(__dirname, '../..');
const webhook = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
const restore = readFileSync(resolve(root, 'scripts/p6-restore-traverion-webhooks.mjs'), 'utf8');
const delivery = readFileSync(resolve(root, 'scripts/p6-webhook-delivery-cert.mjs'), 'utf8');
const reportPath = resolve(root, '.tmp/p6-webhook-readiness/REPORT.md');
const deliveryJson = resolve(root, '.tmp/p6-webhook-readiness/DELIVERY.json');

describe('P6 production webhook readiness', () => {
  it('restore script targets Traverionapp only and preserves other projects', () => {
    expect(restore).toContain('xcopqllkulxfkpunetbc.supabase.co');
    expect(restore).toContain('gedktutbpfwnstcbffsc');
    expect(restore).toContain('preserve_other_project_endpoints');
    expect(restore).toContain('transfer.created');
    expect(restore).toContain('payout.paid');
    expect(restore).toContain('account.updated');
    expect(restore).toContain('connect: true');
    expect(restore).not.toMatch(/payout_execution_enabled[\s\S]{0,40}1/);
  });

  it('handler verifies multiple TEST secrets and bank-pays only on payout.paid', () => {
    expect(webhook).toContain('STRIPE_WEBHOOK_SECRET_CONNECT_TEST');
    expect(webhook).toContain('webhookSecretConnectTest');
    expect(webhook).toContain("event.type === 'payout.paid'");
    expect(webhook).toContain('mark_payout_period_bank_paid');
    expect(webhook).toContain("event.type === 'transfer.reversed'");
    expect(webhook).toContain("event.type === 'account.updated'");
    // transfer_completed must not call bank paid
    const transferBlock = webhook.slice(
      webhook.indexOf("event.type === 'transfer.created'"),
      webhook.indexOf('Connected-account bank payout lifecycle')
    );
    expect(transferBlock).not.toContain('mark_payout_period_bank_paid');
  });

  it('signing helper accepts platform + Connect TEST secrets', () => {
    const r = webhookSigningSecrets({
      livePaymentsEnabled: false,
      webhookSecret: 'whsec_a',
      webhookSecretTest: 'whsec_b',
      webhookSecretConnectTest: 'whsec_c',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates.map((c) => c.secret)).toEqual(['whsec_b', 'whsec_a', 'whsec_c']);
    }
  });

  it('delivery cert exercises Connect events without LIVE money APIs', () => {
    expect(delivery).toContain('transfer.created');
    expect(delivery).toContain('payout.paid');
    expect(delivery).toContain('account.updated');
    expect(delivery).toContain('duplicate_event_idempotent');
    expect(delivery).toContain('live_money: false');
  });

  it('latest P6 report exists when cert has been run', () => {
    if (!existsSync(reportPath)) return;
    const md = readFileSync(reportPath, 'utf8');
    expect(md).toContain('P6');
    expect(md).toMatch(/PASS_WITH_BLOCKERS|PASS/);
    expect(md).toContain('payout_execution_enabled');
    if (existsSync(deliveryJson)) {
      const d = JSON.parse(readFileSync(deliveryJson, 'utf8'));
      expect(d.live_money).toBe(false);
      expect(d.ok).toBe(true);
    }
  });
});
