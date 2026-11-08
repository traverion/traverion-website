import { describe, expect, it } from 'vitest';
import {
  assertSecretMatchesPublishable,
  isStripeLivePaymentsEnabledFlag,
  isStripeLiveSecretKey,
  isStripeTestSecretKey,
  resolveStripePublishableKey,
  resolveStripeSecretKey,
  stripeEventAccountDecision,
  stripeEventLivemodeDecision,
  stripeLiveSecretBlockedMessage,
  webhookSigningSecrets,
} from './stripe-payment-mode';

describe('stripe-payment-mode', () => {
  it('never enables LIVE from key material alone', () => {
    expect(isStripeLivePaymentsEnabledFlag(undefined)).toBe(false);
    expect(isStripeLivePaymentsEnabledFlag('')).toBe(false);
    expect(isStripeLivePaymentsEnabledFlag('0')).toBe(false);
    expect(isStripeLivePaymentsEnabledFlag('false')).toBe(false);
    expect(isStripeLivePaymentsEnabledFlag('1')).toBe(true);
    expect(isStripeLivePaymentsEnabledFlag('true')).toBe(true);

    const liveKeyWithoutFlag = resolveStripeSecretKey({
      secret: 'sk_live_abc',
      livePaymentsEnabledRaw: undefined,
    });
    expect(liveKeyWithoutFlag.ok).toBe(false);
    if (!liveKeyWithoutFlag.ok) {
      expect(liveKeyWithoutFlag.code).toBe('live_disabled');
      expect(liveKeyWithoutFlag.error).toMatch(/LIVE/);
    }
  });

  it('accepts TEST secrets when LIVE is disabled (default)', () => {
    const r = resolveStripeSecretKey({
      secret: 'sk_test_abc',
      livePaymentsEnabledRaw: '',
    });
    expect(r).toEqual({
      ok: true,
      mode: 'test',
      secret: 'sk_test_abc',
      livePaymentsEnabled: false,
    });
  });

  it('requires sk_live_ when LIVE flag is on (fail closed on TEST secret)', () => {
    const mismatch = resolveStripeSecretKey({
      secret: 'sk_test_abc',
      livePaymentsEnabledRaw: '1',
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe('live_requires_live_secret');

    const ok = resolveStripeSecretKey({
      secret: 'sk_live_abc',
      livePaymentsEnabledRaw: '1',
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.mode).toBe('live');
  });

  it('gates publishable keys the same way', () => {
    expect(
      resolveStripePublishableKey({
        publishableKey: 'pk_live_x',
        livePaymentsEnabledRaw: '',
      }).ok
    ).toBe(false);
    expect(
      resolveStripePublishableKey({
        publishableKey: 'pk_test_x',
        livePaymentsEnabledRaw: '',
      }).ok
    ).toBe(true);
    expect(
      resolveStripePublishableKey({
        publishableKey: 'pk_live_x',
        livePaymentsEnabledRaw: '1',
      }).ok
    ).toBe(true);
  });

  it('detects secret/publishable mode mismatch', () => {
    const bad = assertSecretMatchesPublishable({
      secretMode: 'test',
      publishableKey: 'pk_live_x',
    });
    expect(bad.ok).toBe(false);
    const good = assertSecretMatchesPublishable({
      secretMode: 'test',
      publishableKey: 'pk_test_x',
    });
    expect(good.ok).toBe(true);
  });

  it('webhook secrets: TEST-only when LIVE disabled', () => {
    const r = webhookSigningSecrets({
      livePaymentsEnabled: false,
      webhookSecret: 'whsec_test',
      webhookSecretLive: 'whsec_live',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates).toEqual([{ mode: 'test', secret: 'whsec_test' }]);
    }
  });

  it('webhook secrets: LIVE primary when LIVE enabled; optional TEST secondary', () => {
    const r = webhookSigningSecrets({
      livePaymentsEnabled: true,
      webhookSecret: 'whsec_test_primary',
      webhookSecretLive: 'whsec_live',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candidates[0]).toEqual({ mode: 'live', secret: 'whsec_live' });
      expect(r.candidates.some((c) => c.mode === 'test' && c.secret === 'whsec_test_primary')).toBe(
        true
      );
    }
  });

  it('ignores livemode mismatches so TEST events cannot mutate LIVE mode and vice versa', () => {
    expect(
      stripeEventLivemodeDecision({ eventLivemode: true, platformMode: 'test' })
    ).toEqual({ action: 'ignore', reason: 'livemode_mismatch' });
    expect(
      stripeEventLivemodeDecision({ eventLivemode: false, platformMode: 'live' })
    ).toEqual({ action: 'ignore', reason: 'livemode_mismatch' });
    expect(
      stripeEventLivemodeDecision({ eventLivemode: false, platformMode: 'test' })
    ).toEqual({ action: 'accept' });
  });

  it('pins unexpected Stripe account ids when configured', () => {
    expect(
      stripeEventAccountDecision({
        expectedAccountId: 'acct_platform',
        eventAccountId: 'acct_other',
      })
    ).toEqual({ action: 'ignore', reason: 'account_mismatch' });
    expect(
      stripeEventAccountDecision({
        expectedAccountId: '',
        eventAccountId: 'acct_other',
      })
    ).toEqual({ action: 'accept' });
  });

  it('keeps prefix helpers and blocked message', () => {
    expect(isStripeTestSecretKey('sk_test_x')).toBe(true);
    expect(isStripeLiveSecretKey('sk_live_x')).toBe(true);
    expect(stripeLiveSecretBlockedMessage()).toMatch(/STRIPE_LIVE_PAYMENTS_ENABLED/);
  });
});
