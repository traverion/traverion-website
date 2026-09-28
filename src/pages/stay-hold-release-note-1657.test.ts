import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1657: Stay hold note release-on-expiry', () => {
  it('mentions hold release when checkout expires', () => {
    const src = readFileSync(resolve(__dirname, 'StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1657');
    expect(src).toContain('If checkout expires, the hold is released.');
  });
});
