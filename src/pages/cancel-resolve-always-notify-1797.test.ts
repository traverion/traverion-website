import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1797: Accept/Decline always notifies', () => {
  it('does not gate notifyCancellationResolved on guest_email or supplier_id', () => {
    const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1797');
    expect(src).toContain('notifyCancellationResolved');
    expect(src).not.toMatch(/if \(b\.guest_email \|\| ops\?\.supplier_id\)/);
  });
});
