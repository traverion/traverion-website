import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1634: Account logged-out copy says Saved', () => {
  it('uses Saved instead of wishlist in the subtitle', () => {
    const src = readFileSync(resolve(__dirname, 'AccountPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1634');
    expect(src).toContain('Log in to manage trips, Saved, and your traveler profile.');
    expect(src).not.toContain('manage trips, wishlist');
  });
});
