import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1712: cancel request email per request id', () => {
  it('notifyTravelerCancellationRequest suffixes idempotency with requestId', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(src).toContain('Phase 1712');
    expect(src).toContain('customer:cancellation_requested_by_supplier:${params.bookingId}:${reqSuffix}');
    expect(src).not.toMatch(
      /idempotencyKey: `customer:cancellation_requested_by_supplier:\$\{params\.bookingId\}`/
    );
  });

  it('SupplierBookings passes res.id as requestId', () => {
    const src = readFileSync(resolve(__dirname, '../pages/supplier/SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1712');
    expect(src).toContain('requestId: res.id');
  });
});
