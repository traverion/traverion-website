/** Deno mirror of src/lib/stay-request-approval.ts (Accept capture planner). */

export type StayApprovalStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export function normalizeStayApprovalStatus(raw: unknown): StayApprovalStatus | null {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'pending' ||
    value === 'accepted' ||
    value === 'declined' ||
    value === 'expired' ||
    value === 'withdrawn'
    ? value
    : null;
}

export type StayAcceptCapturePlan =
  | { kind: 'reject'; reason: 'expired' | 'not_capturable' | 'wrong_state' }
  | { kind: 'finalize_only' }
  | { kind: 'claim_then_capture_then_finalize' }
  | { kind: 'capture_then_finalize' };

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
