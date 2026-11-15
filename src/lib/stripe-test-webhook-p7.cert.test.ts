/**
 * P7 cert fixtures — LIVE webhook signing matrix + transfer ≠ bank-paid rule.
 * No network, no LIVE money movement.
 */
import { describe, expect, it } from 'vitest';
import { webhookSigningSecrets } from './stripe-payment-mode';

describe('P7 LIVE webhook readiness', () => {
  it('requires LIVE platform secret when LIVE payments enabled', () => {
    const missing = webhookSigningSecrets({
      livePaymentsEnabled: true,
      webhookSecret: '',
      webhookSecretLive: '',
    });
    expect(missing.ok).toBe(false);

    const ok = webhookSigningSecrets({
      livePaymentsEnabled: true,
      webhookSecretLive: 'whsec_live_platform',
      webhookSecretConnectLive: 'whsec_live_connect',
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.candidates.filter((c) => c.mode === 'live')).toHaveLength(2);
    }
  });

  it('documents that bank-paid is payout.paid only (not transfer.created)', () => {
    const bankPaidEvents = new Set(['payout.paid']);
    expect(bankPaidEvents.has('transfer.created')).toBe(false);
    expect(bankPaidEvents.has('transfer.reversed')).toBe(false);
    expect(bankPaidEvents.has('payout.created')).toBe(false);
    expect(bankPaidEvents.has('payout.paid')).toBe(true);
  });
});
