/** Shared Partner Inbox / Today unread scan depth for paid bookings. */
export const PARTNER_INBOX_MESSAGE_FETCH_CAP = 80;

/** How many additional paid bookings each “Load older” expands by. */
export const PARTNER_INBOX_MESSAGE_FETCH_STEP = 80;

export function partnerInboxNextFetchCap(currentCap: number): number {
  const base = Math.max(PARTNER_INBOX_MESSAGE_FETCH_CAP, Math.floor(currentCap) || 0);
  return base + PARTNER_INBOX_MESSAGE_FETCH_STEP;
}
