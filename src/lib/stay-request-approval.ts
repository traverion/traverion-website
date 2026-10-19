/**
 * Request-to-Book approval lifecycle for Stay bookings.
 * Payment stays authorized until accept → capture, or decline/expire → release.
 */

export const STAY_APPROVAL_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'expired',
  'withdrawn',
] as const;

export type StayApprovalStatus = (typeof STAY_APPROVAL_STATUSES)[number];

export type StayRequestApprovalRow = {
  status?: string | null;
  payment_status?: string | null;
  approval_status?: string | null;
  approval_expires_at?: string | null;
  hold_expires_at?: string | null;
};

export function normalizeStayApprovalStatus(raw: unknown): StayApprovalStatus | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (STAY_APPROVAL_STATUSES as readonly string[]).includes(value)
    ? (value as StayApprovalStatus)
    : null;
}

export function isStayRequestAwaitingHost(row: StayRequestApprovalRow, nowMs: number = Date.now()): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  if (normalizeStayApprovalStatus(row.approval_status) !== 'pending') return false;
  const pay = (row.payment_status ?? '').trim().toLowerCase();
  if (pay !== 'authorized' && pay !== 'pending') return false;
  const expRaw = row.approval_expires_at ?? row.hold_expires_at;
  if (!expRaw) return true;
  const exp = Date.parse(expRaw);
  return Number.isFinite(exp) && exp > nowMs;
}

export function stayRequestCanAccept(row: StayRequestApprovalRow, nowMs: number = Date.now()): boolean {
  return isStayRequestAwaitingHost(row, nowMs);
}

export function stayRequestCanDecline(row: StayRequestApprovalRow, nowMs: number = Date.now()): boolean {
  return isStayRequestAwaitingHost(row, nowMs);
}

export function stayRequestCanWithdraw(row: StayRequestApprovalRow, nowMs: number = Date.now()): boolean {
  return isStayRequestAwaitingHost(row, nowMs);
}

export function stayRequestIsExpired(row: StayRequestApprovalRow, nowMs: number = Date.now()): boolean {
  if (normalizeStayApprovalStatus(row.approval_status) === 'expired') return true;
  if (normalizeStayApprovalStatus(row.approval_status) !== 'pending') return false;
  const expRaw = row.approval_expires_at ?? row.hold_expires_at;
  if (!expRaw) return false;
  const exp = Date.parse(expRaw);
  return Number.isFinite(exp) && exp <= nowMs;
}

export type StayApprovalTransition =
  | 'authorize'
  | 'accept'
  | 'decline'
  | 'expire'
  | 'withdraw'
  | 'capture_failed';

/** Pure transition table — server enforces the same rules. */
export function nextStayApprovalStatus(
  current: StayApprovalStatus | null,
  action: StayApprovalTransition
): StayApprovalStatus | null {
  if (action === 'authorize') return current == null || current === 'pending' ? 'pending' : null;
  if (!current || current !== 'pending') return null;
  if (action === 'accept') return 'accepted';
  if (action === 'decline') return 'declined';
  if (action === 'expire') return 'expired';
  if (action === 'withdraw') return 'withdrawn';
  if (action === 'capture_failed') return 'pending';
  return null;
}

export function stayRequestLifecycleLabel(row: StayRequestApprovalRow, nowMs: number = Date.now()): string {
  const approval = normalizeStayApprovalStatus(row.approval_status);
  if (approval === 'accepted' && (row.payment_status ?? '').toLowerCase() === 'paid') return 'Confirmed';
  if (approval === 'accepted') return 'Accepted · confirming payment';
  if (approval === 'declined') return 'Declined';
  if (approval === 'expired' || stayRequestIsExpired(row, nowMs)) return 'Expired';
  if (approval === 'withdrawn') return 'Withdrawn';
  if (approval === 'pending' || isStayRequestAwaitingHost(row, nowMs)) return 'Pending host approval';
  return 'Request';
}
