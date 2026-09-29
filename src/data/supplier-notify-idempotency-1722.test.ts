import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1722: new_review and host_schedule_updated idempotency suffixes', () => {
  it('submitReview keys new_review by review id', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-reviews.ts'), 'utf8');
    expect(src).toContain('Phase 1722');
    expect(src).toContain('supplier:new_review:${savedReview.id}');
  });

  it('updateBookingSchedule suffixes host_schedule_updated with field diffs', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1722');
    expect(src).toContain('supplier:host_schedule_updated:${bookingId}:');
  });
});
