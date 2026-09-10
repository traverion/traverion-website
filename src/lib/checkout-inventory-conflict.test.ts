import { describe, expect, it } from 'vitest';
import { isCheckoutInventoryConflictError } from './checkout-inventory-conflict';

describe('isCheckoutInventoryConflictError', () => {
  it('matches inventory assert conflict messages', () => {
    expect(isCheckoutInventoryConflictError('Those nights are already booked.')).toBe(true);
    expect(isCheckoutInventoryConflictError('Not enough capacity left for this date.')).toBe(true);
    expect(isCheckoutInventoryConflictError('Slot occupied')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isCheckoutInventoryConflictError('Listing is required.')).toBe(false);
    expect(isCheckoutInventoryConflictError(null)).toBe(false);
  });
});
