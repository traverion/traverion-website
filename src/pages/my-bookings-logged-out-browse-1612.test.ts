import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1612: logged-out Trips empty browse CTAs', () => {
  it('offers Browse tours and stays beside Log in', () => {
    const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
    expect(src).toContain('Phase 1612');
    expect(src).toMatch(
      /Log in to see your trips[\s\S]*Phase 1612[\s\S]*Browse tours[\s\S]*Browse stays/
    );
  });
});
