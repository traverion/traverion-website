import { describe, expect, it } from 'vitest';
import { bookingOccupiesInventory, CHECKOUT_HOLD_MINUTES } from './booking-hold';
import { checkoutPaymentStatusCanResume, checkoutResumeLostRaceToPaid } from './checkout-resume';
import { bookingConfirmationPhase } from './booking-confirmation-copy';
import {
  isStayRequestAwaitingHost,
  stayRequestIsCapturePending,
  stayRequestLifecycleLabel,
} from './stay-request-approval';
import { bookingPaymentWasCollected, isPaidPaymentStatus } from './payment-states';

describe('stay booking reliability invariants', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('instant-book pending holds occupy inventory for 60 minutes when hold_expires_at is set', () => {
    expect(CHECKOUT_HOLD_MINUTES).toBe(60);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-10-20T12:45:00.000Z',
        },
        now
      )
    ).toBe(true);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'pending',
          hold_expires_at: '2026-10-20T11:00:00.000Z',
        },
        now
      )
    ).toBe(false);
  });

  it('authorized request-to-book holds inventory until hold expires (24h window)', () => {
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'authorized',
          hold_expires_at: '2026-10-21T12:00:00.000Z',
        },
        now
      )
    ).toBe(true);
    expect(
      bookingOccupiesInventory(
        {
          status: 'pending',
          payment_status: 'authorized',
          hold_expires_at: '2026-10-20T11:00:00.000Z',
        },
        now
      )
    ).toBe(false);
  });

  it('does not treat authorized as collected/paid or resumable checkout', () => {
    expect(isPaidPaymentStatus('authorized')).toBe(false);
    expect(bookingPaymentWasCollected('authorized')).toBe(false);
    expect(checkoutPaymentStatusCanResume('authorized')).toBe(false);
    expect(checkoutResumeLostRaceToPaid('authorized')).toBe(true);
  });

  it('confirmation phases separate awaiting host vs capture settling', () => {
    expect(
      bookingConfirmationPhase({
        status: 'pending',
        payment_status: 'authorized',
        approval_status: 'pending',
      })
    ).toBe('received');
    expect(
      bookingConfirmationPhase({
        status: 'pending',
        payment_status: 'authorized',
        approval_status: 'accepted',
      })
    ).toBe('confirming');
    expect(
      bookingConfirmationPhase({
        status: 'confirmed',
        payment_status: 'paid',
        approval_status: 'accepted',
      })
    ).toBe('confirmed');
  });

  it('lifecycle labels match traveler-facing stay request states', () => {
    const pending = {
      status: 'pending',
      payment_status: 'authorized',
      approval_status: 'pending',
      approval_expires_at: '2099-01-01T00:00:00.000Z',
    };
    expect(isStayRequestAwaitingHost(pending)).toBe(true);
    expect(stayRequestLifecycleLabel(pending)).toBe('Pending host approval');
    expect(
      stayRequestIsCapturePending({
        approval_status: 'accepted',
        payment_status: 'authorized',
      })
    ).toBe(true);
  });
});
