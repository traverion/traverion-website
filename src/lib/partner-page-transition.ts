/**
 * Partner main-pane enter direction (Inbox ↔ Booking Details) + Inbox return identity.
 * Essential booking identity still lives in the URL; this only complements UX.
 */

const TRANSITION_KEY = 'traverion.partner.page.transition.v1';
const RETURN_KEY = 'traverion.partner.inbox.return.v1';

export type PartnerPageTransitionDir = 'forward' | 'back';

export type PartnerInboxReturnState = {
  bookingId: string;
};

export function markPartnerPageTransition(dir: PartnerPageTransitionDir): void {
  try {
    sessionStorage.setItem(TRANSITION_KEY, dir);
  } catch {
    /* ignore */
  }
}

/** Read and clear the pending enter direction (once per navigation). */
export function consumePartnerPageTransition(): PartnerPageTransitionDir | null {
  try {
    const raw = sessionStorage.getItem(TRANSITION_KEY);
    sessionStorage.removeItem(TRANSITION_KEY);
    if (raw === 'forward' || raw === 'back') return raw;
    return null;
  } catch {
    return null;
  }
}

export function rememberPartnerInboxReturn(bookingId: string): void {
  const id = bookingId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ bookingId: id } satisfies PartnerInboxReturnState));
  } catch {
    /* ignore */
  }
}

export function readPartnerInboxReturn(): PartnerInboxReturnState | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerInboxReturnState;
    const bookingId = typeof parsed?.bookingId === 'string' ? parsed.bookingId.trim() : '';
    return bookingId ? { bookingId } : null;
  } catch {
    return null;
  }
}

export function clearPartnerInboxReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
}

/** True when Booking Details should offer Back to Inbox for this booking. */
export function partnerInboxReturnMatches(bookingId: string | null | undefined): boolean {
  if (!bookingId) return false;
  return readPartnerInboxReturn()?.bookingId === bookingId;
}
