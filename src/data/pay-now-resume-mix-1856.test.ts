import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1856: Pay-now resume rebuilds participant mix', () => {
  it('create-booking-checkout-session restores mix from guest_breakdown', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
      'utf8'
    );
    expect(src).toContain('participantMixFromGuestBreakdown');
    expect(src).toContain('guest_breakdown');
    expect(src).toMatch(
      /participantMix\s*=\s*participantMixFromGuestBreakdown\(row\.guest_breakdown\)/
    );
    expect(src).not.toMatch(/\/\/ Drop client participant mix[^\n]*\n\s*participantMix\s*=\s*null/);
  });
});
