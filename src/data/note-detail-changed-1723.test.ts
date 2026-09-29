import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1723: Trips notes use booking_detail_changed not guest_message', () => {
  it('note update notifies as booking_detail_changed with notes suffix', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1710/1723');
    expect(src).toContain("eventType: 'booking_detail_changed'");
    expect(src).toContain('supplier:booking_detail_changed:${row.id}:notes:');
    const noteBlock = src.slice(
      src.indexOf('Phase 1710/1723'),
      src.indexOf('Phase 1710/1723') + 400
    );
    expect(noteBlock).not.toContain("eventType: 'guest_message'");
  });
});
