import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1778: expire Checkout when booking update fails after create', () => {
  it('create-booking-checkout-session expires session on updateError', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1778');
    expect(src).toMatch(
      /if \(updateError\) \{[\s\S]*?sessions\.expire\(session\.id\)[\s\S]*?Checkout created but booking update failed/
    );
  });
});
