import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1787: check expire-booking-checkout invoke result', () => {
  it('inspects error and success=false after await', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-bookings.ts'), 'utf8');
    expect(src).toContain('Phase 1787');
    expect(src).toMatch(
      /const \{ data, error \} = await supabase\.functions\.invoke\('expire-booking-checkout'/
    );
    expect(src).toMatch(/if \(error\)/);
    expect(src).toMatch(/success === false/);
    expect(src).toContain('expire-booking-checkout failed after cancel');
  });
});
