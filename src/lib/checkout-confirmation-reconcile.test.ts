import { describe, expect, it } from 'vitest';
import {
  confirmationShouldReconcileCheckout,
  confirmationStillWaitingAfterReconcile,
} from './checkout-confirmation-reconcile';

describe('confirmationShouldReconcileCheckout', () => {
  it('reconciles once while confirming after a few polls', () => {
    expect(
      confirmationShouldReconcileCheckout({
        phase: 'confirming',
        pollCount: 3,
        reconcileAttempted: false,
      })
    ).toBe(true);
    expect(
      confirmationShouldReconcileCheckout({
        phase: 'confirming',
        pollCount: 3,
        reconcileAttempted: true,
      })
    ).toBe(false);
    expect(
      confirmationShouldReconcileCheckout({
        phase: 'confirmed',
        pollCount: 5,
        reconcileAttempted: false,
      })
    ).toBe(false);
  });
});

describe('confirmationStillWaitingAfterReconcile', () => {
  it('detects a stalled confirming state after reconcile + poll cap', () => {
    expect(
      confirmationStillWaitingAfterReconcile({
        phase: 'confirming',
        reconcileAttempted: true,
        pollCount: 18,
      })
    ).toBe(true);
    expect(
      confirmationStillWaitingAfterReconcile({
        phase: 'confirming',
        reconcileAttempted: false,
        pollCount: 18,
      })
    ).toBe(false);
  });
});
