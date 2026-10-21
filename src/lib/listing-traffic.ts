/**
 * First-party listing traffic for Partner Analytics conversion.
 * No PII. Opaque session key. Deduped server-side per hour.
 */

import { recordListingTrafficEvent, type ListingTrafficEventType } from '../data/supabase-listing-traffic';

const SESSION_KEY = 'traverion.listing_traffic_session_v1';

function sessionKey(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const next =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `m${Date.now().toString(36)}`;
  }
}

const recent = new Map<string, number>();

/** Fire-and-forget traffic event. Safe to call repeatedly; client + server dedupe. */
export function trackListingTraffic(listingId: string, eventType: ListingTrafficEventType): void {
  const id = listingId.trim();
  if (!id) return;
  const key = `${id}:${eventType}`;
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < 8_000) return;
  recent.set(key, now);
  void recordListingTrafficEvent({
    listingId: id,
    eventType,
    sessionKey: sessionKey(),
  });
}
