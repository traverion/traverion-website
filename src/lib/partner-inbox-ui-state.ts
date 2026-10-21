/**
 * Persist lightweight Inbox UI across Booking Details navigation (filters, list scroll).
 * Drafts stay in BookingMessageThread's in-memory panelDrafts map for the session.
 */

const KEY = 'traverion.partner.inbox.ui.v1';

export type PartnerInboxUiState = {
  q?: string;
  unread?: boolean;
  listScroll?: number;
};

export function readPartnerInboxUiState(): PartnerInboxUiState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerInboxUiState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writePartnerInboxUiState(next: PartnerInboxUiState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPartnerInboxUiState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
