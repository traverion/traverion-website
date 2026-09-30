import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1779: orphan-refund notify resolves auth email', () => {
  it('notifyTravelerCheckoutCaptureReversed falls back to getUserById email', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1779');
    const fn = src.slice(
      src.indexOf('export async function notifyTravelerCheckoutCaptureReversed'),
      src.indexOf('export async function promotePaidFromCheckoutSession')
    );
    expect(fn).toContain('getUserById');
    expect(fn).toContain('guest_user_id');
  });
});
