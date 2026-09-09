import { describe, expect, it } from 'vitest';
import { stripeWebhookReplayDecision } from './stripe-webhook-replay';

describe('stripeWebhookReplayDecision', () => {
  const now = Date.parse('2026-09-10T00:00:00.000Z');

  it('treats processed and ignored as terminal (safe 200 duplicate)', () => {
    expect(stripeWebhookReplayDecision({ status: 'processed' })).toBe('terminal');
    expect(stripeWebhookReplayDecision({ status: 'ignored' })).toBe('terminal');
    expect(stripeWebhookReplayDecision({ status: 'PROCESSED' })).toBe('terminal');
  });

  it('always claims failed events so Stripe retries can finish work', () => {
    expect(
      stripeWebhookReplayDecision({
        status: 'failed',
        receivedAt: '2026-09-10T00:00:00.000Z',
        nowMs: now,
      })
    ).toBe('claim');
  });

  it('keeps recent received events in flight (do not double-process)', () => {
    expect(
      stripeWebhookReplayDecision({
        status: 'received',
        receivedAt: '2026-09-09T23:59:00.000Z',
        nowMs: now,
      })
    ).toBe('in_flight');
  });

  it('reclaims stale received events (crashed before markProcessed)', () => {
    expect(
      stripeWebhookReplayDecision({
        status: 'received',
        receivedAt: '2026-09-09T23:57:00.000Z',
        nowMs: now,
      })
    ).toBe('claim');
  });

  it('reclaims received with missing/invalid receivedAt', () => {
    expect(stripeWebhookReplayDecision({ status: 'received', receivedAt: null, nowMs: now })).toBe('claim');
    expect(stripeWebhookReplayDecision({ status: 'received', receivedAt: 'not-a-date', nowMs: now })).toBe(
      'claim'
    );
  });

  it('flags unknown statuses instead of acknowledging success', () => {
    expect(stripeWebhookReplayDecision({ status: 'weird' })).toBe('unknown');
    expect(stripeWebhookReplayDecision({ status: null })).toBe('unknown');
  });
});
