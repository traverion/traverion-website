import { describe, expect, it } from 'vitest';
import {
  isCheckoutInventoryConflictError,
  isMissingPostgresFunctionError,
} from './checkout-inventory-conflict';

describe('isCheckoutInventoryConflictError', () => {
  it('matches inventory assert conflict messages', () => {
    expect(isCheckoutInventoryConflictError('Those nights are already booked.')).toBe(true);
    expect(isCheckoutInventoryConflictError('Not enough capacity left for this date.')).toBe(true);
    expect(isCheckoutInventoryConflictError('Not enough capacity left for this departure.')).toBe(true);
    expect(isCheckoutInventoryConflictError('Slot occupied')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isCheckoutInventoryConflictError('Listing is required.')).toBe(false);
    expect(isCheckoutInventoryConflictError(null)).toBe(false);
  });
});

describe('isMissingPostgresFunctionError (Phase 1096)', () => {
  it('detects PostgREST missing-function / schema-cache errors', () => {
    expect(isMissingPostgresFunctionError('Could not find the function public.assert_checkout_inventory')).toBe(
      true
    );
    expect(isMissingPostgresFunctionError('schema cache')).toBe(true);
    expect(isMissingPostgresFunctionError('Those nights are already booked.')).toBe(false);
    expect(isMissingPostgresFunctionError(null)).toBe(false);
  });
});
