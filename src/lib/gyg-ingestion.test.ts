import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GYG_PRODUCTION_INGESTION_APPROVED,
  acceptGygEvent,
  gygIdempotencyKey,
  gygIngestionEnabled,
  gygRetryDecision,
} from '../../supabase/functions/_shared/gyg-ingestion';

const booking = {
  externalId: 'gyg-100',
  eventType: 'booking' as const,
  productId: 'prod-1',
  startsAt: '2026-12-01T09:00:00Z',
};

describe('GetYourGuide ingestion stays disabled', () => {
  it('refuses production ingestion even when the env flag is on', () => {
    expect(GYG_PRODUCTION_INGESTION_APPROVED).toBe(false);
    expect(gygIngestionEnabled({ envFlag: '1' })).toEqual({
      enabled: false,
      reason: 'GetYourGuide production ingestion is not approved.',
    });
  });

  it('accepts an event once and treats the same external id as a duplicate', () => {
    const first = acceptGygEvent(new Set(), booking);
    expect(first.result).toBe('accepted');
    if (first.result !== 'accepted') return;
    const second = acceptGygEvent(new Set([first.key]), booking);
    expect(second).toEqual({ result: 'duplicate', key: gygIdempotencyKey(booking) });
  });

  it('rejects an incomplete event and retries only transient failures', () => {
    expect(acceptGygEvent(new Set(), { ...booking, externalId: ' ' }).result).toBe('invalid');
    expect(gygRetryDecision({ attempt: 1, httpStatus: 503 })).toBe('retry');
    expect(gygRetryDecision({ attempt: 5, httpStatus: 503 })).toBe('stop');
    expect(gygRetryDecision({ attempt: 1, httpStatus: 400 })).toBe('stop');
    expect(gygRetryDecision({ attempt: 1, httpStatus: 409 })).toBe('stop');
  });

  it('keeps the edge handler closed', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../supabase/functions/gyg-booking-ingestion/index.ts'),
      'utf8'
    );
    expect(source).toContain('gygIngestionEnabled');
    expect(source).not.toContain('api.getyourguide.com');
  });
});
