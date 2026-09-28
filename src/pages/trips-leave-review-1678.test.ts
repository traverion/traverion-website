import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1678: Trips offers Leave a review on eligible past trips', () => {
  it('wires bookingEligibleForReview to a Leave a review CTA', () => {
    const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1678');
    expect(src).toContain('bookingEligibleForReview');
    expect(src).toContain('Leave a review');
  });
});
