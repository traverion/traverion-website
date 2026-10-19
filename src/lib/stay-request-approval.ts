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

/** Host accepted; Stripe capture not yet verified as paid. */
export function stayRequestIsCapturePending(row: StayRequestApprovalRow): boolean {
  if ((row.status ?? '').trim().toLowerCase() === 'cancelled') return false;
  if (normalizeStayApprovalStatus(row.approval_status) !== 'accepted') return false;
  return (row.payment_status ?? '').trim().toLowerCase() === 'authorized';
}

export function stayRequestIsConfirmedPaid(row: StayRequestApprovalRow): boolean {
  if (normalizeStayApprovalStatus(row.approval_status) !== 'accepted') return false;
  const pay = (row.payment_status ?? '').trim().toLowerCase();
  return pay === 'paid' || pay === 'complete' || pay === 'succeeded';
}

/**
 * Pure Accept planner — paid/confirmed only after Stripe capture is verified.
 * claim → capture → finalize. Never mark paid before capture succeeds.
 */
export type StayAcceptCapturePlan =
  | { kind: 'reject'; reason: 'expired' | 'not_capturable' | 'wrong_state' }
  | { kind: 'finalize_only' } // PI already succeeded; DB may still be authorized+accepted
  | { kind: 'claim_then_capture_then_finalize' } // pending+authorized
  | { kind: 'capture_then_finalize' }; // already claimed accepted+authorized

export function planStayRequestAcceptCapture(params: {
  paymentStatus?: string | null;
  approvalStatus?: string | null;
  status?: string | null;
  piStatus?: string | null;
  expired?: boolean;
}): StayAcceptCapturePlan {
  if ((params.status ?? '').trim().toLowerCase() === 'cancelled') {
    return { kind: 'reject', reason: 'wrong_state' };
  }
  const pay = (params.paymentStatus ?? '').trim().toLowerCase();
  const approval = normalizeStayApprovalStatus(params.approvalStatus);
  const pi = (params.piStatus ?? '').trim().toLowerCase();

  if (pay === 'paid' && approval === 'accepted') {
    return { kind: 'finalize_only' };
  }
  if (params.expired && approval === 'pending') {
    return { kind: 'reject', reason: 'expired' };
  }
  if (pi === 'succeeded') {
    if (pay === 'authorized' && (approval === 'accepted' || approval === 'pending')) {
      return { kind: 'finalize_only' };
    }
    if (pay === 'paid') return { kind: 'finalize_only' };
  }
  if (pi !== 'requires_capture' && pi !== 'succeeded') {
    return { kind: 'reject', reason: 'not_capturable' };
  }
  if (pay === 'authorized' && approval === 'pending') {
    return { kind: 'claim_then_capture_then_finalize' };
  }
  if (pay === 'authorized' && approval === 'accepted') {
    return { kind: 'capture_then_finalize' };
  }
  return { kind: 'reject', reason: 'wrong_state' };
}

/** After a failed capture attempt, approval should return to pending for retry/expire. */
export function stayRequestCaptureFailureApproval(): StayApprovalStatus {
  return 'pending';
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
  | 'capture_failed'
  | 'capture_verified';

/** Pure transition table — server enforces the same rules. */
export function nextStayApprovalStatus(
  current: StayApprovalStatus | null,
  action: StayApprovalTransition
): StayApprovalStatus | null {
  if (action === 'authorize') return current == null || current === 'pending' ? 'pending' : null;
  if (action === 'capture_verified') return current === 'accepted' ? 'accepted' : null;
  if (action === 'capture_failed') {
    return current === 'accepted' || current === 'pending' ? 'pending' : null;
  }
  if (!current || current !== 'pending') return null;
  if (action === 'accept') return 'accepted';
  if (action === 'decline') return 'declined';
  if (action === 'expire') return 'expired';
  if (action === 'withdraw') return 'withdrawn';
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
