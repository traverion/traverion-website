import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1611: Auth deep-link next destination hint', () => {
  it('explains return to Saved or Trips when next is wishlist or bookings', () => {
    const src = readFileSync(resolve(__dirname, 'AuthPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1611');
    expect(src).toContain('After you log in, we will take you to Saved.');
    expect(src).toContain('After you log in, we will take you to Trips.');
    expect(src).toMatch(/nextPage === 'wishlist' \|\| nextPage === 'bookings'/);
  });
});
