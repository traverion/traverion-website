import { describe, expect, it } from 'vitest';
import { presentCancellationCompletion } from './cancellation-completion';
import {
  cancellationEmailShouldQueue,
  deliveryResult,
  enqueueDecision,
  rowIsClaimable,
} from '../../supabase/functions/_shared/transactional-email-queue';

const payload = { from: 'Traverion <no-reply@traverion.com>', to: ['guest@example.com'], subject: 'Cancelled', text: 'Cancelled', html: '<p>Cancelled</p>' };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('cancellation completion and the email outbox', () => {
  it('shows success before the queue commit and does not wait for the provider', async () => {
    const events: { name: string; at: number }[] = [];
    const started = performance.now();
    const mark = (name: string) => events.push({ name, at: Math.round(performance.now() - started) });
    let providerAccepted = false;
    const provider = (async () => {
      await delay(180);
      providerAccepted = true;
      return { ok: true as const, id: 're_provider_1' };
    })();

    await presentCancellationCompletion({
      settle: async () => {
        await delay(25);
        mark('authoritative');
        return { phase: 'success' as const };
      },
      onSettled: () => mark('checkmark'),
      queue: async () => {
        await delay(40);
        mark('queue-commit');
        return { notice: 'queued' as const };
      },
      onQueued: () => mark('queued-label'),
    });

    expect(providerAccepted).toBe(false);
    const outcome = deliveryResult({
      attemptCount: 1,
      providerOk: true,
      providerMessageId: (await provider).id,
      nowMs: Date.now(),
    });
    mark('provider-accepted');
    expect(outcome.status).toBe('sent');
    expect(outcome.providerMessageId).toBe('re_provider_1');

    const at = (name: string) => events.find((event) => event.name === name)!.at;
    expect(at('checkmark')).toBeGreaterThanOrEqual(at('authoritative'));
    expect(at('checkmark')).toBeLessThan(at('queue-commit'));
    expect(at('queued-label')).toBeGreaterThanOrEqual(at('queue-commit'));
    expect(at('provider-accepted')).toBeGreaterThan(at('checkmark'));
    expect(at('checkmark')).toBeLessThan(80);
    expect(at('provider-accepted')).toBeGreaterThan(180);
  });

  it('keeps a partial cancellation partial when a notice fails to queue', async () => {
    const phases: string[] = [];
    await presentCancellationCompletion({
      settle: async () => ({ phase: 'partial' as const, rows: [{ ok: true }, { ok: false }] }),
      onSettled: (result) => phases.push(result.phase),
      queue: async () => {
        throw new Error('outbox down');
      },
      onQueued: (update) => phases.push(update.notice),
    });
    expect(phases).toEqual(['partial', 'failed']);
  });

  it('does not queue or relabel a complete failure', async () => {
    let queued = false;
    await presentCancellationCompletion({
      settle: async () => ({ phase: 'failure' as const }),
      onSettled: () => undefined,
      queue: async () => {
        queued = true;
        return { notice: 'queued' as const };
      },
    });
    expect(queued).toBe(false);
  });

  it('does not mark sent before provider acceptance, and retries a rejection', async () => {
    const pending = deliveryResult({
      attemptCount: 1,
      providerOk: false,
      error: 'mailbox unavailable',
      nowMs: Date.parse('2026-11-14T12:00:00.000Z'),
    });
    expect(pending.status).toBe('failed');
    expect(pending.providerMessageId).toBeNull();
    expect(pending.retryable).toBe(true);
    expect(pending.nextAttemptAt).toBe('2026-11-14T12:00:15.000Z');
    expect(rowIsClaimable({
      status: 'failed',
      payload,
      attemptCount: 1,
      nextAttemptAt: pending.nextAttemptAt,
    }, Date.parse('2026-11-14T12:00:15.000Z'))).toBe(true);

    const exhausted = deliveryResult({
      attemptCount: 5,
      providerOk: false,
      error: 'mailbox unavailable',
      nowMs: Date.parse('2026-11-14T12:00:00.000Z'),
    });
    expect(exhausted.retryable).toBe(false);
    expect(exhausted.nextAttemptAt).toBeNull();
    expect(exhausted.status).not.toBe('sent');
  });

  it('treats a duplicate enqueue and a refresh as the same queued job', () => {
    expect(enqueueDecision(null)).toBe('insert');
    expect(enqueueDecision('queued')).toBe('already_queued');
    expect(enqueueDecision('sending')).toBe('already_queued');
    expect(enqueueDecision('sent')).toBe('already_sent');
    expect(enqueueDecision('failed')).toBe('requeue');
    const stored = {
      status: 'queued',
      payload,
      attemptCount: 0,
      nextAttemptAt: null,
      lockedAt: null,
    };
    expect(rowIsClaimable(stored, Date.now())).toBe(true);
    expect(cancellationEmailShouldQueue('customer', 'cancellation_requested_by_supplier')).toBe(true);
    expect(cancellationEmailShouldQueue('customer', 'supplier_cancelled_choose_resolution')).toBe(true);
    expect(cancellationEmailShouldQueue('supplier', 'booking_cancelled')).toBe(true);
    expect(cancellationEmailShouldQueue('customer', 'booking_confirmed_paid')).toBe(false);
    expect(cancellationEmailShouldQueue('supplier', 'booking_detail_changed')).toBe(false);
  });

  it('reclaims a worker that died while sending, without calling the message sent', () => {
    const now = Date.parse('2026-11-14T12:10:00.000Z');
    expect(rowIsClaimable({
      status: 'sending',
      payload,
      attemptCount: 1,
      lockedAt: new Date(now - 3 * 60 * 1000).toISOString(),
    }, now)).toBe(true);
    expect(rowIsClaimable({
      status: 'sending',
      payload,
      attemptCount: 1,
      lockedAt: new Date(now - 30 * 1000).toISOString(),
    }, now)).toBe(false);
    expect(deliveryResult({ attemptCount: 2, providerOk: true, providerMessageId: 're_retry', nowMs: now }).status).toBe('sent');
  });
});
