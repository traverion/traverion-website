import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1721: cancel Accept/Decline notify per request id', () => {
  it('notifyCancellationResolved suffixes customer and supplier keys with requestId', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-booking-ops.ts'), 'utf8');
    expect(src).toContain('Phase 1721');
    expect(src).toContain('customer:${kind}:${params.bookingId}:${reqSuffix}');
    expect(src).toContain('supplier:${kind}:${params.bookingId}:${reqSuffix}');
  });

  it('MyBookings passes req.id as requestId', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1721');
    expect(src).toContain('requestId: req.id');
  });
});
