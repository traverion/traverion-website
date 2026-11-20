/**
 * GetYourGuide booking ingestion contract.
 * Production ingestion stays off until GYG_PRODUCTION_INGESTION_APPROVED is changed
 * after a separate approval. This module does not call GetYourGuide.
 */

export const GYG_PRODUCTION_INGESTION_APPROVED = false;

export type GygEventType = 'booking' | 'cancellation' | 'availability';

export type GygInboundEvent = {
  externalId: string;
  eventType: GygEventType;
  productId: string;
  startsAt: string;
};

export function gygIngestionEnabled(input: {
  envFlag: string | null | undefined;
  approved?: boolean;
}): { enabled: false; reason: string } | { enabled: true } {
  const approved = input.approved ?? GYG_PRODUCTION_INGESTION_APPROVED;
  if (!approved) {
    return { enabled: false, reason: 'GetYourGuide production ingestion is not approved.' };
  }
  if ((input.envFlag ?? '').trim() !== '1') {
    return { enabled: false, reason: 'GetYourGuide ingestion is disabled.' };
  }
  return { enabled: true };
}

export function gygIdempotencyKey(event: Pick<GygInboundEvent, 'eventType' | 'externalId'>): string {
  return `gyg:${event.eventType}:${event.externalId.trim()}`;
}

export function acceptGygEvent(
  existingKeys: ReadonlySet<string>,
  event: GygInboundEvent
): { result: 'invalid'; reason: string } | { result: 'duplicate'; key: string } | { result: 'accepted'; key: string } {
  if (!event.externalId.trim() || !event.productId.trim() || !event.startsAt.trim()) {
    return { result: 'invalid', reason: 'external id, product, and start time are required' };
  }
  if (!['booking', 'cancellation', 'availability'].includes(event.eventType)) {
    return { result: 'invalid', reason: 'unsupported event type' };
  }
  const key = gygIdempotencyKey(event);
  if (existingKeys.has(key)) return { result: 'duplicate', key };
  return { result: 'accepted', key };
}

/** Retry transient provider and gateway failures. Do not retry a duplicate or a client error. */
export function gygRetryDecision(input: { attempt: number; httpStatus: number }): 'retry' | 'stop' {
  const transient = input.httpStatus === 429 || (input.httpStatus >= 500 && input.httpStatus <= 504);
  if (!transient) return 'stop';
  return input.attempt < 5 ? 'retry' : 'stop';
}
