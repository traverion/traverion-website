/**
 * Soft cache for Income & Payouts hub remounts (e.g. after /partner/verification).
 * Prevents three empty skeleton cards when returning to Settings while money reloads.
 * Never stores bank credentials or identity documents.
 */

export type IncomeHubCachePayload = {
  userId: string;
  at: number;
  earnings: unknown[];
  paidBookings: unknown[];
  refundDueBookings: unknown[];
  ledger: unknown[];
  commercialTerms: unknown | null;
  earningItems: unknown[];
  snapshots: unknown[];
  payoutPeriods: unknown[];
  financialHolds: unknown[];
  listingTitles: Record<string, string>;
};

const TTL_MS = 90_000;
let cache: IncomeHubCachePayload | null = null;

export function readIncomeHubCache(userId: string): IncomeHubCachePayload | null {
  if (!cache || cache.userId !== userId) return null;
  if (Date.now() - cache.at > TTL_MS) return null;
  return cache;
}

export function writeIncomeHubCache(payload: Omit<IncomeHubCachePayload, 'at'>): void {
  cache = { ...payload, at: Date.now() };
}

export function clearIncomeHubCache(userId?: string): void {
  if (!userId || cache?.userId === userId) cache = null;
}
