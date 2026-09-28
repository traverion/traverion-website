/**
 * Phase 1510: transactional email idempotency keys must stay scoped to the
 * current channel + template kind. Callers may append suffixes within that
 * namespace (e.g. field-diff hashes) but must not supply a key for a different
 * kind — that would let a party JWT poison booking_confirmed_paid /
 * refund_completed send slots via your_details_updated / booking_cancelled.
 */

export function defaultCustomerEmailIdempotencyKey(
  kind: string,
  bookingId?: string | null,
  email?: string | null
): string {
  const k = (kind ?? '').trim();
  const bid = (bookingId ?? '').trim();
  if (bid) return `customer:${k}:${bid}`;
  return `customer:${k}:${(email ?? '').trim().toLowerCase()}`;
}

export function defaultSupplierEmailIdempotencyKey(
  eventType: string,
  supplierId: string,
  bookingId?: string | null
): string {
  const ev = (eventType ?? '').trim();
  const bid = (bookingId ?? '').trim();
  if (bid) return `supplier:${ev}:${bid}`;
  return `supplier:${ev}:${(supplierId ?? '').trim()}`;
}

/**
 * Accept client key only when it stays under `customer:${kind}:…`.
 * Otherwise ignore it and use the canonical default for this send.
 */
export function resolveCustomerEmailIdempotencyKey(params: {
  kind: string;
  bookingId?: string | null;
  email?: string | null;
  clientKey?: string | null;
}): string {
  const fallback = defaultCustomerEmailIdempotencyKey(
    params.kind,
    params.bookingId,
    params.email
  );
  const kind = (params.kind ?? '').trim();
  if (!kind) return fallback;
  const prefix = `customer:${kind}:`;
  const client = typeof params.clientKey === 'string' ? params.clientKey.trim() : '';
  if (client.startsWith(prefix) && client.length > prefix.length) {
    return client;
  }
  return fallback;
}

/**
 * Accept client key only when it stays under `supplier:${eventType}:…`.
 */
export function resolveSupplierEmailIdempotencyKey(params: {
  eventType: string;
  supplierId: string;
  bookingId?: string | null;
  clientKey?: string | null;
}): string {
  const fallback = defaultSupplierEmailIdempotencyKey(
    params.eventType,
    params.supplierId,
    params.bookingId
  );
  const eventType = (params.eventType ?? '').trim();
  if (!eventType) return fallback;
  const prefix = `supplier:${eventType}:`;
  const client = typeof params.clientKey === 'string' ? params.clientKey.trim() : '';
  if (client.startsWith(prefix) && client.length > prefix.length) {
    return client;
  }
  return fallback;
}
