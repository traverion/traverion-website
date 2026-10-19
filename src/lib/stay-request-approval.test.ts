import { describe, expect, it } from 'vitest';
import {
  isStayRequestAwaitingHost,
  nextStayApprovalStatus,
  planStayRequestAcceptCapture,
  stayRequestCanAccept,
  stayRequestCaptureFailureApproval,
  stayRequestIsCapturePending,
  stayRequestIsConfirmedPaid,
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
    expect(
      stayRequestCanAccept({ ...pending, approval_status: 'accepted', payment_status: 'authorized' })
    ).toBe(false);
  });

  it('validates transitions including capture failure revert', () => {
    expect(nextStayApprovalStatus(null, 'authorize')).toBe('pending');
    expect(nextStayApprovalStatus('pending', 'accept')).toBe('accepted');
    expect(nextStayApprovalStatus('pending', 'decline')).toBe('declined');
    expect(nextStayApprovalStatus('pending', 'expire')).toBe('expired');
    expect(nextStayApprovalStatus('accepted', 'decline')).toBeNull();
    expect(nextStayApprovalStatus('accepted', 'capture_failed')).toBe('pending');
    expect(nextStayApprovalStatus('accepted', 'capture_verified')).toBe('accepted');
    expect(stayRequestCaptureFailureApproval()).toBe('pending');
  });

  it('labels lifecycle states for travelers', () => {
    expect(stayRequestLifecycleLabel(pending)).toBe('Pending host approval');
    expect(
      stayRequestLifecycleLabel({ ...pending, approval_status: 'accepted', payment_status: 'authorized' })
    ).toBe('Accepted · confirming payment');
    expect(
      stayRequestLifecycleLabel({ ...pending, approval_status: 'accepted', payment_status: 'paid' })
    ).toBe('Confirmed');
  });

  it('detects capture-pending vs confirmed-paid', () => {
    expect(
      stayRequestIsCapturePending({
        approval_status: 'accepted',
        payment_status: 'authorized',
      })
    ).toBe(true);
    expect(
      stayRequestIsConfirmedPaid({
        approval_status: 'accepted',
        payment_status: 'paid',
      })
    ).toBe(true);
    expect(
      stayRequestIsCapturePending({
        approval_status: 'accepted',
        payment_status: 'paid',
      })
    ).toBe(false);
  });

  it('plans Accept so paid only follows verified capture', () => {
    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'pending',
        piStatus: 'requires_capture',
      })
    ).toEqual({ kind: 'claim_then_capture_then_finalize' });

    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'accepted',
        piStatus: 'requires_capture',
      })
    ).toEqual({ kind: 'capture_then_finalize' });

    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'accepted',
        piStatus: 'succeeded',
      })
    ).toEqual({ kind: 'finalize_only' });

    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'paid',
        approvalStatus: 'accepted',
        piStatus: 'succeeded',
      })
    ).toEqual({ kind: 'finalize_only' });

    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'pending',
        piStatus: 'requires_capture',
        expired: true,
      })
    ).toEqual({ kind: 'reject', reason: 'expired' });

    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'pending',
        piStatus: 'canceled',
      })
    ).toEqual({ kind: 'reject', reason: 'not_capturable' });

    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'pending',
        approvalStatus: 'pending',
        piStatus: 'requires_capture',
      })
    ).toEqual({ kind: 'reject', reason: 'wrong_state' });
  });

  it('never plans marking paid before capture for a fresh accept', () => {
    const plan = planStayRequestAcceptCapture({
      paymentStatus: 'authorized',
      approvalStatus: 'pending',
      piStatus: 'requires_capture',
    });
    expect(plan.kind).toBe('claim_then_capture_then_finalize');
    expect(plan.kind).not.toBe('finalize_only');
  });

  it('handles interrupted capture: claimed accepted+authorized resumes capture then finalize', () => {
    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'accepted',
        piStatus: 'requires_capture',
      })
    ).toEqual({ kind: 'capture_then_finalize' });
  });

  it('handles capture-succeeded crash: finalize_only without re-capture', () => {
    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'authorized',
        approvalStatus: 'accepted',
        piStatus: 'succeeded',
      })
    ).toEqual({ kind: 'finalize_only' });
  });

  it('handles concurrent duplicate Accept after paid as finalize_only', () => {
    expect(
      planStayRequestAcceptCapture({
        paymentStatus: 'paid',
        approvalStatus: 'accepted',
        piStatus: 'succeeded',
      })
    ).toEqual({ kind: 'finalize_only' });
  });

  it('rejects failed capture statuses so DB cannot be marked paid', () => {
    for (const piStatus of ['canceled', 'requires_payment_method', 'processing']) {
      expect(
        planStayRequestAcceptCapture({
          paymentStatus: 'authorized',
          approvalStatus: 'accepted',
          piStatus,
        })
      ).toEqual({ kind: 'reject', reason: 'not_capturable' });
    }
  });
});
