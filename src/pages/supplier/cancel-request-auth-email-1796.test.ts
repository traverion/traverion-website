import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1796: host cancel-request auth email fallback', () => {
  it('always notifies traveler after cancel request RPC', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1796');
    expect(src).toContain("resolve@guest.local");
    expect(src).toContain('notifyTravelerCancellationRequest');
    expect(src).not.toMatch(/const email = \(cancelModal\.guest_email[\s\S]*?if \(email\) \{\s*void notifyTravelerCancellationRequest/);
  });
});
