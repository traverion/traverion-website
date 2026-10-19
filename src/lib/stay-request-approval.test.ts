import { describe, expect, it } from 'vitest';
import {
  isStayRequestAwaitingHost,
  nextStayApprovalStatus,
  stayRequestCanAccept,
  stayRequestLifecycleLabel,
} from './stay-request-approval';

describe('stay request approval', () => {
  const pending = {
    status: 'pending',
    payment_status: 'authorized',
    approval_status: 'pending',
    approval_expires_at: '2099-01-01T00:00:00.000Z',
  };

  it('allows accept/decline only while awaiting the host', () => {
    expect(isStayRequestAwaitingHost(pending)).toBe(true);
    expect(stayRequestCanAccept(pending)).toBe(true);
    expect(stayRequestCanAccept({ ...pending, approval_expires_at: '2000-01-01T00:00:00.000Z' })).toBe(false);
    expect(stayRequestCanAccept({ ...pending, approval_status: 'declined' })).toBe(false);
  });

  it('validates transitions', () => {
    expect(nextStayApprovalStatus(null, 'authorize')).toBe('pending');
    expect(nextStayApprovalStatus('pending', 'accept')).toBe('accepted');
    expect(nextStayApprovalStatus('pending', 'decline')).toBe('declined');
    expect(nextStayApprovalStatus('pending', 'expire')).toBe('expired');
    expect(nextStayApprovalStatus('accepted', 'decline')).toBeNull();
  });

  it('labels lifecycle states for travelers', () => {
    expect(stayRequestLifecycleLabel(pending)).toBe('Pending host approval');
    expect(
      stayRequestLifecycleLabel({ ...pending, approval_status: 'accepted', payment_status: 'paid' })
    ).toBe('Confirmed');
  });
});
