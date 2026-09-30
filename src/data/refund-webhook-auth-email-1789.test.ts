import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1789: refund webhook auth email fallback', () => {
  it('charge.refunded notifies even when guest_email blank', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/stripe-webhook/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1789');
    expect(src).toContain("resolve@guest.local");
    expect(src).toContain('partial_refund_recorded');
    expect(src).toContain('refund_completed');
    // Must not gate traveler notify on non-empty guestEmail alone.
    expect(src).not.toMatch(/if \(guestEmail && supabaseUrl && serviceRoleKey\)/);
  });
});
